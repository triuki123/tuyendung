'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, Clock, Send, AlertCircle, ChevronDown, CheckCircle2, XCircle } from 'lucide-react';
import { calculateOvertimeBrackets, fmtOTHours, hasSpecialDaytimeOvertime } from '@/lib/utils/overtimeUtils';
import { DEFAULT_ATTENDANCE_CONFIG, isWeekendDay } from '@/lib/config/attendanceConfig';
import { useConfirm } from '@/context/ConfirmContext';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

interface Props {
  workDate: string; // YYYY-MM-DD
  userId: string;
  userRole: string;
  existingId?: string;
  existingStatus?: string;
  existingStart?: string;
  existingEnd?: string;
  existingReason?: string;
  /** Khung tăng ca theo cấu hình công ty (mặc định = DEFAULT). */
  overtimeBrackets?: { eveningStartMin: number; eveningEndMin: number; nightEndMin: number };
  onClose: () => void;
  onSuccess: () => void;
}

// ─── Giờ & phút ───────────────────────────────────────────────────────────
const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i); // 0 → 23
const MINUTES   = [0, 15, 30, 45];

function parseHM(timeStr?: string): [number, number] {
  if (!timeStr) return [17, 30];
  const parts = timeStr.split(':').map(Number);
  return [parts[0] ?? 17, parts[1] ?? 0];
}

function padZ(n: number) { return String(n).padStart(2, '0'); }

