'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Fingerprint, FilePlus, Clock, Plus } from 'lucide-react';
import BuCongModal, { BuCongType } from './BuCongModal';
import { ResolvedAttendanceConfig, DEFAULT_ATTENDANCE_CONFIG, isWeekendDay } from '@/lib/config/attendanceConfig';
import { buildLeaveDayMap, leaveLabel, isDayFullyOff, splitLeavesByColumn,
  type LeaveDayMap, type LeaveRequestRow, type LeaveOnDay, leaveLabelFull,
} from './leaveDayMap';

/** Thẻ loại nghỉ trong ô Giờ Vào / Giờ Ra. Cột hẹp nên truncate + tooltip đủ nhãn. */
function LeaveChip({ lv }: { lv: LeaveOnDay }) {
  const label = leaveLabel(lv);
  return (
    <span
      title={leaveLabelFull(lv)}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-600 truncate max-w-full"
      style={{ background: `${lv.color}26`, color: lv.color, border: `1px solid ${lv.color}55` }}
    >
      🌴 <span className="truncate">{label}</span>
    </span>
  );
}

interface AttendanceRecord {
  id: string;
  event_type: 'check_in' | 'check_out';
  type: 'app' | 'machine';
  recorded_at: string;
  machine_id?: string | null;
  notes?: string | null;
}

interface DailyAttendance {
  date: string;
  check_in: string | null;
  check_out: string | null;
  total_minutes: number;
  has_checkin: boolean;
  has_checkout: boolean;
  records: AttendanceRecord[];
}

interface AdjustmentEntry {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason?: string | null;
  requested_checkin?: string | null;
  requested_checkout?: string | null;
}
interface AdjustmentStatus {
  [dateType: string]: AdjustmentEntry | undefined;
}

interface OvertimeEntry {
  id: string;
  status: string;
  start_time: string;
  end_time: string;
  evening_hours: number;
  night_hours: number;
  reason: string | null;
}

const OT_STATUS: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Chờ duyệt', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  approved:  { label: 'Đã duyệt',  cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  rejected:  { label: 'Từ chối',   cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
  cancelled: { label: 'Đã hủy',    cls: 'bg-slate-500/15 text-ink-muted border-slate-500/30' },
};

