'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Smartphone, Fingerprint, MapPin, Camera, Clock, Plus, X, CheckCircle2 } from 'lucide-react';
import BuCongModal, { BuCongType } from './BuCongModal';
import { ResolvedAttendanceConfig, DEFAULT_ATTENDANCE_CONFIG, isWeekendDay } from '@/lib/config/attendanceConfig';
import { useEscapeKey } from '@/hooks/useEscapeKey';
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
  lat: number | null;
  lng: number | null;
  photo_mime: string | null;
  notes: string | null;
  machine_id?: string | null;
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

const ADJ_STATUS: Record<string, { label: string; cls: string }> = {
  pending:  { label: 'Chờ duyệt', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  approved: { label: 'Đã duyệt',  cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  rejected: { label: 'Từ chối',   cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

interface Props {
  days: DailyAttendance[];
  month: number;
  year: number;
  tabFilter: 'all' | 'app';
  userId?: string;
  userRole?: string;
  overtimeMap?: Record<string, OvertimeEntry>;
  config?: ResolvedAttendanceConfig;
  onOpenTangCa?: (date: string) => void;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('vi-VN', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

function fmtFullTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
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
  return vn[new Date(dateStr + 'T00:00:00').getDay()];
}

function isWeekend(dateStr: string, cfg: ResolvedAttendanceConfig): boolean {
  const dow = new Date(dateStr + 'T00:00:00').getDay();
  return isWeekendDay(dow, cfg); // Chỉ Chủ nhật nghỉ (T7 vẫn làm như Vân Tay)
}

export function AppMonthlyTable({ days, month, year, tabFilter, userId = '', userRole = '', overtimeMap = {}, config = DEFAULT_ATTENDANCE_CONFIG, onOpenTangCa }: Props) {
  const LUNCH_START_MIN = config.lunchStartHour * 60;
  const LUNCH_END_MIN = config.lunchEndHour * 60;
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [photoModal, setPhotoModal] = useState<{ recordId: string; time: string } | null>(null);
  const [buCongModal, setBuCongModal] = useState<{ type: BuCongType; date: string } | null>(null);
  // adjStatus: key = "YYYY-MM-DD_type", value = full entry (id, status, reason, checkin, checkout)
  const [adjStatus, setAdjStatus] = useState<Record<string, { id: string; status: string; reason?: string | null; requested_checkin?: string | null; requested_checkout?: string | null }>>({});
  // Ngày nghỉ phép → tô màu + tên loại. Gồm CẢ nguyên ngày, nửa buổi và theo giờ;
  // một ngày có thể có nhiều đơn (sáng loại này, chiều loại khác) nên giữ mảng.
  const [leaveMap, setLeaveMap] = useState<LeaveDayMap>({});

  useEffect(() => {
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
  }, [userId, userRole, year]);

  const todayVN = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

  // ESC đóng modal xem ảnh chấm công (chỉ xem)
  const closePhoto = useCallback(() => setPhotoModal(null), []);
  useEscapeKey(closePhoto, !!photoModal);

  useEffect(() => {
    fetch(`/api/attendance/holidays?year=${year}`)
      .then(r => r.json())
      .then(j => { if (j.success) setHolidays(j.data.map((h: { date: string }) => h.date)); })
      .catch(() => null);
  }, [year]);

  const fetchAdjStatus = useCallback(() => {
    if (!userId) return;
    fetch(`/api/attendance/adjustments?selfOnly=1`, {
      headers: { 'x-current-user-id': userId, 'x-current-user-role': userRole },
      cache: 'no-store',
    })
      .then(r => r.json())
      .then(j => {
        if (!j.success) return;
        const map: Record<string, { id: string; status: string; reason?: string | null; requested_checkin?: string | null; requested_checkout?: string | null }> = {};
        for (const a of j.data) {
          const dateKey = new Date(a.work_date).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
          map[`${dateKey}_${a.adjustment_type}`] = {
            id: a.id,
            status: a.status,
            reason: a.reason ?? null,
            requested_checkin: a.requested_checkin ?? null,
            requested_checkout: a.requested_checkout ?? null,
          };
        }
        setAdjStatus(map);
      })
      .catch(() => null);
  }, [userId, userRole]);

  useEffect(() => {
    fetchAdjStatus();
    const id = setInterval(fetchAdjStatus, 60_000);
    return () => clearInterval(id);
  }, [fetchAdjStatus]);

  // Lọc records theo tab
  function getFilteredRecords(records: AttendanceRecord[]): AttendanceRecord[] {
    if (tabFilter === 'all') return records;
    return records.filter(r => r.type === tabFilter);
  }

  // Tính tổng thống kê
  const totalDays = days.filter(d => {
    const filtered = getFilteredRecords(d.records);
    return filtered.some(r => r.event_type === 'check_in');
  }).length;

  const totalMinutes = days.reduce((sum, d) => {
    const filtered = getFilteredRecords(d.records);
    const ci = filtered.find(r => r.event_type === 'check_in');
    const co = filtered.filter(r => r.event_type === 'check_out').pop();
    if (!ci || !co) return sum;
    let mins = Math.max(0, Math.round(
      (new Date(co.recorded_at).getTime() - new Date(ci.recorded_at).getTime()) / 60000
    ));
    // Trừ phần chồng lấp thực tế với khung nghỉ trưa 12:00–13:00 (VN timezone)
    const getVNMins = (iso: string) => {
      const s = new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false });
      const [hh, mm] = s.split(':').map(Number);
      return (hh % 24) * 60 + mm;
    };
    const ciMins = getVNMins(ci.recorded_at);
    const coMins = getVNMins(co.recorded_at);
    const lunchOverlap = Math.max(0, Math.min(coMins, LUNCH_END_MIN) - Math.max(ciMins, LUNCH_START_MIN));
    mins = Math.max(0, mins - lunchOverlap);
    return sum + mins;
  }, 0);

  const hasAnyData = days.some(d => getFilteredRecords(d.records).length > 0);

  const sourceLabel = tabFilter === 'app' ? 'App' : 'App + Vân Tay';

  return (
    <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>

      {/* Sub-header label */}
      <div className="flex items-center gap-2 border-b border-line-subtle px-4 py-2.5 bg-indigo-500/5">
        <Smartphone className="h-3.5 w-3.5 text-indigo-400" />
        <span className="text-xs font-600 text-indigo-400">{sourceLabel}</span>
        {!hasAnyData && (
          <span className="ml-auto text-xs text-muted-foreground">Chưa có dữ liệu tháng {month}/{year}</span>
        )}
      </div>

      {/* Table header */}
      <div className="flex items-center gap-2 border-b border-line-subtle bg-slate-500/5 px-4 py-2.5">
        <span className="w-16 text-xs font-600 uppercase tracking-wider text-muted-foreground">Ngày</span>
        <span className="w-10 text-xs font-600 uppercase tracking-wider text-muted-foreground">Thứ</span>
        <span className="flex-1 text-xs font-600 uppercase tracking-wider text-muted-foreground">Giờ Vào</span>
        <span className="flex-1 text-xs font-600 uppercase tracking-wider text-muted-foreground">Giờ Ra</span>
        <span className="w-16 text-xs font-600 uppercase tracking-wider text-muted-foreground hidden sm:block">
          {tabFilter === 'app' ? 'GPS/Ảnh' : 'Nguồn'}
        </span>
        <span className="w-20 text-xs font-600 uppercase tracking-wider text-muted-foreground text-right">Tổng Giờ</span>
        <span className="w-24 text-xs font-600 uppercase tracking-wider text-muted-foreground text-center hidden md:block">Tăng Ca</span>
        <span className="w-24 text-xs font-600 uppercase tracking-wider text-muted-foreground text-center hidden lg:block">Bù Công</span>
        <span className="w-6"></span>
      </div>

      {/* Table rows */}
      {days.map((day) => {
        const isHolidayDay  = holidays.includes(day.date);
        const isRestDay     = isWeekend(day.date, config) || isHolidayDay;
        const dayLeaves     = leaveMap[day.date] ?? [];   // gồm nguyên ngày + nửa buổi + theo giờ
        const leaveInfo     = dayLeaves[0];               // dùng cho màu nền / viền trái
        const isToday       = day.date === todayVN;
        const isFutureDay   = day.date > todayVN;
        const filteredRecs  = getFilteredRecords(day.records);
        const hasRecord     = filteredRecs.length > 0;
        const isExpanded    = expandedDate === day.date;
        // Thay cột Vào/Ra bằng thẻ nghỉ khi nghỉ trọn ngày, HOẶC khi có đơn nghỉ mà
        // hôm đó không có lượt chấm nào (nếu không dòng sẽ trống trơn như ngày vắng).
        const showLeaveInsteadOfTimes = dayLeaves.length > 0 && (isDayFullyOff(dayLeaves, LUNCH_START_MIN, LUNCH_END_MIN) || !hasRecord);
        // Nghỉ buổi sáng nằm ở cột Giờ Vào, buổi chiều ở cột Giờ Ra — đọc thẳng
        // như bảng công giấy. Nguyên ngày / vắt qua trưa thì trải ngang cả hai.
        const leaveCols = splitLeavesByColumn(dayLeaves, LUNCH_START_MIN, LUNCH_END_MIN);

        const checkInRec  = filteredRecs.find(r => r.event_type === 'check_in');
        const checkOutRec = filteredRecs.filter(r => r.event_type === 'check_out').pop();

        // Tính giờ riêng theo filtered records — có trừ 1h nghỉ trưa (VN timezone)
        const getVNMinsRow = (iso: string) => {
          const s = new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false });
          const [hh, mm] = s.split(':').map(Number);
          return (hh % 24) * 60 + mm;
        };
        let filteredMins = 0;
        if (checkInRec && checkOutRec) {
          filteredMins = Math.max(0, Math.round(
            (new Date(checkOutRec.recorded_at).getTime() - new Date(checkInRec.recorded_at).getTime()) / 60000
          ));
          const ciMins = getVNMinsRow(checkInRec.recorded_at);
          const coMins = getVNMinsRow(checkOutRec.recorded_at);
          const lunchOverlap = Math.max(0, Math.min(coMins, LUNCH_END_MIN) - Math.max(ciMins, LUNCH_START_MIN));
          filteredMins = Math.max(0, filteredMins - lunchOverlap);
        }

        // GPS / Photo indicators (cho app records)
        const appCheckIn  = filteredRecs.find(r => r.event_type === 'check_in' && r.type === 'app');
        const hasGPS      = !!(appCheckIn?.lat && appCheckIn?.lng);
        // Ảnh: lấy bản ghi app BẤT KỲ có ảnh (vào hoặc ra) để cho bấm xem ngay ở dòng thu gọn
        const appPhotoRec = filteredRecs.find(r => r.type === 'app' && r.photo_mime);
        const hasPhoto    = !!appPhotoRec;

        // Source indicator for 'all' tab
        const sourceTypes = [...new Set(filteredRecs.map(r => r.type))];

        const ot = overtimeMap[day.date];
        const otStatus = ot ? OT_STATUS[ot.status] : null;

        // Badge bù công: lấy status ưu tiên theo thứ tự bu_cong > bu_checkin > bu_checkout
        const adjKey = (['bu_cong', 'bu_checkin', 'bu_checkout'] as const)
          .map(t => ({ type: t, entry: adjStatus[`${day.date}_${t}`] }))
          .find(x => x.entry);
        const adjBadge = adjKey?.entry ? ADJ_STATUS[adjKey.entry.status] : null;

        return (
          <div key={day.date}>
            <div
              className={`flex items-center gap-2 border-b border-white/[0.04] px-4 py-3 transition-colors last:border-0 ${
                hasRecord && !isFutureDay ? 'hover:bg-white/[0.02] cursor-pointer' : ''
              } ${isRestDay && !leaveInfo ? 'bg-slate-500/5 opacity-50' : ''} ${
                isToday && !isRestDay && !leaveInfo ? 'bg-indigo-500/5 border-l-2 border-l-indigo-500/50' : ''
              }`}
              style={leaveInfo ? { background: `${leaveInfo.color}22`, borderLeft: `3px solid ${leaveInfo.color}` } : undefined}
              onClick={() => hasRecord && !isFutureDay && setExpandedDate(isExpanded ? null : day.date)}
            >
              {/* Ngày */}
              <span className={`w-16 text-sm font-500 ${isToday ? 'text-indigo-400 font-700' : 'text-foreground'}`}>
                {(() => {
                  const d = new Date(day.date + 'T00:00:00');
                  return `${d.getDate()}/${d.getMonth() + 1}`;
                })()}
                {isHolidayDay && <span className="ml-1 text-[10px] text-amber-400">🎌</span>}
                {isToday && <span className="ml-1 text-[10px] text-indigo-400">●</span>}
                {/* Nghỉ MỘT PHẦN mà vẫn có chấm công: giữ cột giờ, đánh dấu ở ô ngày. */}
                {dayLeaves.length > 0 && !showLeaveInsteadOfTimes && (
                  <span className="ml-1 text-[10px]" title={dayLeaves.map(leaveLabelFull).join(' · ')}>🌴</span>
                )}
              </span>

              {/* Thứ */}
              <span className="w-10 text-xs text-muted-foreground">{getDayOfWeek(day.date)}</span>

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
              {/* Giờ Vào */}
              <span className="flex-1 text-sm font-mono flex items-center gap-1.5">
                {checkInRec ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    {fmtTime(checkInRec.recorded_at)}
                    {checkInRec.type === 'machine'
                      ? <Fingerprint className="h-3 w-3 opacity-60" />
                      : <Smartphone className="h-3 w-3 opacity-60" />
                    }
                  </span>
                ) : (
                  <span className="text-muted-foreground/40">—</span>
                )}
              </span>

              {/* Giờ Ra */}
              <span className="flex-1 text-sm font-mono flex items-center gap-1.5">
                {checkOutRec ? (
                  <span className="text-amber-400 flex items-center gap-1">
                    {fmtTime(checkOutRec.recorded_at)}
                    {checkOutRec.type === 'machine'
                      ? <Fingerprint className="h-3 w-3 opacity-60" />
                      : <Smartphone className="h-3 w-3 opacity-60" />
                    }
                  </span>
                ) : checkInRec && !isFutureDay ? (
                  <span className="text-amber-500/60 text-xs">Chưa ra</span>
                ) : (
                  <span className="text-muted-foreground/40">—</span>
                )}
              </span>

              </>)}

              {/* GPS/Photo (app) hoặc Source (all) */}
              <span className="w-16 hidden sm:flex items-center gap-1" onClick={e => e.stopPropagation()}>
                {tabFilter === 'app' ? (
                  <>
                    {hasGPS && <MapPin className="h-3 w-3 text-emerald-400" />}
                    {hasPhoto && appPhotoRec && (
                      <button
                        onClick={() => setPhotoModal({ recordId: appPhotoRec.id, time: fmtFullTime(appPhotoRec.recorded_at) })}
                        title="Xem ảnh chấm công"
                        className="rounded p-0.5 hover:bg-indigo-500/20 transition-colors">
                        <Camera className="h-3.5 w-3.5 text-indigo-400" />
                      </button>
                    )}
                    {!hasGPS && !hasPhoto && hasRecord && <span className="text-muted-foreground/40 text-xs">—</span>}
                  </>
                ) : (
                  <div className="flex items-center gap-1">
                    {sourceTypes.includes('app')     && <Smartphone  className="h-3 w-3 text-indigo-400"  />}
                    {sourceTypes.includes('machine') && <Fingerprint className="h-3 w-3 text-purple-400" />}
                    {hasPhoto && appPhotoRec && (
                      <button
                        onClick={() => setPhotoModal({ recordId: appPhotoRec.id, time: fmtFullTime(appPhotoRec.recorded_at) })}
                        title="Xem ảnh chấm công"
                        className="rounded p-0.5 hover:bg-indigo-500/20 transition-colors">
                        <Camera className="h-3.5 w-3.5 text-indigo-400" />
                      </button>
                    )}
                  </div>
                )}
              </span>

              {/* Tổng giờ */}
              <span className={`w-20 text-sm font-500 text-right ${filteredMins > 0 ? 'text-indigo-400' : 'text-muted-foreground/40'}`}>
                {fmtHours(filteredMins)}
              </span>

              {/* Tăng Ca */}
              <span className="w-16 sm:w-24 flex items-center justify-center" onClick={e => e.stopPropagation()}>
                {otStatus ? (
                  <button
                    onClick={() => onOpenTangCa?.(day.date)}
                    className={`inline-flex items-center gap-1 rounded-full border px-1.5 sm:px-2 py-0.5 text-xs font-500 ${otStatus.cls} hover:opacity-80 transition-opacity`}
                    title={`${ot!.start_time} – ${ot!.end_time}`}
                  >
                    <Clock className="h-3 w-3" />
                    <span className="sm:hidden">{ot.status === 'pending' ? 'Chờ' : ot.status === 'approved' ? 'Duyệt' : ot.status === 'rejected' ? 'Từ chối' : 'Hủy'}</span>
                    <span className="hidden sm:inline">{otStatus.label}</span>
                  </button>
                ) : !isFutureDay ? (
                  <button
                    onClick={() => onOpenTangCa?.(day.date)}
                    className="inline-flex items-center gap-1 rounded-full border border-line px-1.5 sm:px-2 py-0.5 text-xs text-muted-foreground hover:border-violet-500/40 hover:text-violet-400 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    <span className="hidden sm:inline">Khai báo</span>
                  </button>
                ) : null}
              </span>

              {/* Bù Công badge — click để xem chi tiết / hủy nếu đang chờ duyệt */}
              <span className="w-24 hidden lg:flex items-center justify-center" onClick={e => e.stopPropagation()}>
                {adjBadge && adjKey && (
                  <button
                    onClick={e => { e.stopPropagation(); setBuCongModal({ type: adjKey.type, date: day.date }); }}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-500 hover:opacity-80 transition-opacity ${adjBadge.cls}`}
                    title="Xem chi tiết / Hủy"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    {adjBadge.label}
                  </button>
                )}
              </span>

              {/* Expand toggle */}
              <span className="w-6 flex justify-center">
                {hasRecord && !isFutureDay && (
                  isExpanded
                    ? <ChevronUp   className="h-4 w-4 text-muted-foreground" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </span>
            </div>

            {/* Expanded detail */}
            {isExpanded && filteredRecs.length > 0 && (
              <div className="border-b border-line-subtle bg-slate-900/50 px-4 py-3 space-y-2">
                <p className="text-xs font-600 text-muted-foreground mb-2">
                  Chi tiết {filteredRecs.length} bản ghi:
                </p>
                {filteredRecs.map((rec) => (
                  <div
                    key={rec.id}
                    className="rounded-lg border border-line-subtle bg-slate-900/30 p-2.5 flex items-start gap-2.5 justify-between"
                  >
                    <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                      {/* Loại chấm */}
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-500 flex-shrink-0 ${
                        rec.type === 'machine'
                          ? 'bg-purple-500/15 text-purple-400 border-purple-500/30'
                          : 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                      }`}>
                        {rec.type === 'machine'
                          ? <><Fingerprint className="h-3 w-3" /> Vân Tay</>
                          : <><Smartphone  className="h-3 w-3" /> App</>
                        }
                      </span>
                      {/* Vào/Ra */}
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-500 flex-shrink-0 ${
                        rec.event_type === 'check_in'
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                      }`}>
                        {rec.event_type === 'check_in' ? '→ Vào' : '← Ra'}
                      </span>
                      {/* Giờ */}
                      <span className="text-sm font-mono font-600 text-foreground">
                        {fmtFullTime(rec.recorded_at)}
                      </span>
                      {/* GPS & Photo badges */}
                      {rec.lat && rec.lng && (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                          <MapPin className="h-3 w-3" /> GPS
                        </span>
                      )}
                      {rec.photo_mime && (
                        <button
                          onClick={() => setPhotoModal({ recordId: rec.id, time: fmtFullTime(rec.recorded_at) })}
                          className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors"
                        >
                          <Camera className="h-3 w-3" /> Xem ảnh
                        </button>
                      )}
                      {rec.machine_id && (
                        <span className="text-xs text-muted-foreground">
                          Máy: {rec.machine_id}
                        </span>
                      )}
                    </div>
                    {rec.notes && (
                      <span className="text-xs text-muted-foreground italic ml-2 flex-shrink-0">
                        "{rec.notes}"
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Footer totals */}
      <div className="flex items-center gap-2 border-t border-line-subtle bg-slate-500/10 px-4 py-3 font-600">
        <span className="w-16 text-sm text-muted-foreground">TỔNG</span>
        <span className="w-10"></span>
        <span className="flex-1"></span>
        <span className="flex-1"></span>
        <span className="w-16 hidden sm:block"></span>
        <span className="w-20 text-right text-sm">
          <span className="text-indigo-400">{totalDays}</span>
          <span className="ml-1 text-muted-foreground text-xs">ngày</span>
          <span className="ml-2 text-emerald-400">{(totalMinutes / 60).toFixed(1)}</span>
          <span className="ml-1 text-muted-foreground text-xs">h</span>
        </span>
        <span className="w-24 hidden md:block"></span>
        <span className="w-24 hidden lg:block"></span>
        <span className="w-6"></span>
      </div>

      {/* ─── Modal xem ảnh chấm công ─── */}
      {photoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}
          onClick={() => setPhotoModal(null)}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl border border-line overflow-hidden"
            style={{ background: 'var(--card)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line-subtle px-4 py-3">
              <div>
                <p className="text-sm font-600 text-foreground">Ảnh Chấm Công</p>
                <p className="text-xs text-muted-foreground">{photoModal.time}</p>
              </div>
              <button onClick={() => setPhotoModal(null)} aria-label="Đóng" className="rounded-lg p-1.5 hover:bg-hover transition-colors">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/attendance/records/${photoModal.recordId}/photo`}
              alt="Ảnh chấm công"
              className="w-full object-contain"
              style={{ maxHeight: '70vh' }}
            />
          </div>
        </div>
      )}

      {/* Modal Bù Công — click badge "Đang duyệt"/"Đã duyệt" để xem chi tiết / hủy */}
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
            onClose={() => setBuCongModal(null)}
            onSuccess={() => { fetchAdjStatus(); setBuCongModal(null); }}
          />
        );
      })()}
    </div>
  );
}

