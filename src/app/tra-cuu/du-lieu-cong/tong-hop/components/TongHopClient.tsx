'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { exportAttendanceWorkbook } from './exportWorkbook';
import RangeExportColumnsManager from './RangeExportColumnsManager';
import ExportRangeModal from './ExportRangeModal';
import ExportLeaveDaysModal from './ExportLeaveDaysModal';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { DEFAULT_ATTENDANCE_CONFIG, getPayrollPeriodForDate } from '@/lib/config/attendanceConfig';
import {
  ArrowLeft, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Loader2, BarChart3, AlertCircle, CheckCircle2, AlertTriangle,
  Users, Clock, Building2, RefreshCw, Download, Crown,
  Lock, Unlock, Pencil, Check, X,
  Square, CheckSquare, MinusSquare, CalendarRange, CalendarOff, Search,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HRSheet {
  id: string;
  user_id: string;
  user_name: string;
  company: string | null;
  department_id: string | null;
  dept_name: string | null;
  manager_id: string | null;
  manager_name: string | null;
  is_manager: boolean;
  is_company_level: boolean;
  dept_head_id: string | null;
  month: number;
  year: number;
  status: string;
  total_days: number;
  total_hours: number | string;
  total_ot_hours: number | string;
  submitted_at: string | null;
  sent_to_hr_at: string | null;
  hr_note: string | null;
  locked_at: string | null;
}

interface DeptGroup { deptId: string; deptName: string; manager: HRSheet|null; members: HRSheet[] }
interface CompanyGroup { company: string; depts: DeptGroup[] }

// ─── Constants ────────────────────────────────────────────────────────────────

const HCNS_DEPT_ID  = '74ab7673-13d6-404f-a576-5f4e87f8f7fa';
const WARN_LOW_DAYS = 20;
const WARN_HIGH_DAYS = 26;

const SHEET_STATUS: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Chưa nộp',    cls: 'bg-slate-500/15 text-ink-muted border-slate-500/30' },
  submitted: { label: 'Đã nộp',      cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  approved:  { label: 'Đã duyệt',    cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  rejected:  { label: 'Yêu cầu sửa', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtH(v: number | string) { return Number(v).toFixed(1); }
/** Chuẩn hóa tìm kiếm không dấu ("nguyen" khớp "Nguyễn"). */
function normalizeVi(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
}

/** Bộ lọc trạng thái của thanh công cụ — 'all' = không lọc. */
type StatusFilter = 'all' | 'warn' | 'approved' | 'pending' | 'locked' | 'unlocked';
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all',      label: 'Tất cả trạng thái' },
  { value: 'warn',     label: '⚠️ Có bất thường' },
  { value: 'approved', label: 'Đã duyệt' },
  { value: 'pending',  label: 'Chưa duyệt' },
  { value: 'locked',   label: 'Đã chốt' },
  { value: 'unlocked', label: 'Chưa chốt' },
];
function getInitials(n: string) { return n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }
const GRAD = ['from-indigo-500 to-purple-500','from-emerald-500 to-teal-500','from-amber-500 to-orange-500','from-pink-500 to-rose-500','from-cyan-500 to-blue-500'];
function grad(n: string) { let h=0; for(const c of n) h=c.charCodeAt(0)+((h<<5)-h); return GRAD[Math.abs(h)%GRAD.length]; }

function groupSheets(sheets: HRSheet[]): CompanyGroup[] {
  // Nhóm theo đơn vị hiệu lực từ org_assignments (API đã tính):
  // - Cấp công ty tường minh (is_company_level) → nhóm riêng 'Ban Lãnh Đạo & Văn Phòng Công Ty'
  // - Trưởng nhóm = người có user_id === dept_head_id (org_role='head'), KHÔNG đoán theo is_manager
  const map: Record<string, Record<string, { deptName:string; headId:string|null; members:HRSheet[] }>> = {};
  for (const sh of sheets) {
    const co  = sh.company ?? '(Chưa phân công ty)';
    const dk  = sh.is_company_level ? '__company__' : (sh.department_id ?? '__');
    const dn  = sh.dept_name ?? '(Chưa phân phòng ban)';
    if (!map[co]) map[co] = {};
    if (!map[co][dk]) map[co][dk] = { deptName: dn, headId: null, members: [] };
    if (sh.dept_head_id && !map[co][dk].headId) map[co][dk].headId = sh.dept_head_id;
    map[co][dk].members.push(sh);
  }
  return Object.entries(map).sort(([a],[b])=>a.localeCompare(b,'vi')).map(([company, dm])=>({
    company,
    depts: Object.entries(dm).sort(([,a],[,b])=>a.deptName.localeCompare(b.deptName,'vi')).map(([deptId,{deptName,headId,members}])=>{
      const manager = headId ? (members.find(m=>m.user_id===headId) ?? null) : null;
      return { deptId, deptName, manager, members: manager ? members.filter(m=>m!==manager) : members };
    }),
  }));
}

function isAbnormal(sh: HRSheet) {
  const d = sh.total_days;
  return d < WARN_LOW_DAYS || d > WARN_HIGH_DAYS;
}

function allSheetIds(group: CompanyGroup | DeptGroup | null, sheets?: HRSheet[]): string[] {
  if (!group && sheets) return sheets.map(s=>s.id);
  if (!group) return [];
  if ('depts' in group) return group.depts.flatMap(d=>[d.manager?.id,...d.members.map(m=>m.id)].filter(Boolean) as string[]);
  return [group.manager?.id,...group.members.map(m=>m.id)].filter(Boolean) as string[];
}

// ─── Checkbox tri-state ───────────────────────────────────────────────────────

type CheckState = 'none' | 'some' | 'all';
function triState(ids: string[], selected: Set<string>): CheckState {
  const n = ids.filter(id=>selected.has(id)).length;
  if (n === 0) return 'none';
  if (n === ids.length) return 'all';
  return 'some';
}
function TriCheckbox({ state, onChange }: { state: CheckState; onChange: ()=>void }) {
  if (state === 'all')  return <button onClick={onChange}><CheckSquare className="h-4 w-4 text-indigo-400" /></button>;
  if (state === 'some') return <button onClick={onChange}><MinusSquare className="h-4 w-4 text-indigo-400/60" /></button>;
  return <button onClick={onChange}><Square className="h-4 w-4 text-muted-foreground" /></button>;
}

// ─── NoteEditor ───────────────────────────────────────────────────────────────

function NoteEditor({ sheetId, initial, userId, userRole, deptId, onSaved }: {
  sheetId: string; initial: string|null;
  userId: string; userRole: string; deptId: string;
  onSaved: (note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(initial ?? '');
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  async function save() {
    setSaving(true);
    try {
      await fetch('/api/attendance/sheets/hr-note', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-current-user-id': userId,
          'x-current-user-role': userRole,
          'x-current-user-dept': deptId,
        },
        body: JSON.stringify({ sheetId, note: val }),
      });
      onSaved(val);
      setEditing(false);
    } finally { setSaving(false); }
  }

  if (!editing) return (
    <button onClick={()=>setEditing(true)}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-indigo-400 transition-colors">
      <Pencil className="h-3 w-3" />
      <span className="truncate max-w-[120px]">{val || 'Ghi chú...'}</span>
    </button>
  );

  return (
    <div className="flex items-center gap-1">
      <textarea ref={ref} value={val} onChange={e=>setVal(e.target.value)} rows={1}
        className="w-32 rounded-lg border border-indigo-500/40 bg-surface-2 px-2 py-1 text-xs text-foreground resize-none focus:outline-none" />
      <button onClick={save} disabled={saving}
        className="rounded-lg bg-indigo-600 p-1 hover:bg-indigo-700 disabled:opacity-40">
        {saving ? <Loader2 className="h-3 w-3 animate-spin text-white" /> : <Check className="h-3 w-3 text-white" />}
      </button>
      <button onClick={()=>{setVal(initial??'');setEditing(false)}}
        className="rounded-lg bg-hover p-1 hover:bg-hover-strong">
        <X className="h-3 w-3 text-muted-foreground" />
      </button>
    </div>
  );
}

// ─── MemberRow ────────────────────────────────────────────────────────────────

function MemberRow({ sheet, isManager=false, selected, onToggle, userId, userRole, deptId, onNoteChange }: {
  sheet: HRSheet; isManager?: boolean;
  selected: boolean; onToggle: ()=>void;
  userId: string; userRole: string; deptId: string;
  onNoteChange: (id: string, note: string) => void;
}) {
  const st      = SHEET_STATUS[sheet.status] ?? SHEET_STATUS.draft;
  const warn    = isAbnormal(sheet);
  const locked  = !!sheet.locked_at;
  const hasOT   = Number(sheet.total_ot_hours) > 0;

  return (
    <div className={`flex items-center gap-2.5 px-3 py-2.5 transition-colors ${
      isManager ? 'bg-amber-500/[0.04] border-b border-line-subtle' : 'border-b border-white/[0.04] last:border-0'
    } ${selected ? 'bg-indigo-500/[0.05]' : ''}`}>
      {/* Checkbox */}
      <button onClick={onToggle} className="flex-shrink-0">
        {selected
          ? <CheckSquare className="h-4 w-4 text-indigo-400" />
          : <Square className="h-4 w-4 text-muted-foreground" />}
      </button>

      {/* Avatar */}
      <div className={`relative flex-shrink-0 h-8 w-8 rounded-full bg-gradient-to-br flex items-center justify-center text-[11px] font-700 text-white ${grad(sheet.user_name)}`}>
        {getInitials(sheet.user_name)}
        {isManager && (
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 border border-[var(--card)]">
            <Crown className="h-2 w-2 text-white" />
          </span>
        )}
      </div>

      {/* Name + note */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className={`text-sm truncate ${isManager?'font-700 text-amber-300':'font-500 text-foreground'}`}>
            {sheet.user_name}
          </p>
          {warn && <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />}
          {locked && <Lock className="h-3 w-3 text-ink-muted flex-shrink-0" />}
        </div>
        <NoteEditor sheetId={sheet.id} initial={sheet.hr_note} userId={userId} userRole={userRole} deptId={deptId}
          onSaved={note=>onNoteChange(sheet.id, note)} />
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 flex-shrink-0 text-right">
        <div className="hidden sm:block">
          <p className="text-sm font-600 text-emerald-400">{sheet.total_days}<span className="text-[10px] font-400 text-muted-foreground ml-0.5">ngày</span></p>
          <p className="text-xs text-indigo-400">{fmtH(sheet.total_hours)}h</p>
        </div>
        {hasOT && (
          <div className="hidden md:block text-right">
            <p className="text-xs font-600 text-violet-400">+{fmtH(sheet.total_ot_hours)}h</p>
            <p className="text-[10px] text-muted-foreground">tăng ca</p>
          </div>
        )}
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-500 ${st.cls}`}>
          {st.label}
        </span>
      </div>
    </div>
  );
}

// ─── DeptBlock ────────────────────────────────────────────────────────────────

function DeptBlock({ dept, selected, onToggleDept, onToggleMember, userId, userRole, deptId, onNoteChange }: {
  dept: DeptGroup;
  selected: Set<string>;
  onToggleDept: ()=>void;
  onToggleMember: (id: string)=>void;
  userId: string; userRole: string; deptId: string;
  onNoteChange: (id: string, note: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const all     = dept.manager ? [dept.manager, ...dept.members] : dept.members;
  const ids     = all.map(m=>m.id);
  const chk     = triState(ids, selected);
  const totDays = all.reduce((s,m)=>s+m.total_days,0);
  const totHrs  = all.reduce((s,m)=>s+Number(m.total_hours),0);
  const totOT   = all.reduce((s,m)=>s+Number(m.total_ot_hours),0);
  const warnCnt = all.filter(isAbnormal).length;
  const sentCnt = all.filter(m=>m.sent_to_hr_at).length;

  return (
    <div className="rounded-xl border border-line-subtle overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-white/[0.02] transition-colors" style={{background:'var(--secondary)'}}>
        <TriCheckbox state={chk} onChange={onToggleDept} />
        <button className="flex-1 flex items-center gap-2 text-left min-w-0" onClick={()=>setOpen(v=>!v)}>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-600 text-foreground truncate">{dept.deptName}</p>
            <p className="text-xs text-muted-foreground">
              {all.length} thành viên
              {dept.manager && ` · QL: ${dept.manager.user_name}`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {warnCnt > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-0.5">
                <AlertTriangle className="h-2.5 w-2.5" />{warnCnt} bất thường
              </span>
            )}
            <span className="hidden sm:block text-xs text-emerald-400 font-600">{totDays}ng · {totHrs.toFixed(1)}h{totOT>0?` · +${totOT.toFixed(1)}h OT`:''}</span>
            <span className="text-[10px] text-violet-400 bg-violet-500/10 border border-violet-500/30 rounded-full px-2 py-0.5">{sentCnt}/{all.length}</span>
            {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </button>
      </div>
      {open && (
        <div style={{background:'var(--card)'}}>
          {dept.manager && (
            <MemberRow sheet={dept.manager} isManager selected={selected.has(dept.manager.id)}
              onToggle={()=>onToggleMember(dept.manager!.id)}
              userId={userId} userRole={userRole} deptId={deptId} onNoteChange={onNoteChange} />
          )}
          {dept.members.map(m=>(
            <MemberRow key={m.id} sheet={m} selected={selected.has(m.id)}
              onToggle={()=>onToggleMember(m.id)}
              userId={userId} userRole={userRole} deptId={deptId} onNoteChange={onNoteChange} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CompanyBlock ─────────────────────────────────────────────────────────────

function CompanyBlock({ group, selected, onToggleCompany, onToggleDept, onToggleMember, userId, userRole, deptId, onNoteChange }: {
  group: CompanyGroup;
  selected: Set<string>;
  onToggleCompany: ()=>void;
  onToggleDept: (deptId: string)=>void;
  onToggleMember: (id: string)=>void;
  userId: string; userRole: string; deptId: string;
  onNoteChange: (id: string, note: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const allIds  = allSheetIds(group);
  const chk     = triState(allIds, selected);
  const allSh   = group.depts.flatMap(d=>d.manager?[d.manager,...d.members]:d.members);
  const totDays = allSh.reduce((s,m)=>s+m.total_days,0);
  const totHrs  = allSh.reduce((s,m)=>s+Number(m.total_hours),0);

  return (
    <div className="rounded-2xl border border-line overflow-hidden" style={{background:'var(--card)'}}>
      <div className="flex items-center gap-3 px-4 py-4 border-b border-line-subtle">
        <TriCheckbox state={chk} onChange={onToggleCompany} />
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-500/15">
          <Building2 className="h-5 w-5 text-indigo-400" />
        </div>
        <button className="flex-1 flex items-center gap-2 text-left min-w-0" onClick={()=>setOpen(v=>!v)}>
          <div className="flex-1 min-w-0">
            <p className="text-base font-700 text-foreground">{group.company}</p>
            <p className="text-xs text-muted-foreground">{group.depts.length} phòng ban · {allSh.length} nhân sự</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-700 text-emerald-400">{totDays}<span className="text-xs font-400 text-muted-foreground ml-1">ngày</span></p>
              <p className="text-xs text-indigo-400">{totHrs.toFixed(1)}h</p>
            </div>
            {open ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
          </div>
        </button>
      </div>
      {open && (
        <div className="p-3 space-y-2.5">
          {group.depts.map(dept=>(
            <DeptBlock key={dept.deptId} dept={dept} selected={selected}
              onToggleDept={()=>onToggleDept(dept.deptId)}
              onToggleMember={onToggleMember}
              userId={userId} userRole={userRole} deptId={deptId} onNoteChange={onNoteChange} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function TongHopClient() {
  const toast = useToast();
  const confirm = useConfirm();
  const [userId,   setUserId]   = useState('');
  const [userRole, setUserRole] = useState('');
  const [deptId,   setDeptId]   = useState('');

  const now = new Date();
  // Mặc định mở KỲ CÔNG hiện tại (mốc 28→27), không phải tháng dương lịch.
  const _initPeriod = getPayrollPeriodForDate(now.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }), DEFAULT_ATTENDANCE_CONFIG);
  const [month, setMonth] = useState(_initPeriod.month);
  const [year,  setYear]  = useState(_initPeriod.year);

  const [sheets,   setSheets]   = useState<HRSheet[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [locking,  setLocking]  = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showExportRange, setShowExportRange] = useState(false);
  const [showExportLeaveDays, setShowExportLeaveDays] = useState(false);
  const [tab, setTab] = useState<'data'|'config'>('data');

  // ── Bộ lọc & tìm kiếm (lọc client-side trên dữ liệu đã tải) ──
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');

  useEffect(()=>{
    const raw = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (raw) { try { const u=JSON.parse(raw); setUserId(u.id??''); setUserRole(u.role??''); setDeptId(u.department_id??u.department??''); } catch{} }
  },[]);

  const isHCNS = deptId===HCNS_DEPT_ID || userRole==='super_admin';

  const hdrs = useCallback(()=>({
    'x-current-user-id':   userId,
    'x-current-user-role': userRole,
    'x-current-user-dept': deptId,
  }),[userId, userRole, deptId]);

  const fetchData = useCallback(async()=>{
    if (!userId) return;
    setLoading(true); setError('');
    try {
      const res  = await fetch(`/api/attendance/sheets/hr?month=${month}&year=${year}`, { headers: hdrs() });
      const json = await res.json();
      if (json.success) { setSheets(json.data??[]); setSelected(new Set()); }
      else setError(json.error??'Không thể tải dữ liệu');
    } catch { setError('Lỗi kết nối'); }
    finally { setLoading(false); }
  },[userId, month, year, hdrs]);

  useEffect(()=>{ if (userId) fetchData(); },[fetchData, userId]);

  function prevMonth(){ if(month===1){setMonth(12);setYear(y=>y-1);}else setMonth(m=>m-1); }
  function nextMonth(){ if(month===12){setMonth(1);setYear(y=>y+1);}else setMonth(m=>m+1); }

  // ── Checkbox handlers ──
  function toggleMember(id: string) {
    setSelected(prev=>{ const s=new Set(prev); s.has(id)?s.delete(id):s.add(id); return s; });
  }
  function toggleDept(deptIdArg: string, group: CompanyGroup) {
    const dept = group.depts.find(d=>d.deptId===deptIdArg);
    if (!dept) return;
    const ids = allSheetIds(dept);
    const allSel = ids.every(id=>selected.has(id));
    setSelected(prev=>{ const s=new Set(prev); ids.forEach(id=>allSel?s.delete(id):s.add(id)); return s; });
  }
  function toggleCompany(group: CompanyGroup) {
    const ids = allSheetIds(group);
    const allSel = ids.every(id=>selected.has(id));
    setSelected(prev=>{ const s=new Set(prev); ids.forEach(id=>allSel?s.delete(id):s.add(id)); return s; });
  }
  function toggleAll() {
    // "Chọn tất cả" tôn trọng bộ lọc — chỉ thao tác trên các dòng đang hiển thị.
    const ids = visible.map(s=>s.id);
    const allSel = ids.length > 0 && ids.every(id=>selected.has(id));
    setSelected(prev=>{ const s=new Set(prev); ids.forEach(id=>allSel?s.delete(id):s.add(id)); return s; });
  }

  // ── Note change ──
  function handleNoteChange(id: string, note: string) {
    setSheets(prev=>prev.map(s=>s.id===id?{...s,hr_note:note}:s));
  }

  // ── Lock/Unlock ──
  async function handleLock(action: 'lock'|'unlock') {
    const ids = Array.from(selected);
    if (!ids.length) { toast.warning('Chưa chọn bảng công nào'); return; }

    if (action === 'lock') {
      const alreadyLocked = sheets.filter(s => ids.includes(s.id) && s.locked_at);
      if (alreadyLocked.length === ids.length) {
        toast.info(`Tất cả ${ids.length} bảng công đã được chốt rồi. Không cần thao tác lại.`);
        return;
      }
      if (alreadyLocked.length > 0) {
        const names = alreadyLocked.map(s => s.user_name).join(', ');
        if (!(await confirm({ title: 'Tiếp tục chốt?', message: `${alreadyLocked.length} bảng công đã chốt rồi (${names}) sẽ được bỏ qua. Chỉ chốt ${ids.length - alreadyLocked.length} bảng công chưa chốt. Tiếp tục?`, confirmLabel: 'Chốt' }))) return;
      } else {
        if (!(await confirm({ title: 'Chốt bảng công?', message: `Chốt ${ids.length} bảng công đã chọn?`, confirmLabel: 'Chốt' }))) return;
      }
    } else {
      const notLocked = sheets.filter(s => ids.includes(s.id) && !s.locked_at);
      if (notLocked.length === ids.length) {
        toast.info(`Tất cả bảng công đã chọn chưa được chốt. Không cần mở chốt.`);
        return;
      }
      if (!(await confirm({ title: 'Mở chốt bảng công?', message: `Mở chốt ${ids.length} bảng công đã chọn?`, confirmLabel: 'Mở chốt', danger: true }))) return;
    }

    setLocking(true);
    try {
      const res = await fetch('/api/attendance/sheets/lock',{
        method:'POST',
        headers:{'Content-Type':'application/json',...hdrs()},
        body: JSON.stringify({ sheetIds: ids, action }),
      });
      const json = await res.json();
      if (json.success) {
        if (action === 'lock' && json.updated === 0) {
          toast.info('Tất cả bảng công đã được chốt rồi.');
        }
        fetchData();
      } else {
        toast.error(json.error ?? 'Lỗi');
      }
    } finally { setLocking(false); }
  }

  // ── Xuất bảng công theo form mẫu (DETAIL_fill) ──
  async function handleExportTemplate() {
    const ids = selectedSheets.length ? selectedSheets.map(s => s.id) : visible.map(s => s.id);
    if (!ids.length) { toast.warning('Không có bảng công nào để xuất'); return; }
    setExporting(true);
    try {
      const res = await fetch('/api/attendance/sheets/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...hdrs() },
        body: JSON.stringify({ sheetIds: ids }),
      });
      const json = await res.json();
      if (!json.success) { toast.error(json.error ?? 'Lỗi xuất bảng công'); return; }
      if (!json.rows?.length) { toast.warning('Không có dữ liệu để xuất'); return; }
      exportAttendanceWorkbook(json.rows, json.month, json.year, json.columns);
    } catch {
      toast.error('Lỗi kết nối khi xuất bảng công');
    } finally { setExporting(false); }
  }

  // ── Áp bộ lọc → tập hiển thị (stats, cây, chọn-tất-cả đều chạy trên tập này) ──
  const qNorm = normalizeVi(q);
  const visible = sheets.filter(sh => {
    if (qNorm && !normalizeVi(sh.user_name).includes(qNorm)) return false;
    if (statusFilter === 'warn'     && !isAbnormal(sh)) return false;
    if (statusFilter === 'approved' && sh.status !== 'approved') return false;
    if (statusFilter === 'pending'  && sh.status === 'approved') return false;
    if (statusFilter === 'locked'   && !sh.locked_at) return false;
    if (statusFilter === 'unlocked' && sh.locked_at) return false;
    if (companyFilter !== 'all' && (sh.company ?? '(Chưa phân công ty)') !== companyFilter) return false;
    if (deptFilter !== 'all') {
      const dk = sh.is_company_level ? '__company__' : (sh.department_id ?? '__');
      if (dk !== deptFilter) return false;
    }
    return true;
  });
  const filtering = qNorm !== '' || statusFilter !== 'all' || companyFilter !== 'all' || deptFilter !== 'all';

  // Danh mục dropdown lấy từ TOÀN BỘ dữ liệu tháng (không phụ thuộc kết quả lọc).
  const companyOptions = Array.from(new Set(sheets.map(s => s.company ?? '(Chưa phân công ty)'))).sort((a, b) => a.localeCompare(b, 'vi'));
  const deptOptions = Array.from(
    sheets
      .filter(s => companyFilter === 'all' || (s.company ?? '(Chưa phân công ty)') === companyFilter)
      .reduce((m, s) => {
        const dk = s.is_company_level ? '__company__' : (s.department_id ?? '__');
        if (!m.has(dk)) m.set(dk, s.is_company_level ? 'Ban Lãnh Đạo & VP Công Ty' : (s.dept_name ?? '(Chưa phân phòng ban)'));
        return m;
      }, new Map<string, string>())
      .entries()
  ).sort((a, b) => a[1].localeCompare(b[1], 'vi'));

  function clearFilters() { setQ(''); setStatusFilter('all'); setCompanyFilter('all'); setDeptFilter('all'); }

  // ── Selected sheets ──
  const selectedSheets = sheets.filter(s=>selected.has(s.id));
  const groups         = groupSheets(visible);
  const totalDays      = visible.reduce((s,sh)=>s+sh.total_days,0);
  const totalHours     = visible.reduce((s,sh)=>s+Number(sh.total_hours),0);
  const totalOT        = visible.reduce((s,sh)=>s+Number(sh.total_ot_hours),0);
  const warnCount      = visible.filter(isAbnormal).length;
  const lockedCount    = visible.filter(s=>s.locked_at).length;

  if (!userId) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (!isHCNS) return (
    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
      <AlertCircle className="h-10 w-10 mb-3 opacity-30" />
      <p className="text-sm font-600">Không có quyền truy cập</p>
      <p className="text-xs mt-1 opacity-60">Chỉ dành cho Phòng Hành Chính Nhân Sự</p>
      <Link href="/tra-cuu/du-lieu-cong" className="mt-4 text-xs text-indigo-400 hover:underline">← Quay lại</Link>
    </div>
  );

  return (
    <div className="space-y-5 sm:space-y-6 animate-fadeIn">
      {/* Back */}
      <Link href="/tra-cuu/du-lieu-cong" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Dữ Liệu Chấm Công
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-violet-400" /> Tổng Hợp Dữ Liệu Công
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Phòng Hành Chính Nhân Sự</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          <button onClick={fetchData} className="btn-ghost inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm">
            <RefreshCw className="h-4 w-4" /> Làm mới
          </button>
          <button
            onClick={() => setShowExportRange(true)}
            disabled={loading || sheets.length === 0}
            title="Xuất giờ vào/ra theo khoảng ngày bất kỳ (CSV/Excel)"
            className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/15 px-3 py-2 text-sm font-600 text-violet-300 hover:bg-violet-500/25 disabled:opacity-40 transition-colors">
            <CalendarRange className="h-4 w-4" />
            Xuất Dữ Liệu Công{selectedSheets.length > 0 ? ` (${selectedSheets.length})` : ''}
          </button>
          <button
            onClick={() => setShowExportLeaveDays(true)}
            disabled={loading || sheets.length === 0}
            title="Xuất báo cáo ngày nghỉ / công đặc biệt theo khoảng ngày (Excel)"
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-sm font-600 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40 transition-colors">
            <CalendarOff className="h-4 w-4" />
            Xuất Ngày Nghỉ{selectedSheets.length > 0 ? ` (${selectedSheets.length})` : ''}
          </button>
          {/* Nút "Xuất Bảng Công" (form mẫu BCC) tạm ẩn theo yêu cầu — handleExportTemplate vẫn giữ để bật lại sau */}
        </div>
      </div>

      {/* Modal: Xuất Dữ Liệu Công theo khoảng ngày */}
      <ExportRangeModal
        open={showExportRange}
        onClose={() => setShowExportRange(false)}
        employees={(selectedSheets.length ? selectedSheets : visible).map(s => ({ user_id: s.user_id, user_name: s.user_name }))}
        headers={hdrs}
      />

      {/* Modal: Xuất Ngày Nghỉ / công đặc biệt theo khoảng ngày */}
      <ExportLeaveDaysModal
        key={`${month}-${year}`}
        open={showExportLeaveDays}
        onClose={() => setShowExportLeaveDays(false)}
        employees={(selectedSheets.length ? selectedSheets : visible).map(s => ({ user_id: s.user_id, user_name: s.user_name }))}
        headers={hdrs}
        month={month}
        year={year}
      />

      {/* Tabs: Tổng Hợp / Cấu Hình Xuất */}
      <div className="flex gap-2 border-b border-line overflow-x-auto">
        <button onClick={()=>setTab('data')}
          className={`px-4 py-2 text-sm font-600 border-b-2 -mb-px whitespace-nowrap transition-colors ${tab==='data'?'border-indigo-500 text-indigo-400':'border-transparent text-muted-foreground hover:text-foreground'}`}>
          Tổng Hợp
        </button>
        <button onClick={()=>setTab('config')}
          className={`px-4 py-2 text-sm font-600 border-b-2 -mb-px whitespace-nowrap transition-colors ${tab==='config'?'border-indigo-500 text-indigo-400':'border-transparent text-muted-foreground hover:text-foreground'}`}>
          Cấu Hình Xuất Dữ Liệu Công
        </button>
      </div>

      {tab === 'config' && <RangeExportColumnsManager userRole={userRole} deptId={deptId} />}

      {tab === 'data' && (<>
      {/* Month selector */}
      <div className="flex items-center justify-between rounded-2xl border border-line-subtle px-4 py-3" style={{background:'var(--card)'}}>
        <button onClick={prevMonth} className="btn-ghost rounded-lg p-1.5"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-sm font-600 text-foreground">Tháng {month} / {year}</span>
        <button onClick={nextMonth} className="btn-ghost rounded-lg p-1.5"><ChevronRight className="h-4 w-4" /></button>
      </div>

      {/* Stats */}
      {!loading && sheets.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {[
            { val: sheets.length, label: 'Nhân sự',    color: 'text-violet-400',    icon: <Users className="h-3 w-3" /> },
            { val: totalDays,     label: 'Ngày công',  color: 'text-emerald-400',   icon: null },
            { val: totalHours.toFixed(1), label: 'Giờ công', color: 'text-indigo-400', icon: <Clock className="h-3 w-3" /> },
            { val: `+${totalOT.toFixed(1)}h`, label: 'Tăng ca',  color: 'text-violet-400',  icon: null },
            { val: warnCount, label: 'Bất thường', color: warnCount>0?'text-amber-400':'text-muted-foreground', icon: warnCount>0?<AlertTriangle className="h-3 w-3"/>:null },
          ].map(({val,label,color,icon})=>(
            <div key={label} className="rounded-xl border border-line-subtle p-3 text-center" style={{background:'var(--card)'}}>
              <p className={`text-2xl font-700 ${color}`}>{val}</p>
              <p className="mt-1 text-[11px] text-muted-foreground flex items-center justify-center gap-1">{icon}{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Bộ lọc & tìm kiếm */}
      {!loading && sheets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto] gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Tìm nhân sự (gõ không dấu cũng được)..."
              className="w-full rounded-xl border border-line bg-[#162033] pl-9 pr-8 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-indigo-500/60"
            />
            {q && (
              <button onClick={() => setQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-xl border border-line bg-[#162033] px-3 py-2 text-sm text-foreground focus:outline-none focus:border-indigo-500/60"
          >
            {STATUS_FILTERS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={companyFilter}
            onChange={e => { setCompanyFilter(e.target.value); setDeptFilter('all'); }}
            className="rounded-xl border border-line bg-[#162033] px-3 py-2 text-sm text-foreground focus:outline-none focus:border-indigo-500/60"
          >
            <option value="all">Tất cả công ty</option>
            {companyOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            className="rounded-xl border border-line bg-[#162033] px-3 py-2 text-sm text-foreground focus:outline-none focus:border-indigo-500/60"
          >
            <option value="all">Tất cả phòng ban</option>
            {deptOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          {filtering && (
            <button onClick={clearFilters}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-hover transition-colors">
              <X className="h-3.5 w-3.5" /> Xóa lọc
            </button>
          )}
        </div>
      )}

      {/* Kết quả lọc */}
      {!loading && sheets.length > 0 && filtering && (
        <p className="text-xs text-muted-foreground px-1 -mt-2">
          Khớp <span className="font-600 text-indigo-400">{visible.length}</span>/{sheets.length} nhân sự
        </p>
      )}

      {/* Toolbar: select-all + export + lock */}
      {!loading && visible.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line-subtle px-4 py-3" style={{background:'var(--card)'}}>
          {/* Select all */}
          <button onClick={toggleAll}
            className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-500 text-muted-foreground hover:bg-hover transition-colors">
            {visible.length>0 && visible.every(s=>selected.has(s.id))
              ? <CheckSquare className="h-4 w-4 text-indigo-400" />
              : <Square className="h-4 w-4" />}
            {selected.size===0 ? `Chọn tất cả${filtering?' (đang lọc)':''}` : `Đã chọn ${selected.size}/${sheets.length}`}
          </button>

          <div className="flex-1" />

          {/* Nút "Chốt" / "Mở chốt" tạm ẩn theo yêu cầu — handleLock vẫn giữ để bật lại sau */}

        </div>
      )}

      {/* Lock status bar */}
      {!loading && lockedCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-500/20 bg-slate-500/8 px-4 py-2.5">
          <Lock className="h-4 w-4 text-ink-muted" />
          <p className="text-xs text-ink-muted">{lockedCount}/{sheets.length} bảng công đã chốt trong tháng này</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/8 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-line-subtle" style={{background:'var(--card)'}}>
          {filtering ? (
            <>
              <Search className="h-10 w-10 mb-3 opacity-30 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Không có nhân sự nào khớp bộ lọc</p>
              <button onClick={clearFilters} className="mt-3 text-xs text-indigo-400 hover:underline">Xóa lọc để xem tất cả</button>
            </>
          ) : (
            <>
              <BarChart3 className="h-10 w-10 mb-3 opacity-30 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Chưa có bảng công nào được gửi về</p>
              <p className="text-xs mt-1 opacity-60">Quản lý cần duyệt xong và gửi bảng công tháng {month}/{year}</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group=>(
            <CompanyBlock
              key={group.company}
              group={group}
              selected={selected}
              onToggleCompany={()=>toggleCompany(group)}
              onToggleDept={(dId)=>toggleDept(dId,group)}
              onToggleMember={toggleMember}
              userId={userId} userRole={userRole} deptId={deptId}
              onNoteChange={handleNoteChange}
            />
          ))}
        </div>
      )}

      {/* Legend */}
      {!loading && sheets.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground px-1">
          <span className="flex items-center gap-1.5"><Crown className="h-3 w-3 text-amber-400" /> Quản lý trực tiếp</span>
          <span className="flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 text-amber-400" /> Ngày công bất thường (&lt;{WARN_LOW_DAYS} hoặc &gt;{WARN_HIGH_DAYS} ngày)</span>
          <span className="flex items-center gap-1.5"><Lock className="h-3 w-3 text-ink-muted" /> Đã chốt</span>
        </div>
      )}
      </>)}
    </div>
  );
}