interface Props {
  days: DailyAttendance[];
  month: number;
  year: number;
  userId?: string;
  userRole?: string;
  overtimeMap?: Record<string, OvertimeEntry>;
  config?: ResolvedAttendanceConfig;
  onOpenTangCa?: (date: string) => void;
  onRefreshDays?: () => void;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

function fmtFullTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

function fmtHours(mins: number): string {
  if (mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}p`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

function getDayOfWeek(dateStr: string): string {
  const vn = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const d = new Date(dateStr);
  return vn[d.getDay()];
}

// Filter records từ máy chấm công
function getMachineRecords(records: AttendanceRecord[]): AttendanceRecord[] {
  return records.filter(r => r.type === 'machine');
}

export function FingerprintMonthlyTable({ days, month, year, userId = '', userRole = '', overtimeMap = {}, config = DEFAULT_ATTENDANCE_CONFIG, onOpenTangCa, onRefreshDays }: Props) {
  const [expandedDate,  setExpandedDate]  = useState<string | null>(null);
  const [buCongModal,   setBuCongModal]   = useState<{ type: BuCongType; date: string; workMode?: boolean; machineCheckin?: string | null; machineCheckout?: string | null } | null>(null);
  const [adjStatus,     setAdjStatus]     = useState<AdjustmentStatus>({});
  const [holidays,      setHolidays]      = useState<string[]>([]);
  // Ngày nghỉ phép → tô màu + tên loại. Gồm CẢ nguyên ngày, nửa buổi và theo giờ;
  // một ngày có thể có nhiều đơn nên giữ mảng (xem leaveDayMap.ts).
  const [leaveMap, setLeaveMap] = useState<LeaveDayMap>({});

  function fetchLeaves() {
    if (!userId) return;
    fetch(`/api/leave/requests?scope=self&year=${year}`, {
      headers: { 'x-current-user-id': userId, 'x-current-user-role': userRole },
      cache: 'no-store',
    })
      .then(r => r.json())
      .then(j => {
        if (!j.success) return;
        setLeaveMap(buildLeaveDayMap(j.data as LeaveRequestRow[]));
      })
      .catch(() => null);
  }

  function parseAdjMap(data: Array<{ id: string; work_date: string; adjustment_type: string; status: AdjustmentEntry['status']; reason?: string | null; requested_checkin?: string | null; requested_checkout?: string | null }>): AdjustmentStatus {
    const map: AdjustmentStatus = {};
    for (const a of data) {
      const dateKey = new Date(a.work_date).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
      map[`${dateKey}_${a.adjustment_type}`] = {
        id: a.id,
        status: a.status,
        reason: a.reason ?? null,
        requested_checkin: a.requested_checkin ?? null,
        requested_checkout: a.requested_checkout ?? null,
      };
    }
    return map;
  }

  function fetchAdjStatus() {
    if (!userId) return;
    fetch(`/api/attendance/adjustments?selfOnly=1`, {
      headers: { 'x-current-user-id': userId, 'x-current-user-role': userRole },
      cache: 'no-store',
    }).then(r => r.json()).then(j => {
      if (!j.success) return;
      const newMap = parseAdjMap(j.data);
      setAdjStatus(prev => {
        // Nếu có item nào vừa chuyển sang 'approved' → refresh days để Tổng Hợp cập nhật
        const hasNewApproved = Object.entries(newMap).some(
          ([key, entry]) => entry?.status === 'approved' && prev[key]?.status !== 'approved'
        );
        if (hasNewApproved) onRefreshDays?.();
        return newMap;
      });
    }).catch(() => null);
  }

  // Load trạng thái đề xuất + ngày lễ; auto-refresh mỗi 60s để phản ánh kết quả duyệt
  useEffect(() => {
    if (!userId) return;
    fetchAdjStatus();
    fetchLeaves();
    // Ngày lễ năm nay + năm trước (kỳ công có thể span 2 năm)
    fetch(`/api/attendance/holidays?year=${year}`)
      .then(r => r.json()).then(j => {
        if (j.success) setHolidays(j.data.map((h: { date: string }) => h.date));
      }).catch(() => null);
    // Poll mỗi 60s — cập nhật trạng thái khi manager duyệt mà không cần F5
    const timer = setInterval(fetchAdjStatus, 60_000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, userRole, month, year]);

  // Giờ VN hiện tại (dùng timezone chuẩn, không offset thủ công)
  const hourVN  = parseInt(new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hour12: false }));
  const todayVN = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

  function isWorkday(dateStr: string): boolean {
    const dow = new Date(dateStr + 'T00:00:00').getDay();
    if (isWeekendDay(dow, config)) return false; // CN (FADO làm 6 ngày, T7 vẫn làm)
    if (holidays.includes(dateStr)) return false; // Ngày lễ
    return true;
  }

  function getAdjKey(date: string, type: BuCongType) {
    return `${date}_${type}`;
  }

  function canSubmit(dateStr: string, type: BuCongType): boolean {
    // Không nộp cho tương lai
    if (dateStr > todayVN) return false;
    // Chỉ nộp sau giờ quy định nếu là hôm nay và type là bu_cong/bu_checkin
    if (dateStr === todayVN && (type === 'bu_cong' || type === 'bu_checkin') && hourVN < config.adjustmentSameDayEarliestHour) return false;
    // Đã có pending/approved → không gửi thêm
    const st = adjStatus[getAdjKey(dateStr, type)]?.status;
    if (st === 'pending' || st === 'approved') return false;
    return true;
  }

  function getAdjBadge(dateStr: string, type: BuCongType) {
    const st = adjStatus[getAdjKey(dateStr, type)]?.status;
    if (!st) return null;
    const cfg: Record<string, { label: string; cls: string }> = {
      pending:   { label: '🕐 Đang duyệt', cls: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
      approved:  { label: '✅ Đã duyệt',   cls: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
      rejected:  { label: '❌ Từ chối',    cls: 'text-red-400 border-red-500/30 bg-red-500/10' },
      cancelled: { label: '— Đã hủy',      cls: 'text-muted-foreground border-line bg-hover' },
    };
    return cfg[st] ?? null;
  }

  // Days đã được API filter theo kỳ công (28/tháng trước → 27/tháng hiện tại)
  const validDays = days;

  const hasData = validDays.some(d => getMachineRecords(d.records).length > 0);
  // Luôn render table (kể cả khi chưa có records) để hiển thị nút Bù Công

  // Calculate totals (chỉ từ máy)
  const machineRecords = validDays.flatMap(d => getMachineRecords(d.records));
  const totalDays = validDays.filter(d => getMachineRecords(d.records).some(r => r.event_type === 'check_in')).length;
  const totalMinutes = validDays.reduce((sum, d) => sum + d.total_minutes, 0);
  const totalHours = totalMinutes / 60;

  return (
    <>
    {!hasData && (
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-2.5">
        <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0" />
        <p className="text-xs text-amber-400">Chưa có dữ liệu vân tay tháng {month}/{year}. Bạn có thể gửi đề xuất Bù Công cho các ngày làm việc bên dưới.</p>
      </div>
    )}
    <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
      {/* Table header */}
      <div className="flex items-center gap-1.5 lg:gap-3 border-b border-line-subtle px-3 lg:px-4 py-3 bg-slate-500/5">
        <span className="w-11 lg:w-20 text-xs font-600 uppercase tracking-wider text-muted-foreground">Ngày</span>
        <span className="w-7 lg:w-12 text-xs font-600 uppercase tracking-wider text-muted-foreground">Thứ</span>
        <span className="flex-1 text-xs font-600 uppercase tracking-wider text-muted-foreground">Vào</span>
        <span className="flex-1 text-xs font-600 uppercase tracking-wider text-muted-foreground">Ra</span>
        <span className="hidden lg:block w-32 text-xs font-600 uppercase tracking-wider text-muted-foreground">Máy</span>
        <span className="w-12 lg:w-24 text-xs font-600 uppercase tracking-wider text-muted-foreground text-right"><span className="lg:hidden">Giờ</span><span className="hidden lg:inline">Tổng Giờ</span></span>
        <span className="w-9 lg:w-24 text-xs font-600 uppercase tracking-wider text-muted-foreground text-center"><span className="md:hidden">TC</span><span className="hidden md:inline">Tăng Ca</span></span>
        <span className="w-5 lg:w-8"></span>
      </div>

      {/* Table rows */}
      {validDays.map((day) => {
        const dowNum = new Date(day.date + 'T00:00:00').getDay();
        const isWeekend = isWeekendDay(dowNum, config); // Chỉ Chủ nhật nghỉ (T7 vẫn làm)
        const isHolidayDay = holidays.includes(day.date);
        const isRestDay = isWeekend || isHolidayDay;
        const dayLeaves = leaveMap[day.date] ?? [];   // gồm nguyên ngày + nửa buổi + theo giờ
        const leaveInfo = dayLeaves[0];               // dùng cho màu nền / viền trái
        const machineRecsForDay = getMachineRecords(day.records);
        const hasRecord = machineRecsForDay.length > 0;
        const isExpanded = expandedDate === day.date;
        const isPast = day.date < todayVN;
        const isToday = day.date === todayVN;

        const uniqueMachines = [...new Set(machineRecsForDay.map(r => r.machine_id || 'default'))];
        const machineCheckIn  = machineRecsForDay.find(r => r.event_type === 'check_in')?.recorded_at || null;
        const machineCheckOut = machineRecsForDay.filter(r => r.event_type === 'check_out').pop()?.recorded_at || null;

        // Nghỉ TRỌN ngày mới chặn các nút Bù. Nghỉ nửa buổi vẫn phải cho bù phần
        // còn lại — người ta nghỉ sáng nhưng chiều đi làm mà máy không nhận thì sao.
        const lunchStartMin = config.lunchStartHour * 60;
        const lunchEndMin = config.lunchEndHour * 60;
        const fullyOff = dayLeaves.length > 0 && isDayFullyOff(dayLeaves, lunchStartMin, lunchEndMin);
        // Thay cột Vào/Ra bằng thẻ nghỉ khi nghỉ trọn ngày, HOẶC có đơn nghỉ mà không có lượt chấm nào.
        const showLeaveInsteadOfTimes = dayLeaves.length > 0 && (fullyOff || !hasRecord);
        // Nghỉ buổi sáng nằm ở cột Giờ Vào, buổi chiều ở cột Giờ Ra.
        const leaveCols = splitLeavesByColumn(dayLeaves, lunchStartMin, lunchEndMin);

        // Xác định nút Bù cần hiển thị
        const showBuCong    = userId && !isRestDay && !fullyOff && (isPast || isToday) && !machineCheckIn && !machineCheckOut;
        const showBuCheckin = userId && !isRestDay && !fullyOff && (isPast || isToday) && !machineCheckIn && !!machineCheckOut;
        const showBuCheckout= userId && !isRestDay && !fullyOff && (isPast || isToday) && !!machineCheckIn && !machineCheckOut;

        // Ngày làm có đủ vào+ra nhưng tổng giờ chưa đủ 8 tiếng (480p) → cho bù giờ bằng chế độ công đặc biệt
        const under8h = !!userId && !isRestDay && !fullyOff && !!machineCheckIn && !!machineCheckOut
          && day.total_minutes > 0 && day.total_minutes < config.fullWorkdayMinutes;
        // Work-mode ở ô "Bù đủ giờ" = mọi loại trừ bù công thường / bù giờ vào / bù giờ ra
        // (gồm cong_tac/wfh/lam_theo_ca/bù công đặc thù + loại tự tạo). Tìm động theo adjStatus.
        const workModeType = Object.keys(adjStatus)
          .filter(k => k.startsWith(day.date + '_'))
          .map(k => k.slice(day.date.length + 1))
          .find(t => !['bu_cong', 'bu_checkin', 'bu_checkout'].includes(t)) as BuCongType | undefined;
        const workModeBadge = workModeType ? getAdjBadge(day.date, workModeType) : null;

        const ot = overtimeMap[day.date];
        const otStatus = ot ? OT_STATUS[ot.status] : null;

        return (
          <div key={day.date}>
            {/* Main row */}
            <div
              className={`flex items-center gap-1.5 lg:gap-3 border-b border-line-subtle px-3 lg:px-4 py-3 transition-colors ${
                hasRecord ? 'hover:bg-slate-500/5 cursor-pointer' : ''
              } ${isRestDay && !leaveInfo ? 'bg-slate-500/10 opacity-60' : ''}`}
              style={leaveInfo ? { background: `${leaveInfo.color}22`, borderLeft: `3px solid ${leaveInfo.color}` } : undefined}
              onClick={() => hasRecord && setExpandedDate(isExpanded ? null : day.date)}
            >
              {/* Ngày */}
              <span className="w-11 lg:w-20 text-sm font-500 text-foreground">
                {(() => { const d = new Date(day.date + 'T00:00:00'); return `${d.getDate()}/${d.getMonth() + 1}`; })()}
                {isHolidayDay && <span className="ml-1 text-[10px] text-amber-400">🎌</span>}
                {/* Nghỉ MỘT PHẦN mà vẫn có chấm công: giữ cột giờ, đánh dấu ở ô ngày. */}
                {dayLeaves.length > 0 && !showLeaveInsteadOfTimes && (
                  <span className="ml-1 text-[10px]" title={dayLeaves.map(leaveLabelFull).join(' · ')}>🌴</span>
                )}
              </span>
              <span className="w-7 lg:w-12 text-xs text-muted-foreground">{getDayOfWeek(day.date)}</span>

              {showLeaveInsteadOfTimes ? (
                leaveCols.both.length > 0 ? (
                  /* Nghỉ nguyên ngày / vắt qua trưa → trải ngang cả 2 cột */
                  <span className="flex-[2] min-w-0 flex items-center gap-1.5 flex-wrap">
                    {[...leaveCols.both, ...leaveCols.morning, ...leaveCols.afternoon].map((lv, i) => (
                      <LeaveChip key={i} lv={lv} />
                    ))}
                  </span>
                ) : (
                  /* Nghỉ nửa buổi → sáng vào cột Giờ Vào, chiều vào cột Giờ Ra */
                  <>
                    <span className="flex-1 min-w-0 flex items-center gap-1.5">
                      {leaveCols.morning.length > 0
                        ? leaveCols.morning.map((lv, i) => <LeaveChip key={i} lv={lv} />)
                        : <span className="text-muted-foreground/40 text-sm">—</span>}
                    </span>
                    <span className="flex-1 min-w-0 flex items-center gap-1.5">
                      {leaveCols.afternoon.length > 0
                        ? leaveCols.afternoon.map((lv, i) => <LeaveChip key={i} lv={lv} />)
                        : <span className="text-muted-foreground/40 text-sm">—</span>}
                    </span>
                  </>
                )
              ) : (<>
              {/* Cột Giờ Vào */}
              <span className="flex-1 text-sm font-mono flex items-center gap-1.5">
                {machineCheckIn ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    {fmtTime(machineCheckIn)} <Fingerprint className="h-3.5 w-3.5" />
                  </span>
                ) : showBuCheckin ? (
                  getAdjBadge(day.date, 'bu_checkin') ? (
                    <button
                      onClick={e => { e.stopPropagation(); setBuCongModal({ type: 'bu_checkin', date: day.date, machineCheckin: machineCheckIn, machineCheckout: machineCheckOut }); }}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-500 hover:opacity-80 transition-opacity ${getAdjBadge(day.date, 'bu_checkin')!.cls}`}
                      title="Xem chi tiết / Hủy"
                    >
                      {getAdjBadge(day.date, 'bu_checkin')!.label}
                    </button>
                  ) : canSubmit(day.date, 'bu_checkin') ? (
                    <button
                      onClick={e => { e.stopPropagation(); setBuCongModal({ type: 'bu_checkin', date: day.date, machineCheckin: machineCheckIn, machineCheckout: machineCheckOut }); }}
                      className="inline-flex items-center gap-1 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-2.5 py-0.5 text-xs font-600 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                    >
                      <FilePlus className="h-3 w-3" /> Bù Giờ Vào
                    </button>
                  ) : <span className="text-muted-foreground">—</span>
                ) : showBuCong && !machineCheckOut ? (
                  <span className="text-muted-foreground text-xs">—</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </span>

              {/* Cột Giờ Ra */}
              <span className="flex-1 text-sm font-mono flex items-center gap-1.5 flex-wrap">
                {machineCheckOut ? (
                  <>
                    <span className="text-amber-400 flex items-center gap-1">
                      {fmtTime(machineCheckOut)} <Fingerprint className="h-3.5 w-3.5" />
                    </span>
                    {workModeBadge && workModeType ? (
                      <button
                        onClick={e => { e.stopPropagation(); setBuCongModal({ type: workModeType, date: day.date, workMode: true }); }}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-500 hover:opacity-80 transition-opacity ${workModeBadge.cls}`}
                        title="Xem chi tiết / Hủy"
                      >
                        {workModeBadge.label}
                      </button>
                    ) : under8h && canSubmit(day.date, 'cong_tac') ? (
                      <button
                        onClick={e => { e.stopPropagation(); setBuCongModal({ type: 'cong_tac', date: day.date, workMode: true }); }}
                        className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-2xs font-600 text-sky-400 hover:bg-sky-500/20 transition-colors"
                        title="Chưa đủ 8 tiếng — bù giờ bằng chế độ công tác / làm việc tại nhà"
                      >
                        <FilePlus className="h-3 w-3" /> Bù Giờ
                      </button>
                    ) : null}
                  </>
                ) : showBuCheckout ? (
                  getAdjBadge(day.date, 'bu_checkout') ? (
                    <button
                      onClick={e => { e.stopPropagation(); setBuCongModal({ type: 'bu_checkout', date: day.date, machineCheckin: machineCheckIn, machineCheckout: machineCheckOut }); }}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-500 hover:opacity-80 transition-opacity ${getAdjBadge(day.date, 'bu_checkout')!.cls}`}
                      title="Xem chi tiết / Hủy"
                    >
                      {getAdjBadge(day.date, 'bu_checkout')!.label}
                    </button>
                  ) : canSubmit(day.date, 'bu_checkout') ? (
                    <button
                      onClick={e => { e.stopPropagation(); setBuCongModal({ type: 'bu_checkout', date: day.date, machineCheckin: machineCheckIn, machineCheckout: machineCheckOut }); }}
                      className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-600 text-amber-400 hover:bg-amber-500/20 transition-colors"
                    >
                      <FilePlus className="h-3 w-3" /> Bù Giờ Ra
                    </button>
                  ) : <span className="text-muted-foreground">—</span>
                ) : showBuCong && !machineCheckIn ? (
                  <span className="text-muted-foreground text-xs">—</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </span>

              </>)}

              {/* Nút Bù Công cả ngày (không có cả vào lẫn ra) */}
              {showBuCong && (
                <span className="w-32 flex items-center" onClick={e => e.stopPropagation()}>
                  {getAdjBadge(day.date, 'bu_cong') ? (
                    <button
                      onClick={() => setBuCongModal({ type: 'bu_cong', date: day.date })}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-500 hover:opacity-80 transition-opacity ${getAdjBadge(day.date, 'bu_cong')!.cls}`}
                      title="Xem chi tiết / Hủy"
                    >
                      {getAdjBadge(day.date, 'bu_cong')!.label}
                    </button>
                  ) : canSubmit(day.date, 'bu_cong') ? (
                    <button
                      onClick={() => setBuCongModal({ type: 'bu_cong', date: day.date })}
                      className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/10 px-2.5 py-0.5 text-xs font-600 text-rose-400 hover:bg-rose-500/20 transition-colors"
                    >
                      <FilePlus className="h-3 w-3" /> Bù Công
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" /> Sau {config.adjustmentSameDayEarliestHour}:00
                    </span>
                  )}
                </span>
              )}

              {!showBuCong && (
                <span className="hidden lg:block w-32 text-xs text-muted-foreground truncate">
                  {uniqueMachines.length > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-purple-400"></span>
                      {uniqueMachines.join(', ')}
                    </span>
                  ) : '—'}
                </span>
              )}

              <span className={`w-12 lg:w-24 text-sm font-500 text-right ${day.total_minutes > 0 ? 'text-indigo-400' : 'text-muted-foreground'}`}>
                {fmtHours(day.total_minutes)}
              </span>

              {/* Tăng Ca — icon gọn trên mobile (cột TC), đầy đủ trên desktop */}
              <span className="w-16 lg:w-24 flex items-center justify-center" onClick={e => e.stopPropagation()}>
                {otStatus ? (
                  <button
                    onClick={() => onOpenTangCa?.(day.date)}
                    className={`inline-flex items-center gap-1 rounded-full border px-1.5 lg:px-2 py-0.5 text-xs font-500 ${otStatus.cls} hover:opacity-80 transition-opacity`}
                    title={`Tăng ca: ${ot!.start_time} – ${ot!.end_time}`}
                  >
                    <Clock className="h-3 w-3" />
                    <span className="lg:hidden">{ot.status === 'pending' ? 'Chờ' : ot.status === 'approved' ? 'Duyệt' : ot.status === 'rejected' ? 'Từ chối' : 'Hủy'}</span>
                    <span className="hidden lg:inline">{otStatus.label}</span>
                  </button>
                ) : (isPast || isToday) && userId ? (
                  <button
                    onClick={() => onOpenTangCa?.(day.date)}
                    title="Khai báo tăng ca"
                    className="inline-flex items-center gap-1 rounded-full border border-line px-1.5 lg:px-2 py-0.5 text-xs text-muted-foreground hover:border-violet-500/40 hover:text-violet-400 transition-colors"
                  >
                    <Plus className="h-3 w-3" /> <span className="hidden lg:inline">Khai báo</span>
                  </button>
                ) : null}
              </span>

              <span className="w-5 lg:w-8 flex justify-center">
                {hasRecord && (isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />)}
              </span>
            </div>

            {/* Expanded detail rows */}
            {isExpanded && machineRecsForDay.length > 0 && (
              <div className="border-b border-line-subtle bg-slate-900/50 px-4 py-3 space-y-2">
                <p className="text-xs font-600 text-muted-foreground mb-3">Chi tiết {machineRecsForDay.length} bản ghi:</p>
                {machineRecsForDay.map((rec) => (
                  <div key={rec.id} className="rounded-lg border border-line-subtle bg-slate-900/30 p-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-500 flex-shrink-0 ${
                        rec.event_type === 'check_in'
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                      }`}>
                        {rec.event_type === 'check_in' ? '→ Vào' : '← Ra'}
                      </span>
                      <span className="text-xs font-mono text-foreground">{fmtFullTime(rec.recorded_at)}</span>
                      <span className="text-xs text-muted-foreground">(Máy: {rec.machine_id || 'default'})</span>
                    </div>
                    {rec.notes && (
                      <span className="text-xs text-muted-foreground italic ml-2 truncate">"{rec.notes}"</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Footer totals */}
      <div className="flex items-center gap-3 border-t border-line-subtle bg-slate-500/10 px-4 py-3 font-600">
        <span className="w-20 text-sm text-muted-foreground">TỔNG</span>
        <span className="w-12"></span>
        <span className="flex-1"></span>
        <span className="flex-1"></span>
        <span className="w-32"></span>
        <span className="w-24 text-right">
          <span className="text-indigo-400">{totalDays}</span>
          <span className="ml-2 text-muted-foreground text-xs">ngày</span>
          <span className="ml-3 text-emerald-400">{totalHours.toFixed(1)}</span>
          <span className="ml-1 text-muted-foreground text-xs">h</span>
        </span>
        <span className="w-8"></span>
      </div>
    </div>

      {/* Modal Bù Công */}
      {buCongModal && (() => {
        const existing = adjStatus[`${buCongModal.date}_${buCongModal.type}`];
        return (
          <BuCongModal
            type={buCongModal.type}
            workDate={buCongModal.date}
            userId={userId}
            userRole={userRole}
            existingId={existing?.id}
            existingStatus={existing?.status}
            existingReason={existing?.reason ?? undefined}
            existingCheckin={existing?.requested_checkin ?? undefined}
            existingCheckout={existing?.requested_checkout ?? undefined}
            workModeSelect={buCongModal.workMode}
            machineCheckin={buCongModal.machineCheckin}
            machineCheckout={buCongModal.machineCheckout}
            onClose={() => setBuCongModal(null)}
            onSuccess={() => { fetchAdjStatus(); setBuCongModal(null); }}
          />
        );
      })()}
    </>
  );
}
