'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Loader2, Building2, Users, Clock, Crown, Search, Eye,
  Smartphone, MapPin, Camera, ClipboardCheck, AlertCircle,
} from 'lucide-react';
import {
  ResolvedAttendanceConfig, DEFAULT_ATTENDANCE_CONFIG, isWeekendDay,
} from '@/lib/config/attendanceConfig';
import {
  buildLeaveDayMap, leaveLabel, leaveWorkCredit,
  type LeaveOnDay, type LeaveRequestRow, leaveLabelFull
} from '../../tra-cuu/components/leaveDayMap';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Sheet {
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
  comment: string | null;
  submitted_at: string | null;
  sent_to_hr_at: string | null;
  /** Cấp bậc chức vụ: 1=Ban lãnh đạo … 4=Nhân viên, 5=Thực tập */
  position_rank: number | null;
  /** Tên chức danh, vd "Thực Tập Sinh" */
  position_name: string | null;
}

/** Cấp bậc "Thực Tập" theo seed migration 226 — tín hiệu dự phòng khi tên chức danh lạ. */
const INTERN_RANK = 5;

/**
 * Thực tập sinh xét theo CHỨC DANH trước (đúng cách người dùng hiểu), rank chỉ là
 * lưới đỡ. DB đang có 2 biến thể tên "Thực Tập Sinh" / "Thực Tập SInh" nên phải so
 * không dấu, không phân biệt hoa thường.
 */
function isIntern(sheet: Sheet): boolean {
  const name = noAccent(sheet.position_name ?? '');
  if (name.includes('thuc tap') || name.includes('intern')) return true;
  return sheet.position_rank === INTERN_RANK;
}

/** Bù công ĐÃ DUYỆT theo ngày: key = `${user_id}_${YYYY-MM-DD}` */
interface ApprovedAdj { type: string; reason: string | null }
type ApprovedAdjMap = Record<string, ApprovedAdj[]>;

/** Đơn nghỉ ĐÃ DUYỆT theo ngày: key = `${user_id}_${YYYY-MM-DD}` */
type LeaveByUserDay = Record<string, LeaveOnDay[]>;

/** Nhãn ngắn cho từng loại bù công hiện trên dòng ngày. */
const ADJ_LABEL: Record<string, string> = {
  bu_cong: 'Bù công',
  bu_checkin: 'Bù giờ vào',
  bu_checkout: 'Bù giờ ra',
  cong_tac: 'Công tác',
  wfh: 'Làm từ xa',
  lam_theo_ca: 'Làm theo ca',
};

interface AttendanceRecord {
  id: string;
  event_type: 'check_in' | 'check_out';
  type: 'app' | 'machine';
  recorded_at: string;
  lat: number | null;
  lng: number | null;
  photo_mime: string | null;
  notes: string | null;
}
interface DailyAttendance {
  date: string;
  total_minutes: number;
  records: AttendanceRecord[];
}

interface DeptGroup { deptId: string; deptName: string; manager: Sheet | null; members: Sheet[] }
interface CompanyGroup { company: string; depts: DeptGroup[] }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtH(v: number | string) { return Number(v).toFixed(1); }
function getInitials(n: string) { return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
const GRAD = ['from-indigo-500 to-purple-500', 'from-emerald-500 to-teal-500', 'from-amber-500 to-orange-500', 'from-pink-500 to-rose-500', 'from-cyan-500 to-blue-500'];
function grad(n: string) { let h = 0; for (const c of n) h = c.charCodeAt(0) + ((h << 5) - h); return GRAD[Math.abs(h) % GRAD.length]; }
function noAccent(s: string) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase(); }