function fmtDateVN(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const vn = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  return `${vn[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

// ─── TimeDropdown ──────────────────────────────────────────────────────────
function TimeDropdown({
  label,
  hours,
  selectedH,
  selectedM,
  minuteOptions,
  onChangeH,
  onChangeM,
  badge,
}: {
  label: string;
  hours: number[];
  selectedH: number;
  selectedM: number;
  minuteOptions: number[];
  onChangeH: (h: number) => void;
  onChangeM: (m: number) => void;
  badge?: React.ReactNode;
}) {
  const selectCls =
    'appearance-none rounded-xl border border-line bg-surface-2 pl-3 pr-8 py-2.5 ' +
    'text-sm font-600 text-foreground cursor-pointer ' +
    'focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/30 ' +
    'hover:border-line-strong transition-colors';

  return (
    <div className="flex-1 space-y-2">
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-600 uppercase tracking-wider text-muted-foreground">
          {label}
        </label>
        {badge}
      </div>

      {/* Giờ : Phút side-by-side */}
      <div className="flex items-center gap-1.5">
        {/* Hour select */}
        <div className="relative flex-1">
          <select
            value={selectedH}
            onChange={e => onChangeH(Number(e.target.value))}
            className={selectCls}
          >
            {hours.map(h => (
              <option key={h} value={h}>{padZ(h)}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>

        <span className="text-lg font-700 text-muted-foreground select-none">:</span>

        {/* Minute select */}
        <div className="relative flex-1">
          <select
            value={selectedM}
            onChange={e => onChangeM(Number(e.target.value))}
            className={selectCls}
          >
            {minuteOptions.map(m => (
              <option key={m} value={m}>{padZ(m)}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {/* Preview giờ đã chọn */}
      <p className="text-xs text-center font-500 text-violet-300/70">
        {padZ(selectedH)}:{padZ(selectedM)}
      </p>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────
export default function TangCaModal({
  workDate,
  userId,
  userRole,
  existingId,
  existingStatus,
  existingStart,
  existingEnd,
  existingReason,
  overtimeBrackets = DEFAULT_ATTENDANCE_CONFIG.overtimeBrackets,
  onClose,
  onSuccess,
}: Props) {
  const confirm = useConfirm();
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  // Tách giờ/phút từ existing hoặc default
  const [initSH, initSM] = parseHM(existingStart ?? '17:30');
  const [initEH, initEM] = parseHM(existingEnd   ?? '21:30');

  const [startH,  setStartH]  = useState(initSH);
  const [startM,  setStartM]  = useState(initSM);
  const [endH,    setEndH]    = useState(initEH);
  const [endM,    setEndM]    = useState(initEM);
  const [reason,  setReason]  = useState(existingReason ?? '');

  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error,      setError]      = useState('');
  const [isHoliday,  setIsHoliday]  = useState(false);

  const dayOfWeek = new Date(workDate + 'T00:00:00').getDay();
  const isWeekend = isWeekendDay(dayOfWeek, { ...DEFAULT_ATTENDANCE_CONFIG, overtimeBrackets, weekendDays: DEFAULT_ATTENDANCE_CONFIG.weekendDays });
  const allowDaytimeOvertime = isWeekend || isHoliday;

  // Tạo string để tính toán
  const startTime = `${padZ(startH)}:${padZ(startM)}`;
  const endTime   = `${padZ(endH)}:${padZ(endM)}`;
  const brackets  = calculateOvertimeBrackets(startTime, endTime, overtimeBrackets, { allowDaytime: allowDaytimeOvertime });
  const isSpecialDaytime = allowDaytimeOvertime && hasSpecialDaytimeOvertime(startTime, brackets.eveningHours, overtimeBrackets);
  const isExistingSpecialDaytime = allowDaytimeOvertime && hasSpecialDaytimeOvertime(existingStart ?? startTime, brackets.eveningHours, overtimeBrackets);

  // end_time qua ngày hôm sau khi end <= start (tính theo phút)
  const isNextDay = (endH * 60 + endM) <= (startH * 60 + startM);

  // Khi đã có ID + trạng thái pending/approved → modal khóa sửa.
  // - pending  → cho phép hủy yêu cầu (DELETE), sau đó user gửi mới.
  // - approved → chỉ đóng (cần quản lý từ chối mới mở lại được).
  // - rejected/cancelled → cho phép mở lại form và khai báo lại với dữ liệu cũ được đổ sẵn.
  const isLocked   = existingStatus === 'pending' || existingStatus === 'approved';
  const canCancel  = existingStatus === 'pending' && !!existingId;
  const isReadOnly = isLocked;

  const handleCancel = useCallback(async () => {
    if (!existingId) return;
    if (!(await confirm({ title: 'Hủy yêu cầu tăng ca?', message: 'Hủy yêu cầu tăng ca này? Sau khi hủy, bạn có thể tạo khai báo mới.', confirmLabel: 'Hủy yêu cầu', danger: true }))) return;
    setError('');
    setCancelling(true);
    try {
      const res = await fetch(`/api/attendance/overtime/${existingId}`, {
        method: 'DELETE',
        headers: { 'x-current-user-id': userId, 'x-current-user-role': userRole },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        setError(json.error ?? 'Không thể hủy. Có thể đã được xử lý.');
        return;
      }
      onSuccess();
      onClose();
    } catch {
      setError('Không thể kết nối. Vui lòng thử lại.');
    } finally {
      setCancelling(false);
    }
  }, [existingId, userId, userRole, onSuccess, onClose]);

  const handleSubmit = useCallback(async () => {
    setError('');
    if (brackets.totalHours <= 0) {
      setError(allowDaytimeOvertime
        ? 'Thời gian không hợp lệ. Vui lòng chọn giờ kết thúc sau giờ bắt đầu.'
        : 'Thời gian không hợp lệ. Ngày thường chỉ được khai báo tăng ca từ 17:30 trở đi.');
      return;
    }
    // Pre-check mâu thuẫn (cảnh báo trước khi gửi, không chặn).
    try {
      const r = await fetch('/api/attendance/conflicts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-current-user-id': userId },
        body: JSON.stringify({ candidate: { userId, date: workDate, source: 'overtime', startTime, endTime } }),
      });
      const j = await r.json();
      const cs = (j?.data ?? []) as { message: string }[];
      if (cs.length && !(await confirm({ title: 'Vẫn gửi khai báo?', message: `Lưu ý cho ngày này: ${cs.map(c => c.message).join('; ')}`, confirmLabel: 'Gửi' }))) return;
    } catch { /* lỗi pre-check không chặn gửi */ }
    setSubmitting(true);
    try {
      const res = await fetch('/api/attendance/overtime', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-current-user-id':   userId,
          'x-current-user-role': userRole,
        },
        body: JSON.stringify({
          work_date:  workDate,
          start_time: startTime,
          end_time:   endTime,
          reason:     reason.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) { setError(json.error ?? 'Lỗi server'); return; }
      markClean();
      onSuccess();
      onClose();
    } catch {
      setError('Không thể kết nối. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  }, [startTime, endTime, reason, userId, userRole, workDate, brackets.totalHours, onSuccess, onClose]);

  useEffect(() => {
    let alive = true;
    const year = workDate.slice(0, 4);
    fetch(`/api/attendance/holidays?year=${year}`)
      .then(r => r.json())
      .then(j => {
        if (!alive || !j?.success) return;
        const found = Array.isArray(j.data) && j.data.some((h: { date?: string }) => h.date?.slice(0, 10) === workDate);
        setIsHoliday(!!found);
      })
      .catch(() => setIsHoliday(false));
    return () => { alive = false; };
  }, [workDate]);

  // Đóng khi Escape (cảnh báo nếu form còn thay đổi chưa lưu)
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') guardedClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [guardedClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) guardedClose(); }}
    >
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-line overflow-y-auto overflow-x-hidden sheet-up sm:animate-fadeIn"
        style={{ background: 'var(--card)', maxHeight: '92vh' }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
          <div>
            <h2 className="text-base font-700 text-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-violet-400" />
              {isReadOnly ? 'Chi Tiết Tăng Ca' : 'Khai Báo Tăng Ca'}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{fmtDateVN(workDate)}</p>
          </div>
          <button
            onClick={guardedClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-hover-strong hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Read-only view khi đã được duyệt hoặc từ chối ── */}
        {isReadOnly ? (
          <>
            <div className="p-6 space-y-4">
              {/* Status banner */}
              {existingStatus === 'approved' ? (
                <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-600 text-emerald-400">Đã được duyệt</p>
                    <p className="text-xs text-muted-foreground">Quản lý đã xác nhận. Muốn sửa hãy nhờ quản lý từ chối trong trang Duyệt Yêu Cầu.</p>
                  </div>
                </div>
              ) : existingStatus === 'pending' ? (
                <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                  <Clock className="h-5 w-5 text-amber-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-600 text-amber-400">Đang chờ duyệt</p>
                    <p className="text-xs text-muted-foreground">Khai báo này đã gửi và đang đợi quản lý duyệt. Bấm <strong className="text-foreground">Hủy yêu cầu</strong> nếu cần khai báo lại.</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                  <XCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-600 text-red-400">Đã bị từ chối</p>
                    <p className="text-xs text-muted-foreground">Khai báo tăng ca này không được chấp thuận. Bạn có thể tạo khai báo mới.</p>
                  </div>
                </div>
              )}

              {/* Thông tin giờ */}
              <div className="rounded-2xl border border-line-subtle p-4 space-y-3" style={{ background: 'var(--secondary)' }}>
                <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground">Thông Tin Tăng Ca</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Khung giờ</span>
                  <span className="text-sm font-700 text-violet-400">{existingStart} – {existingEnd}</span>
                </div>
                {brackets.eveningHours > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{isExistingSpecialDaytime ? '🌤 Tăng ca ngày nghỉ / lễ' : '🌆 Khung tối (17:30–22:00)'}</span>
                    <span className="text-sm font-600 text-orange-400">{fmtOTHours(brackets.eveningHours)}</span>
                  </div>
                )}
                {brackets.nightHours > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">🌙 Khung đêm (22:00–07:00)</span>
                    <span className="text-sm font-600 text-indigo-400">{fmtOTHours(brackets.nightHours)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-line-subtle pt-2.5">
                  <span className="text-sm font-600 text-foreground">Tổng tăng ca</span>
                  <span className="text-xl font-700 text-violet-400">{fmtOTHours(brackets.totalHours)}</span>
                </div>
              </div>

              {/* Lý do */}
              {existingReason && (
                <div>
                  <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground mb-2">Lý Do</p>
                  <div className="rounded-xl border border-line-subtle px-4 py-3" style={{ background: 'var(--secondary)' }}>
                    <p className="text-sm text-foreground">{existingReason}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Error (cho thao tác hủy) */}
            {error && (
              <div className="px-6 pb-2">
                <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5">
                  <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
              <button
                onClick={onClose}
                disabled={cancelling}
                className="rounded-xl border border-line bg-hover px-5 py-2 text-sm text-muted-foreground hover:bg-hover-strong hover:text-foreground transition-colors disabled:opacity-40"
              >
                Đóng
              </button>
              {canCancel && (
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-500/15 border border-red-500/30 px-5 py-2 text-sm font-600 text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {cancelling
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang hủy...</>
                    : <><XCircle className="h-4 w-4" /> Hủy yêu cầu</>
                  }
                </button>
              )}
            </div>
          </>
        ) : (
        <>
        {/* ── Body (editable) ── */}
        <div className="p-6 space-y-5" onChange={markDirty}>

          {/* Giờ bắt đầu — Giờ kết thúc */}
          <div className="flex items-end gap-4">
            <TimeDropdown
              label="Bắt đầu"
              hours={ALL_HOURS}
              selectedH={startH}
              selectedM={startM}
              minuteOptions={MINUTES}
              onChangeH={setStartH}
              onChangeM={setStartM}
            />

            {/* Mũi tên nối */}
            <div className="pb-5 text-muted-foreground flex-shrink-0">
              <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
                <path d="M0 8h16M12 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            <TimeDropdown
              label="Kết thúc"
              hours={ALL_HOURS}
              selectedH={endH}
              selectedM={endM}
              minuteOptions={MINUTES}
              onChangeH={setEndH}
              onChangeM={setEndM}
              badge={
                isNextDay ? (
                  <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-500 text-amber-400">
                    +1 ngày
                  </span>
                ) : undefined
              }
            />
          </div>

          {/* Preview kết quả */}
          <div
            className="rounded-2xl border border-line-subtle p-4 space-y-3"
            style={{ background: 'var(--secondary)' }}
          >
            <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground">
              Kết Quả Tính Toán
            </p>

            <div className="space-y-2">
              {/* Bracket tối */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-500/15 text-[11px]">🌆</span>
                  <span className="text-xs text-muted-foreground">{isSpecialDaytime ? 'Tăng ca ngày nghỉ / lễ' : 'Khung tối (17:30 – 22:00)'}</span>
                </div>
                <span className={`text-sm font-600 tabular-nums ${brackets.eveningHours > 0 ? 'text-orange-400' : 'text-muted-foreground'}`}>
                  {brackets.eveningHours > 0 ? fmtOTHours(brackets.eveningHours) : '—'}
                </span>
              </div>

              {/* Bracket đêm */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/15 text-[11px]">🌙</span>
                  <span className="text-xs text-muted-foreground">Khung đêm (22:00 – 07:00)</span>
                </div>
                <span className={`text-sm font-600 tabular-nums ${brackets.nightHours > 0 ? 'text-indigo-400' : 'text-muted-foreground'}`}>
                  {brackets.nightHours > 0 ? fmtOTHours(brackets.nightHours) : '—'}
                </span>
              </div>

              {/* Tổng */}
              <div className="flex items-center justify-between border-t border-line-subtle pt-2.5">
                <span className="text-sm font-600 text-foreground">Tổng tăng ca</span>
                <span className={`text-xl font-700 tabular-nums ${brackets.totalHours > 0 ? 'text-violet-400' : 'text-muted-foreground'}`}>
                  {brackets.totalHours > 0 ? fmtOTHours(brackets.totalHours) : '0h'}
                </span>
              </div>
            </div>
          </div>

          {/* Lý do */}
          <div className="space-y-1.5">
            <label className="text-xs font-600 uppercase tracking-wider text-muted-foreground">
              Lý do tăng ca{' '}
              <span className="font-400 normal-case tracking-normal text-muted-foreground/60">(tùy chọn)</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ví dụ: Hoàn thành báo cáo tháng 6..."
              rows={2}
              className="w-full resize-none rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
          <button
            onClick={guardedClose}
            disabled={submitting}
            className="rounded-xl border border-line bg-hover px-4 py-2 text-sm text-muted-foreground hover:bg-hover-strong hover:text-foreground transition-colors disabled:opacity-40"
          >
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || brackets.totalHours <= 0}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2 text-sm font-600 text-white hover:bg-violet-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang gửi...</>
              : <><Send className="h-4 w-4" /> Gửi Khai Báo</>
            }
          </button>
        </div>
        </>
        )} {/* end isReadOnly ternary */}
      </div>
    </div>
  );
}
