'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, AlertCircle, X, Loader2, ChevronLeft, ChevronRight,
  LogIn, LogOut, Clock, Search, UserPlus, RefreshCw, Link2, Unlink, CheckCircle2,
  Download, CalendarRange,
} from 'lucide-react';
import { MachineManagementClient } from './MachineManagementClient';
import { exportPersonMonthlyWorkbook } from './exportPersonMonthlyWorkbook';
import HolidayManager from './HolidayManager';
import AttendanceRulesConfig from './AttendanceRulesConfig';
import DateInputVN from '@/components/ui/DateInputVN';
import { normalizeVN } from '@/lib/utils/searchVN';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

interface DeviceCodeEntry {
  machine_id: string;
  employee_code: string;
  punch_count: number;
  first_seen: string;
  last_seen: string;
  mapping_id: string | null;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
}

interface Summary { total: number; mapped: number; unmapped: number; totalPunches: number; }

interface DailyRecord {
  date: string;
  check_in: string | null;
  check_out: string | null;
  total_minutes: number;
  has_checkin: boolean;
  has_checkout: boolean;
}
interface AttendanceSheet { month: number; year: number; total_days: number; total_hours: number; }
interface User { id: string; name: string; email: string; }

function fmtRelative(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h} giờ trước`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} ngày trước`;
  return d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export default function CauHinhClient() {
  const toast = useToast();
  const confirm = useConfirm();
  const [codes, setCodes]       = useState<DeviceCodeEntry[]>([]);
  const [summary, setSummary]   = useState<Summary>({ total: 0, mapped: 0, unmapped: 0, totalPunches: 0 });
  const [users, setUsers]       = useState<User[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState<'all' | 'mapped' | 'unmapped'>('all');
  const [page, setPage]         = useState(1);
  const PER_PAGE = 10;
  const [machineFilter, setMachineFilter] = useState<string>('all');
  const [machineNames, setMachineNames]   = useState<Record<string, string>>({});
  const [userRole, setUserRole] = useState('');
  const [adminId, setAdminId]   = useState('');

  // Modal gán mã
  const [assigning, setAssigning] = useState<DeviceCodeEntry | null>(null);
  const [assignUserId, setAssignUserId] = useState('');
  const [userQuery, setUserQuery] = useState('');
  // '' = CHƯA chọn — bắt buộc admin tự chọn khi đổi mã đã có chủ (tránh vô ý
  // chuyển toàn bộ lịch sử sang người khác — nguyên nhân gán nhầm dữ liệu).
  const [assignMode, setAssignMode] = useState<'' | 'correct' | 'handover'>('');
  const [handoverDate, setHandoverDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Slide-in panel dữ liệu công
  const [viewing, setViewing] = useState<DeviceCodeEntry | null>(null);
  const [days, setDays] = useState<DailyRecord[]>([]);
  const [sheet, setSheet] = useState<AttendanceSheet | null>(null);
  const [attLoading, setAttLoading] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth() + 1);
  const [viewYear, setViewYear]   = useState(() => new Date().getFullYear());

  // Xuất bảng công theo khoảng ngày (trong panel xem của 1 mã)
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const _todayISO = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const [exportFrom, setExportFrom] = useState(_todayISO.slice(0, 4) + '-01-01');
  const [exportTo, setExportTo]     = useState(_todayISO);

  const isAdmin = userRole === 'super_admin' || userRole === 'admin';

  // Xuất bảng công của người đang xem theo khoảng ngày → mỗi tháng 1 sheet.
  async function handleExportPerson() {
    if (!viewing?.user_id || exportBusy) return;
    if (!exportFrom || !exportTo) { toast.warning('Chọn khoảng ngày'); return; }
    if (exportFrom > exportTo) { toast.warning('Ngày bắt đầu phải trước ngày kết thúc'); return; }
    setExportBusy(true);
    try {
      const res = await fetch('/api/attendance/export-range', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-current-user-role': userRole },
        body: JSON.stringify({ userIds: [viewing.user_id], from: exportFrom, to: exportTo }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) { toast.error(json.error ?? 'Lỗi xuất bảng công'); return; }
      const emp = json.employees?.[0];
      if (!emp) { toast.warning('Không có dữ liệu'); return; }
      exportPersonMonthlyWorkbook(
        { name: emp.name, employeeCode: emp.employeeCode, company: emp.company, department: emp.department },
        json.from, json.to, emp.days ?? []
      );
      toast.success('Đã tạo file bảng công');
      setExportOpen(false);
    } catch {
      toast.error('Lỗi kết nối khi xuất bảng công');
    } finally {
      setExportBusy(false);
    }
  }

  // UX modal gán/đổi mã (form): ESC + cảnh báo thay đổi chưa lưu
  const closeAssign = useCallback(() => { setAssigning(null); setAssignUserId(''); }, []);
  const { markDirty: markAssignDirty, markClean: markAssignClean, guardedClose: guardedCloseAssign } = useUnsavedGuard(closeAssign);
  useEscapeKey(guardedCloseAssign, !!assigning);
  // Slide-in panel xem dữ liệu công (chỉ xem): ESC đóng
  const closeViewing = useCallback(() => setViewing(null), []);
  useEscapeKey(closeViewing, !!viewing);

  useEffect(() => {
    const stored = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (stored) {
      try { const u = JSON.parse(stored); setUserRole(u.role ?? ''); setAdminId(u.id ?? ''); } catch { /* empty */ }
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const headers = { 'x-current-user-role': userRole };
      const [cRes, uRes, mRes] = await Promise.all([
        fetch('/api/attendance/device-codes', { headers, cache: 'no-store' }),
        fetch('/api/users?status=active', { headers, cache: 'no-store' }),
        fetch('/api/attendance/machines', { headers, cache: 'no-store' }),
      ]);
      const [cJson, uJson, mJson] = await Promise.all([cRes.json(), uRes.json(), mRes.json()]);
      if (cJson.success) { setCodes(cJson.data); setSummary(cJson.summary); }
      setUsers(Array.isArray(uJson) ? uJson : (uJson.data ?? uJson.users ?? []));
      if (mJson.success && Array.isArray(mJson.data)) {
        const map: Record<string, string> = {};
        mJson.data.forEach((m: { id: string; name: string }) => { map[m.id] = m.name; });
        setMachineNames(map);
      }
    } finally { setLoading(false); }
  }, [userRole, adminId]);

  useEffect(() => { if (userRole && adminId) fetchAll(); }, [fetchAll, userRole, adminId]);

  // Auto-refresh 30s để mã mới từ máy hiện ra
  useEffect(() => {
    if (!userRole || !adminId) return;
    const t = setInterval(fetchAll, 30000);
    return () => clearInterval(t);
  }, [fetchAll, userRole, adminId]);

  const filtered = useMemo(() => {
    // Tìm kiếm KHÔNG phân biệt dấu/hoa-thường (gõ "Duong" ra "Dương", thiếu/khác dấu vẫn thấy).
    const q = normalizeVN(search).trim();
    const list = codes.filter((c) => {
      if (machineFilter !== 'all' && c.machine_id !== machineFilter) return false;
      if (filter === 'mapped' && !c.user_id) return false;
      if (filter === 'unmapped' && c.user_id) return false;
      if (!q) return true;
      return normalizeVN(c.employee_code).includes(q)
        || normalizeVN(c.user_name).includes(q)
        || normalizeVN(c.user_email).includes(q);
    });
    // Sắp xếp theo thứ tự mã trên máy (số tăng dần; mã không phải số xếp theo chữ)
    return list.sort((a, b) => {
      const na = parseInt(a.employee_code, 10);
      const nb = parseInt(b.employee_code, 10);
      const aNum = !isNaN(na) && /^\d+$/.test(a.employee_code);
      const bNum = !isNaN(nb) && /^\d+$/.test(b.employee_code);
      if (aNum && bNum) return na - nb;
      if (aNum) return -1;
      if (bNum) return 1;
      return a.employee_code.localeCompare(b.employee_code);
    });
  }, [codes, search, filter]);

  // Danh sách máy có trong codes (để render filter chips)
  const machineIds = useMemo(() => Array.from(new Set(codes.map(c => c.machine_id))), [codes]);
  const multiMachine = machineIds.length > 1;

  // Phân trang 10 mã/trang
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageClamped = Math.min(page, totalPages);
  const paged = filtered.slice((pageClamped - 1) * PER_PAGE, pageClamped * PER_PAGE);

  // Reset về trang 1 khi đổi tìm kiếm / bộ lọc
  useEffect(() => { setPage(1); }, [search, filter, machineFilter]);

  function openAssign(c: DeviceCodeEntry) {
    setAssigning(c);
    setAssignUserId(c.user_id ?? '');
    setUserQuery(c.user_id ? `${c.user_name ?? ''}${c.user_email ? ` (${c.user_email})` : ''}` : '');
    setAssignMode(''); // chưa chọn — buộc admin quyết định rõ (Sửa gán nhầm / Bàn giao)
    setHandoverDate(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }));
  }

  async function handleAssign() {
    if (!assigning || !assignUserId || submitting) return;
    // Mã chưa gán → 'assign'. Mã đã gán → BẮT BUỘC admin chọn rõ chế độ.
    if (assigning.user_id && !assignMode) {
      toast.error('Chọn cách xử lý: "Sửa gán nhầm" hoặc "Bàn giao"');
      return;
    }
    const mode = !assigning.user_id ? 'assign' : assignMode;
    if (mode === 'handover' && !handoverDate) { toast.error('Chọn ngày bàn giao'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/attendance/machine-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-current-user-id': adminId, 'x-current-user-role': userRole },
        body: JSON.stringify({
          machine_id: assigning.machine_id,
          employee_code: assigning.employee_code,
          user_id: assignUserId,
          mode,
          // mốc bàn giao = 00:00 giờ VN của ngày đã chọn
          effective_from: mode === 'handover' ? new Date(`${handoverDate}T00:00:00+07:00`).toISOString() : undefined,
        }),
      });
      const json = await res.json();
      if (json.success) { markAssignClean(); setAssigning(null); setAssignUserId(''); fetchAll(); }
      else toast.error('Lỗi: ' + (json.error ?? 'không rõ'));
    } finally { setSubmitting(false); }
  }

  async function handleUnmap(c: DeviceCodeEntry) {
    if (!c.mapping_id) return;
    if (!(await confirm({ title: 'Gỡ mã chấm công?', message: `Gỡ mã ${c.employee_code} khỏi ${c.user_name}? Mã sẽ nhả HOÀN TOÀN về trạng thái chưa gán (không giữ lịch sử gán cho ai). Punch được giữ nguyên, hiện lại đầy đủ khi gán cho người mới.`, confirmLabel: 'Gỡ', danger: true }))) return;
    await fetch(`/api/attendance/machine-mappings/${c.mapping_id}`, {
      method: 'DELETE',
      headers: { 'x-current-user-role': userRole },
    });
    fetchAll();
  }

  async function openAttendance(c: DeviceCodeEntry) {
    if (!c.user_id) return;
    const now = new Date();
    setViewing(c);
    setViewMonth(now.getMonth() + 1);
    setViewYear(now.getFullYear());
    setDays([]); setSheet(null); // xóa dữ liệu mã trước đó, tránh hiện nhầm khi tải mã mới
    await loadAttendance(c.user_id, now.getMonth() + 1, now.getFullYear());
  }

  async function loadAttendance(userId: string, month: number, year: number) {
    setAttLoading(true);
    try {
      // Dùng user-records?userId= (server đọc userId qua QUERY, kiểm quyền + scope).
      // KHÔNG dùng my-records: middleware ghi đè x-current-user-id bằng danh tính
      // cookie → my-records luôn trả dữ liệu của CHÍNH admin, không phải người của mã.
      const res = await fetch(`/api/attendance/user-records?userId=${encodeURIComponent(userId)}&month=${month}&year=${year}`, {
        headers: { 'x-current-user-role': userRole },
      });
      const json = await res.json();
      if (json.success) { setDays(json.data.days ?? []); setSheet(json.data.sheet ?? null); }
      else { setDays([]); setSheet(null); } // lỗi → xóa, không giữ dữ liệu mã trước
    } catch { setDays([]); setSheet(null); }
    finally { setAttLoading(false); }
  }

  function changeMonth(delta: number) {
    let m = viewMonth + delta, y = viewYear;
    if (m > 12) { m = 1; y++; } if (m < 1) { m = 12; y--; }
    setViewMonth(m); setViewYear(y);
    if (viewing?.user_id) loadAttendance(viewing.user_id, m, y);
  }

  if (!isAdmin) {
    return (
      <div className="animate-fadeIn">
        <Link href="/tra-cuu/du-lieu-cong" className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Dữ Liệu Chấm Công
        </Link>
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <AlertCircle className="mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm">Trang này chỉ dành cho Admin</p>
        </div>
      </div>
    );
  }

  const STAT_CARDS = [
    { label: 'Tổng mã máy', value: summary.total, cls: 'text-foreground' },
    { label: 'Đã gán', value: summary.mapped, cls: 'text-emerald-400' },
    { label: 'Chưa gán', value: summary.unmapped, cls: 'text-amber-400' },
    { label: 'Tổng lượt chấm', value: summary.totalPunches, cls: 'text-indigo-400' },
  ];

  return (
    <div className="animate-fadeIn space-y-8">
      <div>
        <Link href="/tra-cuu/du-lieu-cong" className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Dữ Liệu Chấm Công
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Cấu Hình Máy Chấm Công</h1>
        <p className="mt-1 text-sm text-muted-foreground">Quản lý máy và gán mã nhân viên với tài khoản hệ thống</p>
      </div>

      {/* Section 1: Quản lý máy */}
      <MachineManagementClient />

      <div className="border-t border-line-subtle" />

      {/* Section 2: Danh bạ mã chấm công */}
      <div>
        <div className="mb-1 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">Danh Bạ Mã Chấm Công</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Mỗi mã là một dấu vân tay trên máy. Gán mã với tài khoản để nhân viên xem được dữ liệu công.
            </p>
          </div>
          <button onClick={fetchAll} className="btn-ghost inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm flex-shrink-0">
            <RefreshCw className="h-4 w-4" /> Làm mới
          </button>
        </div>

        {/* Stats */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STAT_CARDS.map((s) => (
            <div key={s.label} className="rounded-xl border border-line-subtle p-3 text-center" style={{ background: 'var(--card)' }}>
              <p className={`text-2xl font-700 ${s.cls}`}>{s.value.toLocaleString('vi-VN')}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Toolbar: search + filter */}
        <div className="mt-4 space-y-2.5">

          {/* Bộ lọc máy — chỉ hiện khi có ≥ 2 máy */}
          {multiMachine && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground shrink-0">Máy:</span>
              <button
                onClick={() => setMachineFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-600 border transition-colors ${
                  machineFilter === 'all'
                    ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                    : 'bg-hover border-line text-muted-foreground hover:bg-hover-strong hover:text-foreground'
                }`}
              >
                Tất cả ({codes.length})
              </button>
              {machineIds.map((mid) => {
                const cnt = codes.filter(c => c.machine_id === mid).length;
                const name = machineNames[mid] ?? mid;
                return (
                  <button
                    key={mid}
                    onClick={() => setMachineFilter(mid)}
                    className={`px-3 py-1 rounded-lg text-xs font-600 border transition-colors ${
                      machineFilter === mid
                        ? 'bg-teal-500/15 border-teal-500/40 text-teal-300'
                        : 'bg-hover border-line text-muted-foreground hover:bg-hover-strong hover:text-foreground'
                    }`}
                  >
                    {name} ({cnt})
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo mã hoặc tên nhân viên..."
                className="h-10 w-full rounded-xl border border-line bg-surface-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500/60 focus:outline-none"
              />
            </div>
            <div className="flex gap-1 rounded-xl border border-line p-1 shrink-0" style={{ background: 'var(--secondary)' }}>
              {([['all', 'Tất cả'], ['unmapped', 'Chưa gán'], ['mapped', 'Đã gán']] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-500 transition-all ${
                    filter === k ? 'bg-indigo-500/20 text-indigo-300' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >{label}{k === 'unmapped' && summary.unmapped > 0 ? ` (${summary.unmapped})` : ''}</button>
              ))}
            </div>
          </div>

        </div>

        {/* Bảng mã */}
        {loading ? (
          <div className="flex justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Clock className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">{codes.length === 0 ? 'Chưa có dữ liệu chấm công nào từ máy' : 'Không tìm thấy mã phù hợp'}</p>
            {codes.length === 0 && <p className="mt-1 text-xs opacity-60">Dữ liệu sẽ xuất hiện khi máy đẩy punch lên (poller chạy mỗi 30s)</p>}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
            {paged.map((c) => (
              <div
                key={`${c.machine_id}|${c.employee_code}`}
                className={`flex items-center gap-3 border-b border-white/[0.04] last:border-0 px-4 py-3 transition-colors ${c.user_id ? 'hover:bg-white/[0.04] cursor-pointer' : ''}`}
                onClick={() => c.user_id && openAttendance(c)}
              >
                {/* Mã chip */}
                <div className={`flex h-10 w-12 flex-shrink-0 items-center justify-center rounded-lg ${c.user_id ? 'bg-indigo-500/15' : 'bg-amber-500/15'}`}>
                  <span className={`text-sm font-700 ${c.user_id ? 'text-indigo-400' : 'text-amber-400'}`}>{c.employee_code}</span>
                </div>

                {/* Thông tin */}
                <div className="flex-1 min-w-0">
                  {c.user_id ? (
                    <>
                      <p className="text-sm font-500 text-foreground truncate">{c.user_name ?? 'Không rõ'}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.user_email}</p>
                    </>
                  ) : (
                    <p className="text-sm font-500 text-amber-400">Chưa gán nhân viên</p>
                  )}
                  {multiMachine && <p className="text-[11px] text-muted-foreground/70 truncate">Máy: {machineNames[c.machine_id] ?? c.machine_id}</p>}
                </div>

                {/* Thống kê punch */}
                <div className="hidden sm:block text-right flex-shrink-0 w-32">
                  <p className="text-xs text-foreground">{c.punch_count.toLocaleString('vi-VN')} lượt chấm</p>
                  <p className="text-[11px] text-muted-foreground">gần nhất: {fmtRelative(c.last_seen)}</p>
                </div>

                {/* Action */}
                <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  {c.user_id ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <button
                        onClick={() => openAssign(c)}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-500 text-muted-foreground hover:text-indigo-400 hover:bg-hover transition-colors inline-flex items-center gap-1"
                        title="Đổi nhân viên"
                      ><Link2 className="h-3.5 w-3.5" /> Đổi</button>
                      <button
                        onClick={() => handleUnmap(c)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:text-red-400 transition-colors"
                        title="Gỡ mapping"
                      ><Unlink className="h-4 w-4" /></button>
                    </>
                  ) : (
                    <button
                      onClick={() => openAssign(c)}
                      className="btn-indigo rounded-lg px-3 py-1.5 text-xs font-600 inline-flex items-center gap-1.5"
                    ><UserPlus className="h-3.5 w-3.5" /> Gán</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Phân trang */}
        {!loading && filtered.length > 0 && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Hiển thị {(pageClamped - 1) * PER_PAGE + 1}–{Math.min(pageClamped * PER_PAGE, filtered.length)} / {filtered.length} mã
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={pageClamped <= 1}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-hover-strong disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              ><ChevronLeft className="h-4 w-4" /></button>
              <span className="px-3 text-sm font-500 text-foreground">Trang {pageClamped}/{totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={pageClamped >= totalPages}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-hover-strong disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              ><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-line-subtle" />

      {/* Section 3: Ngày lễ */}
      <HolidayManager userRole={userRole} adminId={adminId} />

      {/* Section 4: Quy tắc chấm công (chỉ super_admin) */}
      {userRole === 'super_admin' && (
        <>
          <div className="border-t border-line-subtle" />
          <AttendanceRulesConfig userRole={userRole} adminId={adminId} />
        </>
      )}

      {/* ─── Modal gán / đổi mã ─── */}
      {assigning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) guardedCloseAssign(); }}>
          <div className="w-full max-w-md rounded-3xl border border-line" style={{ background: 'var(--card)', animation: 'modalEntrance 0.2s ease' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
              <h2 className="text-base font-700 text-foreground">{assigning.user_id ? 'Đổi nhân viên cho mã' : 'Gán mã cho nhân viên'}</h2>
              <button onClick={guardedCloseAssign} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6 space-y-4" onChange={markAssignDirty}>
              <div className="rounded-xl border border-line-subtle p-3 flex items-center gap-3" style={{ background: 'var(--secondary)' }}>
                <div className="flex h-10 w-12 items-center justify-center rounded-lg bg-indigo-500/15">
                  <span className="text-sm font-700 text-indigo-400">{assigning.employee_code}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  <p><span className="text-foreground font-500">{assigning.punch_count.toLocaleString('vi-VN')}</span> lượt chấm</p>
                  <p>gần nhất: {fmtRelative(assigning.last_seen)}</p>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Gán cho nhân viên *</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    value={userQuery}
                    onChange={(e) => { setUserQuery(e.target.value); setAssignUserId(''); }}
                    placeholder="Gõ tên hoặc email để tìm..."
                    className="h-9 w-full rounded-xl border border-line bg-surface-2 pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500/60 focus:outline-none"
                  />
                  {assignUserId && (
                    <button
                      onClick={() => { setAssignUserId(''); setUserQuery(''); }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    ><X className="h-4 w-4" /></button>
                  )}
                  {/* Dropdown kết quả — chỉ hiện khi đang gõ và chưa chọn */}
                  {userQuery.trim() && !assignUserId && (() => {
                    const q = normalizeVN(userQuery).trim();
                    const matches = users.filter(u =>
                      normalizeVN(u.name).includes(q) || normalizeVN(u.email ?? '').includes(q)
                    ).slice(0, 50);
                    return (
                      <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-line shadow-xl" style={{ background: 'var(--card)' }}>
                        {matches.length === 0 ? (
                          <div className="px-3 py-2.5 text-sm text-muted-foreground">Không tìm thấy nhân viên</div>
                        ) : matches.map((u) => (
                          <button
                            key={u.id}
                            onClick={() => { setAssignUserId(u.id); setUserQuery(`${u.name} (${u.email})`); markAssignDirty(); }}
                            className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-hover transition-colors"
                          >
                            <span className="text-sm font-500 text-foreground">{u.name}</span>
                            <span className="text-xs text-muted-foreground">{u.email}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                {!assigning.user_id && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Toàn bộ {assigning.punch_count.toLocaleString('vi-VN')} lượt chấm của mã này sẽ hiển thị ngay cho nhân viên được chọn.
                  </p>
                )}
              </div>

              {/* Khi mã ĐÃ có chủ → chọn cách xử lý (chuẩn enterprise: temporal) */}
              {assigning.user_id && (
                <div className="space-y-2.5">
                  <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider">Cách xử lý <span className="text-rose-400">* bắt buộc chọn</span></label>
                  <label className="flex items-start gap-2.5 cursor-pointer rounded-xl border border-line p-3 hover:bg-hover transition-colors">
                    <input type="radio" name="assignMode" checked={assignMode === 'correct'} onChange={() => setAssignMode('correct')} className="mt-0.5" />
                    <span className="text-sm">
                      <span className="font-600 text-foreground">Sửa gán nhầm</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">Mã bị gán sai người ngay từ đầu. Toàn bộ lịch sử chuyển sang người mới chọn.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2.5 cursor-pointer rounded-xl border border-line p-3 hover:bg-hover transition-colors">
                    <input type="radio" name="assignMode" checked={assignMode === 'handover'} onChange={() => setAssignMode('handover')} className="mt-0.5" />
                    <span className="text-sm flex-1">
                      <span className="font-600 text-foreground">Bàn giao cho người mới</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">Mã được cấp lại cho nhân viên mới. Công TRƯỚC ngày bàn giao giữ cho người cũ, TỪ ngày bàn giao thuộc người mới.</span>
                      {assignMode === 'handover' && (
                        <DateInputVN
                          value={handoverDate}
                          onChange={(e) => setHandoverDate(e.target.value)}
                          className="mt-2 h-9 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo-500/60 focus:outline-none"
                        />
                      )}
                    </span>
                  </label>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
              <button onClick={guardedCloseAssign} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
              <button onClick={handleAssign} disabled={submitting || !assignUserId || (!!assigning.user_id && !assignMode)} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 disabled:opacity-40">
                {submitting ? 'Đang lưu...' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Slide-in panel: dữ liệu công ─── */}
      {viewing && viewing.user_id && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setViewing(null)} />
          <div className="fixed right-0 top-0 z-50 h-full w-full max-w-lg shadow-2xl flex flex-col" style={{ background: 'var(--background)' }}>
            <div className="flex items-center justify-between border-b border-line px-6 py-4 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-12 items-center justify-center rounded-xl bg-indigo-500/15">
                  <span className="text-sm font-700 text-indigo-400">{viewing.employee_code}</span>
                </div>
                <div>
                  <p className="text-base font-700 text-foreground">{viewing.user_name ?? 'Không rõ'}</p>
                  <p className="text-xs text-muted-foreground">{viewing.user_email}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setExportOpen(true)}
                  title="Xuất bảng công theo khoảng ngày (mỗi tháng 1 sheet)"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-600 text-emerald-300 hover:bg-emerald-500/20 transition-colors">
                  <Download className="h-3.5 w-3.5" /> Xuất bảng công
                </button>
                <button onClick={() => setViewing(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-hover-strong transition-colors"><X className="h-5 w-5" /></button>
              </div>
            </div>

            {/* Modal chọn khoảng ngày để xuất */}
            {exportOpen && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
                onClick={(e) => { if (e.target === e.currentTarget) setExportOpen(false); }}>
                <div className="w-full max-w-md rounded-3xl border border-line overflow-hidden" style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
                    <h2 className="text-base font-700 text-foreground flex items-center gap-2">
                      <CalendarRange className="h-5 w-5 text-emerald-400" /> Xuất Bảng Công
                    </h2>
                    <button onClick={() => setExportOpen(false)} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="p-6 space-y-4">
                    <p className="text-xs text-muted-foreground">
                      Xuất bảng công của <span className="font-600 text-foreground">{viewing.user_name}</span> — mỗi tháng một sheet, giờ vào/giờ ra rõ ràng, ngày trống là "-".
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-2xs font-600 uppercase tracking-wider text-muted-foreground mb-1.5">Từ ngày</label>
                        <DateInputVN value={exportFrom} max={exportTo || undefined} onChange={(e) => setExportFrom(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-line bg-surface-2 text-sm text-foreground focus:border-emerald-500/60 focus:outline-none" />
                      </div>
                      <div>
                        <label className="block text-2xs font-600 uppercase tracking-wider text-muted-foreground mb-1.5">Đến ngày</label>
                        <DateInputVN value={exportTo} min={exportFrom || undefined} onChange={(e) => setExportTo(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-line bg-surface-2 text-sm text-foreground focus:border-emerald-500/60 focus:outline-none" />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
                    <button onClick={() => setExportOpen(false)} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
                    <button onClick={handleExportPerson} disabled={exportBusy}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-600 text-white hover:bg-emerald-500 disabled:opacity-50">
                      {exportBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      Tải Excel
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-b border-line-subtle px-6 py-3 flex-shrink-0">
              <button onClick={() => changeMonth(-1)} className="rounded-lg p-1.5 hover:bg-hover-strong transition-colors text-muted-foreground"><ChevronLeft className="h-4 w-4" /></button>
              <div className="text-center">
                <p className="text-sm font-600 text-foreground">Tháng {viewMonth}/{viewYear}</p>
                {sheet && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {sheet.total_days} ngày • {sheet.total_hours} giờ
                  </p>
                )}
              </div>
              <button onClick={() => changeMonth(1)} className="rounded-lg p-1.5 hover:bg-hover-strong transition-colors text-muted-foreground"><ChevronRight className="h-4 w-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {attLoading ? (
                <div className="flex justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : days.filter(d => d.has_checkin || d.has_checkout).length === 0 ? (
                <div className="flex flex-col items-center py-20 text-muted-foreground">
                  <Clock className="h-8 w-8 mb-3 opacity-30" />
                  <p className="text-sm">Không có dữ liệu công tháng này</p>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.04]">
                  {days.map((day) => {
                    if (!day.has_checkin && !day.has_checkout) return null;
                    const dateObj = new Date(day.date + 'T00:00:00');
                    const weekday = dateObj.toLocaleDateString('vi-VN', { weekday: 'short' });
                    const dayNum = dateObj.getDate();
                    const hours = Math.floor(day.total_minutes / 60);
                    const mins = day.total_minutes % 60;
                    const fmtT = (iso: string | null) => iso
                      ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })
                      : '—';
                    return (
                      <div key={day.date} className="flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.02] transition-colors">
                        <div className="flex-shrink-0 w-10 text-center">
                          <p className="text-[10px] text-muted-foreground uppercase">{weekday}</p>
                          <p className="text-lg font-700 text-foreground leading-tight">{dayNum}</p>
                        </div>
                        <div className="flex-1 flex gap-3">
                          <div className="flex items-center gap-1.5">
                            <LogIn className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                            <span className={`text-sm font-500 ${day.has_checkin ? 'text-foreground' : 'text-muted-foreground'}`}>{fmtT(day.check_in)}</span>
                          </div>
                          <span className="text-muted-foreground opacity-30">·</span>
                          <div className="flex items-center gap-1.5">
                            <LogOut className="h-3.5 w-3.5 text-rose-400 flex-shrink-0" />
                            <span className={`text-sm font-500 ${day.has_checkout ? 'text-foreground' : 'text-muted-foreground'}`}>{fmtT(day.check_out)}</span>
                          </div>
                        </div>
                        {day.total_minutes > 0 && (
                          <div className="flex-shrink-0 text-right">
                            <span className="text-sm font-600 text-indigo-400">{hours > 0 ? `${hours}h` : ''}{mins > 0 ? `${mins}p` : ''}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