function statusInfo(sheet: Sheet): { label: string; cls: string } {
  if (sheet.sent_to_hr_at) return { label: 'Đã gửi', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
  switch (sheet.status) {
    case 'submitted': return { label: 'Đã nộp',   cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' };
    case 'approved':  return { label: 'Đã chốt',  cls: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30' };
    case 'rejected':  return { label: 'Cần sửa',  cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
    default:          return { label: 'Chưa nộp', cls: 'bg-slate-500/15 text-ink-muted border-slate-500/30' };
  }
}

function groupSheets(sheets: Sheet[]): CompanyGroup[] {
  // Nhóm theo đơn vị hiệu lực từ org_assignments (API đã tính):
  // - Cấp công ty tường minh (is_company_level) → nhóm riêng 'Ban Lãnh Đạo & Văn Phòng Công Ty'
  // - Trưởng nhóm = người có user_id === dept_head_id (org_role='head'), KHÔNG đoán theo is_manager
  const map: Record<string, Record<string, { deptName: string; headId: string | null; members: Sheet[] }>> = {};
  for (const sh of sheets) {
    const co = sh.company ?? '(Chưa phân công ty)';
    const dk = sh.is_company_level ? '__company__' : (sh.department_id ?? '__');
    const dn = sh.dept_name ?? '(Chưa phân phòng ban)';
    if (!map[co]) map[co] = {};
    if (!map[co][dk]) map[co][dk] = { deptName: dn, headId: null, members: [] };
    if (sh.dept_head_id && !map[co][dk].headId) map[co][dk].headId = sh.dept_head_id;
    map[co][dk].members.push(sh);
  }
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b, 'vi')).map(([company, dm]) => ({
    company,
    depts: Object.entries(dm).sort(([, a], [, b]) => a.deptName.localeCompare(b.deptName, 'vi')).map(([deptId, { deptName, headId, members }]) => {
      const manager = headId ? (members.find(m => m.user_id === headId) ?? null) : null;
      return { deptId, deptName, manager, members: manager ? members.filter(m => m !== manager) : members };
    }),
  }));
}

function fmtTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
}
function fmtHours(mins: number) {
  if (mins <= 0) return '—';
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h === 0) return `${m}p`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}
function getDow(dateStr: string) { return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(dateStr + 'T00:00:00').getDay()]; }

/**
 * Ngưỡng quy đổi NGÀY CÔNG theo tổng giờ làm thực tế (quy định của công ty):
 *   tổng >= 3h30 và < 7h  →  0.5 công
 *   tổng >= 7h            →  1 công
 *   tổng < 3h30           →  0 công
 * Nếu sau này cần chỉnh theo từng công ty thì đưa 2 mốc này vào attendance_settings.
 */
const HALF_DAY_MIN = 3 * 60 + 30; // 210 phút
const FULL_DAY_MIN = 7 * 60;      // 420 phút

/** Quy đổi tổng phút làm trong ngày ra số ngày công. */
function toWorkCredit(totalMinutes: number): number {
  if (totalMinutes >= FULL_DAY_MIN) return 1;
  if (totalMinutes >= HALF_DAY_MIN) return 0.5;
  return 0;
}

// ─── MemberRow — 1 dòng nhân viên, click để xem chi tiết theo ngày ──────────────

function MemberRow({ sheet, isManager = false, callerId, callerRole, callerPerms, config, approvedAdj, leaveByDay }: {
  sheet: Sheet; isManager?: boolean; callerId: string; callerRole: string; callerPerms: string;
  config: ResolvedAttendanceConfig; approvedAdj: ApprovedAdjMap; leaveByDay: LeaveByUserDay;
}) {
  const [expanded, setExpanded] = useState(false);
  const [days, setDays] = useState<DailyAttendance[]>([]);
  const [loadingDays, setLoadingDays] = useState(false);
  const todayVN = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const st = statusInfo(sheet);
  const hasOT = Number(sheet.total_ot_hours) > 0;

  const fetchDays = useCallback(async () => {
    setLoadingDays(true);
    try {
      const res = await fetch(`/api/attendance/user-records?userId=${sheet.user_id}&month=${sheet.month}&year=${sheet.year}`, {
        headers: { 'x-current-user-id': callerId, 'x-current-user-role': callerRole, 'x-user-permissions': callerPerms },
      });
      const json = await res.json();
      if (json.success) setDays(json.data.days ?? []);
    } finally { setLoadingDays(false); }
  }, [sheet.user_id, sheet.month, sheet.year, callerId, callerRole, callerPerms]);

  function toggle() {
    if (!expanded && days.length === 0) fetchDays();
    setExpanded(v => !v);
  }

  return (
    <div className={`border-b border-white/[0.04] last:border-0 ${isManager ? 'bg-amber-500/[0.04]' : ''}`}>
      <button onClick={toggle} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/[0.02] transition-colors text-left">
        <div className={`relative flex-shrink-0 h-8 w-8 rounded-full bg-gradient-to-br flex items-center justify-center text-[11px] font-700 text-white ${grad(sheet.user_name)}`}>
          {getInitials(sheet.user_name)}
          {isManager && (
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 border border-[var(--card)]">
              <Crown className="h-2 w-2 text-white" />
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm truncate ${isManager ? 'font-700 text-amber-300' : 'font-500 text-foreground'}`}>{sheet.user_name}</p>
          {sheet.comment && <p className="text-[11px] text-amber-400/70 italic truncate">💬 {sheet.comment}</p>}
        </div>
        <div className="flex items-center gap-2.5 flex-shrink-0 text-right">
          <div className="hidden sm:block">
            <p className="text-sm font-600 text-emerald-400">{sheet.total_days}<span className="text-[10px] font-400 text-muted-foreground ml-0.5">ngày</span></p>
            <p className="text-xs text-indigo-400">{fmtH(sheet.total_hours)}h</p>
          </div>
          {hasOT && (
            <div className="hidden md:block">
              <p className="text-xs font-600 text-violet-400">+{fmtH(sheet.total_ot_hours)}h</p>
              <p className="text-[10px] text-muted-foreground">tăng ca</p>
            </div>
          )}
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-500 ${st.cls}`}>{st.label}</span>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-line-subtle" style={{ background: 'var(--secondary)' }}>
          {loadingDays ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : days.length === 0 ? (
            <p className="px-4 py-6 text-sm text-center text-muted-foreground opacity-60">Chưa có dữ liệu chấm công</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex items-center gap-1 border-b border-line-subtle px-4 py-2">
                <span className="w-14 text-[10px] font-600 uppercase tracking-wider text-muted-foreground">Ngày</span>
                <span className="w-8 text-[10px] font-600 uppercase tracking-wider text-muted-foreground">Thứ</span>
                <span className="w-16 text-[10px] font-600 uppercase tracking-wider text-muted-foreground">Bù Công</span>
                <span className="w-32 text-[10px] font-600 uppercase tracking-wider text-muted-foreground">Nghỉ Phép</span>
                <span className="w-14 text-[10px] font-600 uppercase tracking-wider text-muted-foreground">Vào</span>
                <span className="w-14 text-[10px] font-600 uppercase tracking-wider text-muted-foreground">Ra</span>
                <span className="w-36 text-[10px] font-600 uppercase tracking-wider text-muted-foreground">Qua Điện Thoại</span>
                <span className="w-16 text-[10px] font-600 uppercase tracking-wider text-muted-foreground text-right">Trễ/Sớm</span>
                <span className="w-16 text-[10px] font-600 uppercase tracking-wider text-muted-foreground text-right">Tổng</span>
                <span className="flex-1 min-w-0 text-[10px] font-600 uppercase tracking-wider text-muted-foreground pl-2">Ghi Chú</span>
                <span className="w-12 text-[10px] font-600 uppercase tracking-wider text-muted-foreground text-right">Công</span>
              </div>
              {days.map(day => {
                const isToday = day.date === todayVN;
                // Cột Vào/Ra: CHỈ vân tay.
                const mCI = day.records.find(r => r.event_type === 'check_in' && r.type === 'machine');
                const mCO = day.records.filter(r => r.event_type === 'check_out' && r.type === 'machine').pop();
                // Cột Qua Điện Thoại: chỉ lượt chấm app THẬT (bắt buộc ảnh hoặc GPS).
                // Bản ghi do duyệt bù công sinh ra cũng là type='app' nhưng không có ảnh/GPS
                // — để nguyên chúng ở cột này sẽ hiểu nhầm là nhân sự tự chấm bằng điện thoại.
                const isRealApp = (r: AttendanceRecord) => r.type === 'app' && (!!r.photo_mime || r.lat != null);
                const aCI = day.records.find(r => r.event_type === 'check_in' && isRealApp(r));
                const aCO = day.records.filter(r => r.event_type === 'check_out' && isRealApp(r)).pop();
                const appRec = aCI ?? aCO;
                const hasGPS = !!(appRec?.lat && appRec?.lng);
                const hasPhoto = !!appRec?.photo_mime;
                const isWeekend = isWeekendDay(new Date(day.date + 'T00:00:00').getDay(), config);
                // Ngày CÓ dữ liệu công mà chưa đủ ngày công chuẩn → tô đỏ để quản lý thấy ngay.
                const under8h = day.total_minutes > 0 && day.total_minutes < config.fullWorkdayMinutes;
                // Trễ/Sớm = NGÀY CÔNG CHUẨN − TỔNG giờ làm (mặc định 8h − tổng).
                // Không tách riêng đi trễ và về sớm nữa: quản lý chỉ cần biết thiếu bao nhiêu,
                // vào trễ rồi ở lại bù thì tổng vẫn đủ và ô này về 0.
                const shortMin = day.total_minutes > 0
                  ? Math.max(0, config.fullWorkdayMinutes - day.total_minutes)
                  : 0;
                const dayLeaves = leaveByDay[`${sheet.user_id}_${day.date}`] ?? [];
                // Công của ngày = công từ giờ làm THỰC TẾ + công từ đơn nghỉ CÓ LƯƠNG,
                // chặn trần 1. Nghỉ không lương không cộng gì (cũng không trừ phần đã làm).
                // VD sáng nghỉ phép năm + chiều đi làm 4h30 → 0.5 + 0.5 = 1.
                const leaveCredit = leaveWorkCredit(dayLeaves);
                const workCredit = day.total_minutes > 0 ? toWorkCredit(day.total_minutes) : 0;
                const credit = (day.total_minutes > 0 || dayLeaves.length > 0)
                  ? Math.min(1, workCredit + leaveCredit)
                  : null;
                // Chỉ ngày ĐÃ DUYỆT mới hiện — đơn chờ duyệt / bị từ chối không tính.
                const adjTypes = approvedAdj[`${sheet.user_id}_${day.date}`] ?? [];
                // Ghi chú = lý do trên đơn đã duyệt, gắn nhãn loại để biết bù công hay WFH.
                const noteFull = [
                  ...adjTypes.map(a => {
                    const label = ADJ_LABEL[a.type] ?? a.type;
                    return a.reason?.trim() ? `${label}: ${a.reason.trim()}` : label;
                  }),
                  // Lý do trên đơn nghỉ phép của ngày này (trước đây bị bỏ quên — chip hiện mà ghi chú trống)
                  ...dayLeaves.filter(l => l.reason).map(leaveLabelFull),
                ].join(' · ');
                return (
                  <div
                    key={day.date}
                    className={`flex items-center gap-1 border-b border-white/[0.04] last:border-0 px-4 py-2 text-sm ${isWeekend ? 'opacity-50' : ''} ${
                      under8h
                        ? 'bg-red-500/10 border-l-2 border-l-red-500/60'
                        : isToday && !isWeekend ? 'border-l-2 border-l-indigo-500/40' : ''
                    }`}
                    title={under8h ? `Chưa đủ ngày công chuẩn (${fmtHours(config.fullWorkdayMinutes)})` : undefined}
                  >
                    <span className={`w-14 text-xs font-500 ${isToday ? 'text-indigo-400 font-700' : 'text-foreground'}`}>
                      {(() => { const d = new Date(day.date + 'T00:00:00'); return `${d.getDate()}/${d.getMonth() + 1}`; })()}
                    </span>
                    <span className="w-8 text-[10px] text-muted-foreground">{getDow(day.date)}</span>
                    {/* Bù công ĐÃ DUYỆT — để quản lý biết ngày thiếu giờ này đã được xử lý */}
                    <span className="w-16 flex items-center">
                      {adjTypes.length > 0 && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-600 text-emerald-400 truncate max-w-full"
                          title={`Đã duyệt: ${adjTypes.map(a => ADJ_LABEL[a.type] ?? a.type).join(' · ')}`}
                        >
                          ✓ {adjTypes.length > 1 ? `${adjTypes.length} bù` : (ADJ_LABEL[adjTypes[0].type] ?? adjTypes[0].type)}
                        </span>
                      )}
                    </span>
                    {/* Nghỉ phép ĐÃ DUYỆT — nghỉ không lương tô đỏ vì không được tính công. */}
                    <span className="w-32 flex items-center gap-1 min-w-0">
                      {dayLeaves.length > 0 ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] font-600 truncate max-w-full"
                          style={{
                            background: `${dayLeaves[0].color}26`,
                            color: dayLeaves[0].color,
                            border: `1px solid ${dayLeaves[0].color}55`,
                          }}
                          title={dayLeaves.map(leaveLabelFull).join(' · ')}
                        >
                          🌴 {dayLeaves.length > 1
                            ? `${dayLeaves.length} đơn nghỉ`
                            : leaveLabel(dayLeaves[0])}
                        </span>
                      ) : <span className="text-muted-foreground/30 text-xs">—</span>}
                    </span>
                    {/* Vào / Ra: CHỈ vân tay — nguồn nào nằm cột nấy, khỏi cần icon. */}
                    <span className="w-14 text-xs font-mono">
                      {mCI ? <span className="text-emerald-400">{fmtTime(mCI.recorded_at)}</span>
                           : <span className="text-muted-foreground/40">—</span>}
                    </span>
                    <span className="w-14 text-xs font-mono">
                      {mCO ? <span className="text-amber-400">{fmtTime(mCO.recorded_at)}</span>
                           : mCI ? <span className="text-[10px] text-amber-500/60">Chưa ra</span>
                           : <span className="text-muted-foreground/40">—</span>}
                    </span>
                    {/* Chấm bằng app điện thoại — vào → ra, kèm dấu GPS / ảnh xác minh. */}
                    <span className="w-36 flex items-center gap-1 text-xs font-mono">
                      {aCI || aCO ? (
                        <>
                          <Smartphone className="h-3 w-3 text-indigo-400 shrink-0" />
                          <span className="text-indigo-300">{aCI ? fmtTime(aCI.recorded_at) : '—'}</span>
                          <span className="text-muted-foreground/40">→</span>
                          <span className="text-indigo-300">{aCO ? fmtTime(aCO.recorded_at) : '—'}</span>
                          {hasGPS && <MapPin className="h-2.5 w-2.5 text-emerald-400 shrink-0" />}
                          {hasPhoto && <Camera className="h-2.5 w-2.5 text-indigo-300 shrink-0" />}
                        </>
                      ) : <span className="text-muted-foreground/40">—</span>}
                    </span>
                    <span
                      className={`w-16 text-xs font-500 text-right ${
                        shortMin > 0 ? 'text-red-400 font-700' : 'text-muted-foreground/40'
                      }`}
                      title={shortMin > 0
                        ? `Thiếu ${fmtHours(shortMin)} so với ngày công chuẩn ${fmtHours(config.fullWorkdayMinutes)}`
                        : undefined}
                    >
                      {shortMin > 0 ? fmtHours(shortMin) : '—'}
                    </span>
                    {/* Không tô đỏ cột Tổng nữa — cả DÒNG đã được highlight khi thiếu giờ. */}
                    <span className={`w-16 text-xs font-500 text-right ${day.total_minutes > 0 ? 'text-indigo-400' : 'text-muted-foreground/40'}`}>
                      {fmtHours(day.total_minutes)}
                    </span>
                    {/* Ghi chú: lý do nhân sự khai khi xin bù công / làm từ xa / công tác. */}
                    <span className="flex-1 min-w-0 pl-2 text-[11px] text-muted-foreground truncate" title={noteFull || undefined}>
                      {noteFull || <span className="text-muted-foreground/30">—</span>}
                    </span>
                    {/* Ngày công quy đổi theo tổng giờ làm: >=7h → 1, >=3h30 → 0.5, còn lại 0 */}
                    <span
                      className={`w-12 text-xs font-700 text-right ${
                        credit === null ? 'text-muted-foreground/40'
                        : credit === 1 ? 'text-emerald-400'
                        : credit === 0.5 ? 'text-amber-400'
                        : 'text-red-400'
                      }`}
                      title={credit === null ? undefined
                        : `Tổng ${fmtHours(day.total_minutes)} → ${credit} ngày công`}
                    >
                      {credit === null ? '—' : credit}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── DeptBlock ────────────────────────────────────────────────────────────────

function DeptBlock({ dept, callerId, callerRole, callerPerms, config, approvedAdj, leaveByDay }: {
  dept: DeptGroup; callerId: string; callerRole: string; callerPerms: string;
  config: ResolvedAttendanceConfig; approvedAdj: ApprovedAdjMap; leaveByDay: LeaveByUserDay;
}) {
  const [open, setOpen] = useState(true);
  const all = dept.manager ? [dept.manager, ...dept.members] : dept.members;
  const totDays = all.reduce((s, m) => s + m.total_days, 0);
  const totHrs = all.reduce((s, m) => s + Number(m.total_hours), 0);
  const totOT = all.reduce((s, m) => s + Number(m.total_ot_hours), 0);
  const sentCnt = all.filter(m => m.sent_to_hr_at).length;

  return (
    <div className="rounded-xl border border-line-subtle overflow-hidden">
      <button className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/[0.02] transition-colors text-left" style={{ background: 'var(--secondary)' }} onClick={() => setOpen(v => !v)}>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-600 text-foreground truncate">{dept.deptName}</p>
          <p className="text-xs text-muted-foreground">{all.length} thành viên{dept.manager && ` · QL: ${dept.manager.user_name}`}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="hidden sm:block text-xs text-emerald-400 font-600">{totDays}ng · {totHrs.toFixed(1)}h{totOT > 0 ? ` · +${totOT.toFixed(1)}h OT` : ''}</span>
          <span className="text-[10px] text-violet-400 bg-violet-500/10 border border-violet-500/30 rounded-full px-2 py-0.5">{sentCnt}/{all.length} đã gửi</span>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div style={{ background: 'var(--card)' }}>
          {dept.manager && <MemberRow sheet={dept.manager} isManager callerId={callerId} callerRole={callerRole} callerPerms={callerPerms} config={config} approvedAdj={approvedAdj} leaveByDay={leaveByDay} />}
          {dept.members.map(m => <MemberRow key={m.id} sheet={m} callerId={callerId} callerRole={callerRole} callerPerms={callerPerms} config={config} approvedAdj={approvedAdj} leaveByDay={leaveByDay} />)}
        </div>
      )}
    </div>
  );
}

// ─── CompanyBlock ─────────────────────────────────────────────────────────────

function CompanyBlock({ group, callerId, callerRole, callerPerms, config, approvedAdj, leaveByDay }: {
  group: CompanyGroup; callerId: string; callerRole: string; callerPerms: string;
  config: ResolvedAttendanceConfig; approvedAdj: ApprovedAdjMap; leaveByDay: LeaveByUserDay;
}) {
  const [open, setOpen] = useState(true);
  const allSh = group.depts.flatMap(d => d.manager ? [d.manager, ...d.members] : d.members);
  const totDays = allSh.reduce((s, m) => s + m.total_days, 0);
  const totHrs = allSh.reduce((s, m) => s + Number(m.total_hours), 0);

  return (
    <div className="rounded-2xl border border-line overflow-hidden" style={{ background: 'var(--card)' }}>
      <button className="w-full flex items-center gap-3 px-4 py-4 border-b border-line-subtle hover:bg-white/[0.02] transition-colors text-left" onClick={() => setOpen(v => !v)}>
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-500/15">
          <Building2 className="h-5 w-5 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-700 text-foreground truncate">{group.company}</p>
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
      {open && (
        <div className="p-3 space-y-2.5">
          {group.depts.map(dept => <DeptBlock key={dept.deptId} dept={dept} callerId={callerId} callerRole={callerRole} callerPerms={callerPerms} config={config} approvedAdj={approvedAdj} leaveByDay={leaveByDay} />)}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function BangCongClient() {
  const [userId, setUserId] = useState('');
  const [userRole, setUserRole] = useState('');
  const [userPerms, setUserPerms] = useState('{}');

  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  // Cấu hình chấm công (giờ vào/ra chuẩn, dung sai, ngưỡng đủ ngày công) — neo ngày 15
  // của kỳ như các màn khác. Chưa fetch xong thì dùng mặc định để bảng vẫn render được.
  const [config, setConfig] = useState<ResolvedAttendanceConfig>(DEFAULT_ATTENDANCE_CONFIG);

  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'submitted' | 'draft'>('all');
  // Nhân viên vs Thực tập sinh — suy từ CẤP BẬC chức vụ (positions.rank), vì cột
  // employment_type gần như bỏ trống nên lọc theo nó không ra kết quả.
  const [staffFilter, setStaffFilter] = useState<'all' | 'staff' | 'intern'>('all');
  // Bù công ĐÃ DUYỆT của cả team trong kỳ, gom theo (user, ngày).
  const [approvedAdj, setApprovedAdj] = useState<ApprovedAdjMap>({});
  // Đơn nghỉ ĐÃ DUYỆT của cả team, gom theo (user, ngày).
  const [leaveByDay, setLeaveByDay] = useState<LeaveByUserDay>({});

  useEffect(() => {
    const stored = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        setUserId(u.id ?? '');
        setUserRole(u.role ?? '');
        setUserPerms(JSON.stringify(u.module_permissions ?? {}));
      } catch { /* empty */ }
    }
  }, []);

  const fetchSheets = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/attendance/team?month=${month}&year=${year}`, {
        headers: { 'x-current-user-id': userId, 'x-current-user-role': userRole, 'x-user-permissions': userPerms },
      });
      const json = await res.json();
      if (json.success) setSheets(json.data ?? []);
      else setError(json.detail ? `${json.error}: ${json.detail}` : (json.error ?? 'Không thể tải bảng công'));
    } catch {
      setError('Lỗi kết nối, vui lòng thử lại');
    } finally { setLoading(false); }
  }, [userId, userRole, userPerms, month, year]);

  useEffect(() => { fetchSheets(); }, [fetchSheets]);

  // Bù công ĐÃ DUYỆT của team. Kỳ công 28→27 trải qua HAI tháng lịch nên phải gọi
  // cả tháng hiện tại lẫn tháng trước — API lọc theo EXTRACT(MONTH FROM work_date).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const prevMonthNum = month === 1 ? 12 : month - 1;
    const prevYearNum = month === 1 ? year - 1 : year;
    const headers = { 'x-current-user-id': userId, 'x-current-user-role': userRole, 'x-user-permissions': userPerms };
    const get = (m: number, y: number) =>
      fetch(`/api/attendance/adjustments?status=approved&month=${m}&year=${y}`, { headers, cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then(j => (j?.success && Array.isArray(j.data) ? j.data : []))
        .catch(() => []);

    Promise.all([get(month, year), get(prevMonthNum, prevYearNum)]).then(([a, b]) => {
      if (cancelled) return;
      const map: ApprovedAdjMap = {};
      for (const adj of [...a, ...b]) {
        if (adj?.status !== 'approved') continue; // chốt lại ở client, không tin mỗi query param
        const dateKey = new Date(adj.work_date).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
        const key = `${adj.user_id}_${dateKey}`;
        (map[key] ||= []).push({ type: adj.adjustment_type, reason: adj.reason ?? null });
      }
      setApprovedAdj(map);
    });
    return () => { cancelled = true; };
  }, [userId, userRole, userPerms, month, year]);

  // Đơn nghỉ ĐÃ DUYỆT của team. API lọc theo NĂM của start_date; kỳ công tháng 1
  // trải sang tháng 12 năm trước nên khi đó phải lấy thêm năm trước.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const headers = { 'x-current-user-id': userId, 'x-current-user-role': userRole, 'x-user-permissions': userPerms };
    const years = month === 1 ? [year, year - 1] : [year];
    Promise.all(
      years.map(y =>
        fetch(`/api/leave/requests?status=approved&year=${y}`, { headers, cache: 'no-store' })
          .then(r => (r.ok ? r.json() : null))
          .then(j => (j?.success && Array.isArray(j.data) ? j.data : []))
          .catch(() => [])
      )
    ).then(chunks => {
      if (cancelled) return;
      // Gom theo user rồi mới dựng map ngày — dùng lại buildLeaveDayMap để nghỉ nửa
      // buổi / theo giờ / nghỉ nhiều ngày được bung đúng như bên Tra Cứu.
      const byUser = new Map<string, LeaveRequestRow[]>();
      for (const lr of chunks.flat()) {
        if (lr?.status !== 'approved' || !lr.user_id) continue;
        const arr = byUser.get(String(lr.user_id)) ?? [];
        arr.push(lr as LeaveRequestRow);
        byUser.set(String(lr.user_id), arr);
      }
      const out: LeaveByUserDay = {};
      for (const [uid, rows] of byUser) {
        const perDay = buildLeaveDayMap(rows);
        for (const [dateKey, list] of Object.entries(perDay)) out[`${uid}_${dateKey}`] = list;
      }
      setLeaveByDay(out);
    });
    return () => { cancelled = true; };
  }, [userId, userRole, userPerms, month, year]);

  useEffect(() => {
    if (!userId) return;
    const anchor = `${year}-${String(month).padStart(2, '0')}-15`;
    let cancelled = false;
    fetch(`/api/attendance/config?date=${anchor}`, { headers: { 'x-current-user-id': userId } })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled && j?.success && j.data) setConfig(j.data); })
      .catch(() => { /* giữ mặc định */ });
    return () => { cancelled = true; };
  }, [userId, month, year]);

  function prevMonth() { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); }

  // Danh sách công ty / phòng ban cho dropdown lọc
  const companies = useMemo(() => [...new Set(sheets.map(s => s.company ?? '(Chưa phân công ty)'))].sort((a, b) => a.localeCompare(b, 'vi')), [sheets]);
  const departments = useMemo(() => {
    const scope = companyFilter === 'all' ? sheets : sheets.filter(s => (s.company ?? '(Chưa phân công ty)') === companyFilter);
    return [...new Set(scope.map(s => s.dept_name ?? '(Chưa phân phòng ban)'))].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [sheets, companyFilter]);

  const filtered = useMemo(() => {
    const q = noAccent(search.trim());
    return sheets.filter(s => {
      if (companyFilter !== 'all' && (s.company ?? '(Chưa phân công ty)') !== companyFilter) return false;
      if (deptFilter !== 'all' && (s.dept_name ?? '(Chưa phân phòng ban)') !== deptFilter) return false;
      if (statusFilter === 'sent' && !s.sent_to_hr_at) return false;
      if (statusFilter === 'submitted' && (s.sent_to_hr_at || s.status !== 'submitted')) return false;
      if (statusFilter === 'draft' && (s.sent_to_hr_at || s.status !== 'draft')) return false;
      // Chỉ TTS = đúng người có chức danh thực tập sinh.
      // Chỉ Nhân viên = TẤT CẢ những người còn lại (kể cả chưa gán chức vụ) trừ TTS.
      const intern = isIntern(s);
      if (staffFilter === 'intern' && !intern) return false;
      if (staffFilter === 'staff' && intern) return false;
      if (q && !noAccent(s.user_name).includes(q)) return false;
      return true;
    });
  }, [sheets, search, companyFilter, deptFilter, statusFilter, staffFilter]);

  const groups = useMemo(() => groupSheets(filtered), [filtered]);
  const totalDays = filtered.reduce((s, sh) => s + sh.total_days, 0);
  const totalHours = filtered.reduce((s, sh) => s + Number(sh.total_hours), 0);
  const sentCount = filtered.filter(s => s.sent_to_hr_at).length;

  const selectCls = 'rounded-xl border border-line bg-[#162033] px-3 py-2 text-sm text-foreground focus:border-indigo-500/60 focus:outline-none';

  return (
    <div className="animate-fadeIn space-y-5">
      <div>
        <Link href="/tra-cuu/du-lieu-cong" className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Dữ Liệu Chấm Công
        </Link>
        <h1 className="text-xl sm:text-2xl font-700 text-foreground">Theo Dõi Dữ Liệu Chấm Công</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          Xem bảng công theo Công Ty / Phòng Ban — hệ thống tự gửi về Bộ Phận Chấm Công khi tới hạn
        </p>
      </div>

      {/* Banner chỉ xem */}
      <div className="flex items-start gap-3 rounded-2xl border border-indigo-500/25 bg-indigo-500/8 px-4 py-3">
        <Eye className="h-4 w-4 text-indigo-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs sm:text-sm text-muted-foreground">
          <span className="font-600 text-foreground">Chế độ chỉ xem.</span> Bảng công do nhân viên tự chấm; hệ thống <span className="text-indigo-400 font-600">tự động gửi</span> về Bộ Phận Chấm Công khi tới hạn.
        </p>
      </div>

      {/* Month selector */}
      <div className="flex items-center justify-between rounded-2xl border border-line-subtle px-4 py-3" style={{ background: 'var(--card)' }}>
        <button onClick={prevMonth} className="btn-ghost rounded-lg p-1.5"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-sm font-600 text-foreground">Tháng {month} / {year}</span>
        <button onClick={nextMonth} className="btn-ghost rounded-lg p-1.5"><ChevronRight className="h-4 w-4" /></button>
      </div>

      {/* Search + Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo tên nhân viên..."
            className="w-full rounded-xl border border-line bg-[#162033] pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500/60 focus:outline-none"
          />
        </div>
        <select value={companyFilter} onChange={e => { setCompanyFilter(e.target.value); setDeptFilter('all'); }} className={selectCls}>
          <option value="all">Tất cả công ty</option>
          {companies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className={selectCls}>
          <option value="all">Tất cả phòng ban</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={staffFilter} onChange={e => setStaffFilter(e.target.value as typeof staffFilter)} className={selectCls}>
          <option value="all">Tất cả nhân sự</option>
          <option value="staff">Chỉ Nhân viên</option>
          <option value="intern">Chỉ Thực tập sinh</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} className={selectCls}>
          <option value="all">Tất cả trạng thái</option>
          <option value="sent">Đã gửi Chấm Công</option>
          <option value="submitted">Đã nộp</option>
          <option value="draft">Chưa nộp</option>
        </select>
      </div>

      {/* Stats */}
      {!loading && sheets.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { val: filtered.length, label: 'Nhân sự', color: 'text-foreground', icon: <Users className="h-3 w-3" /> },
            { val: totalDays, label: 'Ngày công', color: 'text-emerald-400', icon: null },
            { val: totalHours.toFixed(1), label: 'Giờ công', color: 'text-indigo-400', icon: <Clock className="h-3 w-3" /> },
            { val: `${sentCount}/${filtered.length}`, label: 'Đã gửi', color: 'text-violet-400', icon: null },
          ].map(({ val, label, color, icon }) => (
            <div key={label} className="rounded-xl border border-line-subtle p-3 text-center" style={{ background: 'var(--card)' }}>
              <p className={`text-2xl font-700 ${color}`}>{val}</p>
              <p className="mt-1 text-[11px] text-muted-foreground flex items-center justify-center gap-1">{icon}{label}</p>
            </div>
          ))}
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
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-line-subtle" style={{ background: 'var(--card)' }}>
          <ClipboardCheck className="h-10 w-10 mb-3 opacity-30 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {sheets.length === 0 ? `Chưa có bảng công nào tháng ${month}/${year}` : 'Không có bảng công nào khớp bộ lọc'}
          </p>
          {sheets.length === 0 && <p className="text-xs mt-1 opacity-60 text-muted-foreground">Nhân viên chưa chấm công trong tháng này</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => (
            <CompanyBlock key={group.company} group={group} callerId={userId} callerRole={userRole} callerPerms={userPerms} config={config} approvedAdj={approvedAdj} leaveByDay={leaveByDay} />
          ))}
        </div>
      )}
    </div>
  );
}
