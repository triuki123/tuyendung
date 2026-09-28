'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, Loader2, Send, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { useConfirm } from '@/context/ConfirmContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

export type BuCongType =
  | 'bu_cong' | 'bu_cong_dac_biet' | 'bu_checkin' | 'bu_checkout'
  | 'cong_tac' | 'wfh' | 'lam_theo_ca'
  | (string & {});

interface Props {
  type: BuCongType;
  workDate: string;       // YYYY-MM-DD
  userId: string;
  userRole: string;
  /** Khi đề xuất đã tồn tại — modal hiển thị readonly + nút Hủy (nếu pending). */
  existingId?: string;
  existingStatus?: string;
  existingReason?: string;
  existingCheckin?: string | null;
  existingCheckout?: string | null;
  /** Bật khi mở từ nút "Bù Giờ" cho ngày làm thiếu giờ — chỉ chọn chế độ công đặc biệt. */
  workModeSelect?: boolean;
  /** Giờ máy đã chấm (ISO) — hiển thị tham chiếu khi bù giờ vào/ra cho ngày chấm lẻ. */
  machineCheckin?: string | null;
  machineCheckout?: string | null;
  onClose: () => void;
  onSuccess: (type: BuCongType, workDate: string) => void;
}

const TYPE_LABEL: Record<BuCongType, string> = {
  bu_cong:         'Bù Công',
  bu_cong_dac_biet: 'Bù Công Đặc Thù',
  bu_checkin:  'Bù Giờ Vào',
  bu_checkout: 'Bù Giờ Ra',
  cong_tac:    'Công Tác',
  wfh:         'Làm Việc Tại Nhà',
  lam_theo_ca: 'Làm Theo Ca',
};

/** 3 chế độ công đặc biệt (work-mode) — tên/màu/khả dụng lấy từ danh mục "Loại nghỉ"
 *  (cờ "Áp dụng cho Bù công"). Mô tả giữ mặc định. */
const WM_DEFAULT: Record<string, { label: string; desc: string }> = {
  cong_tac:    { label: 'Công tác',         desc: 'Đi công tác — tính 1 ngày công' },
  wfh:         { label: 'Làm việc tại nhà', desc: 'WFH — tính 1 ngày công' },
  lam_theo_ca: { label: 'Làm theo ca',      desc: 'Làm theo ca — tính 1 ngày công' },
};
const KNOWN_WORK_MODE_CODES = ['cong_tac', 'wfh', 'lam_theo_ca'];

const minToHHMM = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const DEFAULT_MORNING = { startMin: 8 * 60 + 30, endMin: 12 * 60 };
const DEFAULT_AFTERNOON = { startMin: 13 * 60, endMin: 17 * 60 + 30 };

/** Loại CẤU TRÚC cố định; code khác = work-mode (kể cả loại tự tạo qua danh mục). */
const STRUCTURAL_CODES = ['bu_cong', 'bu_cong_dac_biet', 'bu_checkin', 'bu_checkout'];
/** Work-mode = không phải loại cấu trúc → tính đủ 1 ngày công. */
const isWorkModeCode = (t: string): boolean => !STRUCTURAL_CODES.includes(t);
/** Được tạo nhiều ngày = full-day (mọi loại trừ bù giờ vào/ra). */
const isMultiDayCode = (t: string): boolean => t !== 'bu_checkin' && t !== 'bu_checkout';

/** Nhãn lý do bỏ qua ngày khi tạo bù công nhiều ngày. */
const SKIP_REASON: Record<string, string> = {
  weekend: 'Cuối tuần',
  holiday: 'Ngày lễ',
  exists:  'Đã có đề xuất',
};

export default function BuCongModal({ type, workDate, userId, userRole, existingId, existingStatus, existingReason, existingCheckin, existingCheckout, workModeSelect, machineCheckin, machineCheckout, onClose, onSuccess }: Props) {
  const confirm = useConfirm();
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose);
  // Ngày chấm lẻ (chỉ có giờ vào HOẶC giờ ra) → cho phép "Bù đủ 1 ngày công" trong 1 lần.
  const isPartialType = type === 'bu_checkin' || type === 'bu_checkout';
  const [fullDay, setFullDay] = useState(false);
  // Khi mở từ nút "Bù Công" cho chọn mọi chế độ; nút "Bù Giờ" chỉ cho chọn chế độ công đặc biệt; nút Bù Giờ Vào/Ra giữ nguyên loại.
  const allowModeSelect = type === 'bu_cong' || !!workModeSelect;

  // Work-mode lấy từ danh mục "Loại nghỉ" (cờ Áp dụng cho Bù công): MỌI loại đang bật,
  // kể cả loại tự tạo. null = chưa tải → dùng mặc định 3 loại quen thuộc (không chặn thao tác).
  const [wmNames, setWmNames] = useState<Record<string, string> | null>(null);
  const [wmHalf, setWmHalf] = useState<Set<string>>(new Set()); // code cho phép nghỉ theo buổi
  useEffect(() => {
    if (!userId) return;
    fetch('/api/leave/types', { headers: { 'x-current-user-id': userId, 'x-current-user-role': userRole } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.success) return;
        const m: Record<string, string> = {};
        const half = new Set<string>();
        for (const t of j.data) {
          if (t.applies_to_adjustment && t.active !== false) {
            m[t.code] = t.name;
            if (t.allow_half_day) half.add(t.code);
          }
        }
        setWmNames(m);
        setWmHalf(half);
      })
      .catch(() => {});
  }, [userId, userRole]);

  // Khung buổi sáng/chiều theo Quy Tắc Chấm Công (cho nút nghỉ theo buổi ở bù công).
  const [sessions, setSessions] = useState<{ morning: { startMin: number; endMin: number }; afternoon: { startMin: number; endMin: number } } | null>(null);
  useEffect(() => {
    if (!userId) return;
    fetch('/api/attendance/config', { headers: { 'x-current-user-id': userId, 'x-current-user-role': userRole } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.success && j.data?.morningSession && j.data?.afternoonSession) {
          setSessions({ morning: j.data.morningSession, afternoon: j.data.afternoonSession });
        }
      })
      .catch(() => {});
  }, [userId, userRole]);

  const [dayPart, setDayPart] = useState<'morning' | 'afternoon' | null>(null);

  // Danh sách work-mode khả dụng: đã tải → mọi code bật áp dụng bù công; chưa tải → 3 loại quen thuộc.
  const activeWmCodes = wmNames ? Object.keys(wmNames) : KNOWN_WORK_MODE_CODES;
  const wmOption = (code: string) => ({
    value: code as BuCongType,
    label: (wmNames && wmNames[code]) || WM_DEFAULT[code]?.label || code,
    desc: WM_DEFAULT[code]?.desc || 'Tính đủ 1 ngày công',
  });
  const modeOptions = workModeSelect
    ? [...activeWmCodes.map(wmOption), { value: 'bu_cong_dac_biet' as BuCongType, label: 'Bù công đặc thù', desc: 'Trường hợp đặc thù — tự nhập giờ vào/ra + lý do' }]
    : [{ value: 'bu_cong' as BuCongType, label: 'Bù công (chấm thiếu giờ)', desc: 'Quên/thiếu chấm — đề xuất giờ vào & ra' }, ...activeWmCodes.map(wmOption)];
  // Đổ giờ ISO cũ về 'HH:mm' cho input (khi mở lại đề xuất bị từ chối để khai báo lại).
  const initTime = (iso: string | null | undefined, fallback: string): string => {
    if (!iso) return fallback;
    try {
      return new Date(iso).toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh',
      });
    } catch { return fallback; }
  };
  const [mode,         setMode]         = useState<BuCongType>(type);
  const [endDate,      setEndDate]      = useState(workDate); // bù công nhiều ngày: ngày kết thúc
  const [checkinTime,  setCheckinTime]  = useState(() => initTime(existingCheckin, '08:30'));
  const [checkoutTime, setCheckoutTime] = useState(() => initTime(existingCheckout, '17:30'));
  const [reason,       setReason]       = useState(existingReason ?? '');
  const [submitting,   setSubmitting]   = useState(false);
  const [cancelling,   setCancelling]   = useState(false);
  const [error,        setError]        = useState('');
  const [batchInfo,    setBatchInfo]    = useState<{ created: number; skipped: { date: string; reason: string }[] } | null>(null);

  // Khi đã có ID + trạng thái pending/approved → khóa sửa (giống TangCa).
  // rejected/cancelled → CHO mở lại form, đổ sẵn dữ liệu cũ để khai báo & gửi lại
  // (backend cho phép tạo mới khi bản cũ đã bị từ chối/hủy — xem POST /adjustments).
  const isLocked  = !!existingId && (existingStatus === 'pending' || existingStatus === 'approved');
  const canCancel = existingStatus === 'pending' && !!existingId;

  const handleCancelExisting = useCallback(async () => {
    if (!existingId) return;
    if (!(await confirm({ title: 'Hủy đề xuất?', message: 'Hủy đề xuất này? Sau khi hủy, bạn có thể gửi đề xuất mới.', confirmLabel: 'Hủy đề xuất', danger: true }))) return;
    setError('');
    setCancelling(true);
    try {
      const res = await fetch(`/api/attendance/adjustments/${existingId}`, {
        method: 'DELETE',
        headers: { 'x-current-user-id': userId, 'x-current-user-role': userRole },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        setError(json.error ?? 'Không thể hủy. Có thể đã được xử lý.');
        return;
      }
      onSuccess(type, workDate);
      onClose();
    } catch {
      setError('Không thể kết nối. Vui lòng thử lại.');
    } finally {
      setCancelling(false);
    }
  }, [existingId, userId, userRole, onSuccess, onClose, type, workDate]);

  // Format giờ đề xuất (nếu có) cho readonly view
  const fmtTime = (iso?: string | null): string => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
    } catch { return '—'; }
  };

  // Khi bật "Bù đủ 1 ngày công" trên ngày chấm lẻ → gửi như bù_cong (điền cả giờ vào + ra).
  const effectiveType = fullDay && isPartialType ? 'bu_cong' : (allowModeSelect ? mode : type);
  const isWorkMode = isWorkModeCode(effectiveType);
  // Loại work-mode có bật "nghỉ theo buổi" → cho chọn Cả ngày / Sáng / Chiều.
  const allowHalf = isWorkMode && wmHalf.has(effectiveType);
  const label   = (wmNames && wmNames[effectiveType]) || TYPE_LABEL[effectiveType] || effectiveType;
  const showIn  = effectiveType === 'bu_cong' || effectiveType === 'bu_cong_dac_biet' || effectiveType === 'bu_checkin';
  const showOut = effectiveType === 'bu_cong' || effectiveType === 'bu_cong_dac_biet' || effectiveType === 'bu_checkout';
  // Mở từ nút "Bù Giờ" (workModeSelect): cho tự nhập giờ thay vì cố định 08:30–17:30.
  const customWorkTime = isWorkMode && !!workModeSelect;
  const showInInput  = (showIn && !isWorkMode) || customWorkTime;
  const showOutInput = (showOut && !isWorkMode) || customWorkTime;

  const fmtDate = new Date(workDate + 'T00:00:00').toLocaleDateString('vi-VN', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  });

  // Bù công nhiều ngày: 3 chế độ công đặc biệt + Bù Công, khi chọn ngày kết thúc sau ngày bắt đầu.
  const allowMultiDay = isMultiDayCode(effectiveType) && !(fullDay && isPartialType);
  const isMultiDay = allowMultiDay && endDate > workDate;

  async function handleSubmit() {
    if (!reason.trim()) { setError('Vui lòng nhập lý do'); return; }

    if (showInInput && showOutInput && checkinTime >= checkoutTime) {
      setError('Giờ vào phải trước giờ ra');
      return;
    }
    if (allowMultiDay && endDate < workDate) {
      setError('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu');
      return;
    }

    // Pre-check mâu thuẫn (chỉ ngày đơn — tạo nhiều ngày bỏ qua để khỏi nhiễu).
    if (!isMultiDay) {
      try {
        const r = await fetch('/api/attendance/conflicts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-current-user-id': userId },
          body: JSON.stringify({ candidate: { userId, date: workDate, source: 'adjustment', adjustmentType: effectiveType } }),
        });
        const j = await r.json();
        const cs = (j?.data ?? []) as { message: string }[];
        if (cs.length && !(await confirm({ title: 'Vẫn gửi đề xuất?', message: `Lưu ý cho ngày này: ${cs.map(c => c.message).join('; ')}`, confirmLabel: 'Gửi' }))) return;
      } catch { /* lỗi pre-check không chặn gửi */ }
    }

    setSubmitting(true);
    setError('');

    const toISO = (time: string) => `${workDate}T${time}:00+07:00`;

    const body: Record<string, string> = {
      adjustment_type: effectiveType,
      work_date: workDate,
      reason: reason.trim(),
    };
    if (isWorkMode) {
      if (allowHalf && dayPart) {
        // Nghỉ theo BUỔI: giờ theo khung Sáng/Chiều (Quy Tắc Chấm Công) + đánh dấu day_part.
        const s = dayPart === 'morning' ? (sessions?.morning ?? DEFAULT_MORNING) : (sessions?.afternoon ?? DEFAULT_AFTERNOON);
        body.requested_checkin  = toISO(minToHHMM(s.startMin));
        body.requested_checkout = toISO(minToHHMM(s.endMin));
        body.day_part = dayPart;
      } else {
        // Cả ngày: tự nhập giờ khi mở từ nút "Bù Giờ", còn lại mặc định 1 ngày công đầy đủ (08:30–17:30)
        body.requested_checkin  = toISO(customWorkTime ? checkinTime  : '08:30');
        body.requested_checkout = toISO(customWorkTime ? checkoutTime : '17:30');
      }
    } else {
      if (showIn)  body.requested_checkin  = toISO(checkinTime);
      if (showOut) body.requested_checkout = toISO(checkoutTime);
    }
    // Nửa buổi = 1 ngày cụ thể (không tạo nhiều ngày).
    if (isMultiDay && !(allowHalf && dayPart)) body.end_date = endDate;

    try {
      const res = await fetch('/api/attendance/adjustments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-current-user-id': userId,
          'x-current-user-role': userRole,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || 'Lỗi server'); return; }
      markClean();

      // Nhánh nhiều ngày: nếu có ngày bị bỏ qua → hiện tóm tắt, để user tự đóng. Ngược lại đóng luôn.
      if (json.batch) {
        onSuccess(effectiveType, workDate);
        const skipped = (json.skipped ?? []) as { date: string; reason: string }[];
        if (skipped.length > 0) {
          setBatchInfo({ created: (json.created ?? []).length, skipped });
          return;
        }
        onClose();
        return;
      }

      onSuccess(effectiveType, workDate);
      onClose();
    } catch {
      setError('Lỗi kết nối, vui lòng thử lại');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) guardedClose(); }}>
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-line overflow-y-auto overflow-x-hidden sheet-up sm:animate-fadeIn"
        style={{ background: 'var(--card)', maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
          <div>
            <h2 className="text-base font-700 text-foreground">
              {isLocked ? `📋 Chi Tiết Đề Xuất ${label}` : `📝 Đề Xuất ${label}`}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{fmtDate}</p>
          </div>
          <button onClick={guardedClose} className="btn-ghost rounded-lg p-1.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {batchInfo ? (
          <>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-600 text-emerald-400">Đã gửi {batchInfo.created} ngày</p>
                  <p className="text-xs text-muted-foreground">Đề xuất đã gửi tới quản lý để duyệt.</p>
                </div>
              </div>
              {batchInfo.skipped.length > 0 && (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/8 p-4 space-y-2">
                  <p className="text-xs font-600 text-amber-400">{batchInfo.skipped.length} ngày bị bỏ qua:</p>
                  <ul className="space-y-1 max-h-48 overflow-y-auto">
                    {batchInfo.skipped.map(s => (
                      <li key={s.date} className="flex items-center justify-between text-xs">
                        <span className="text-foreground">
                          {new Date(s.date + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                        </span>
                        <span className="text-amber-400/80">{SKIP_REASON[s.reason] ?? s.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
              <button onClick={onClose} className="btn-indigo rounded-xl px-5 py-2 text-sm font-600">Đóng</button>
            </div>
          </>
        ) : isLocked ? (
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
                    <p className="text-xs text-muted-foreground">Đề xuất đã gửi và đang đợi quản lý duyệt. Bấm <strong className="text-foreground">Hủy yêu cầu</strong> nếu cần gửi lại.</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                  <XCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-600 text-red-400">Đã bị từ chối</p>
                    <p className="text-xs text-muted-foreground">Đề xuất này không được chấp thuận. Bạn có thể gửi đề xuất mới.</p>
                  </div>
                </div>
              )}

              {/* Thông tin đề xuất */}
              <div className="rounded-2xl border border-line-subtle p-4 space-y-3" style={{ background: 'var(--secondary)' }}>
                <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground">Thông Tin Đề Xuất</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Loại</span>
                  <span className="text-sm font-600 text-foreground">{label}</span>
                </div>
                {existingCheckin && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Giờ vào đề xuất</span>
                    <span className="text-sm font-600 text-emerald-400">{fmtTime(existingCheckin)}</span>
                  </div>
                )}
                {existingCheckout && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Giờ ra đề xuất</span>
                    <span className="text-sm font-600 text-amber-400">{fmtTime(existingCheckout)}</span>
                  </div>
                )}
              </div>

              {/* Lý do đã gửi */}
              {existingReason && (
                <div>
                  <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground mb-2">Lý Do</p>
                  <div className="rounded-xl border border-line-subtle px-4 py-3" style={{ background: 'var(--secondary)' }}>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{existingReason}</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5">
                  <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}
            </div>

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
                  onClick={handleCancelExisting}
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
        {/* Body */}
        <div className="p-6 space-y-4" onChange={markDirty}>
          {/* Mở lại sau khi bị từ chối → nhắc đây là khai báo lại (đổ sẵn dữ liệu cũ) */}
          {existingStatus === 'rejected' && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
              <p className="text-xs font-600 text-amber-300">Đề xuất trước đã bị từ chối</p>
              <p className="text-2xs text-muted-foreground mt-0.5">
                Bạn có thể chỉnh lại thông tin bên dưới và gửi đề xuất mới.
              </p>
            </div>
          )}
          {/* Ngày chấm lẻ: cho bù đủ 1 ngày công trong 1 lần */}
          {isPartialType && !isLocked && (
            <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/8 p-3 space-y-2.5">
              {(machineCheckin || machineCheckout) && (
                <p className="text-2xs text-muted-foreground">
                  Máy đã chấm: {machineCheckin ? `vào ${fmtTime(machineCheckin)}` : 'thiếu giờ vào'}
                  {' · '}{machineCheckout ? `ra ${fmtTime(machineCheckout)}` : 'thiếu giờ ra'}
                </p>
              )}
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={fullDay} onChange={e => setFullDay(e.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-500" />
                <span className="text-xs text-foreground leading-relaxed">
                  <span className="font-600">Bù đủ 1 ngày công</span> — điền cả giờ vào & giờ ra để đạt đủ công trong 1 lần.
                  <span className="block text-2xs text-muted-foreground mt-0.5">
                    Dùng khi bù giờ {type === 'bu_checkin' ? 'vào' : 'ra'} xong vẫn chưa đủ 8 tiếng. Giờ đề xuất sẽ thay cho lượt chấm lẻ của máy.
                  </span>
                </span>
              </label>
            </div>
          )}
          {/* Chọn chế độ — chỉ khi mở từ nút Bù Công */}
          {allowModeSelect && (
            <div>
              <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">
                Chế Độ
              </label>
              <select
                value={mode}
                onChange={e => setMode(e.target.value as BuCongType)}
                className="h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo-500/60 focus:outline-none"
              >
                {modeOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p className="mt-1 text-2xs text-muted-foreground">
                {modeOptions.find(o => o.value === mode)?.desc}
              </p>
            </div>
          )}

          {/* Buổi — chỉ với work-mode bật "nghỉ theo buổi": Cả ngày / Sáng / Chiều */}
          {allowHalf && (
            <div>
              <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Buổi</label>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => { setDayPart(null); markDirty(); }}
                  className={`rounded-xl border px-2 py-2 text-sm font-600 transition-colors ${dayPart === null ? 'border-indigo-500/60 bg-indigo-500/20 text-indigo-300' : 'border-line text-muted-foreground hover:bg-hover'}`}>
                  Cả ngày
                </button>
                {(['morning', 'afternoon'] as const).map((p) => {
                  const s = p === 'morning' ? (sessions?.morning ?? DEFAULT_MORNING) : (sessions?.afternoon ?? DEFAULT_AFTERNOON);
                  return (
                    <button key={p} type="button" onClick={() => { setDayPart(p); markDirty(); }}
                      className={`rounded-xl border px-2 py-2 text-sm font-600 transition-colors ${dayPart === p ? 'border-indigo-500/60 bg-indigo-500/20 text-indigo-300' : 'border-line text-muted-foreground hover:bg-hover'}`}>
                      {p === 'morning' ? 'Buổi sáng' : 'Buổi chiều'}
                      <span className="block text-2xs font-400 opacity-70">{minToHHMM(s.startMin)}–{minToHHMM(s.endMin)}</span>
                    </button>
                  );
                })}
              </div>
              {dayPart && <p className="mt-1.5 text-2xs text-indigo-300">ℹ️ Nghỉ theo buổi tính 0.5 công (theo Quy Tắc Chấm Công).</p>}
            </div>
          )}

          {/* Khoảng ngày — chế độ công đặc biệt + Bù Công (bù nhiều ngày); ẩn khi chọn buổi */}
          {allowMultiDay && !(allowHalf && dayPart) && (
            <div>
              <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">
                Khoảng Ngày
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="mb-1 block text-2xs text-muted-foreground">Từ ngày</span>
                  <input
                    type="date"
                    value={workDate}
                    disabled
                    className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-muted-foreground opacity-70 cursor-not-allowed"
                  />
                </div>
                <div>
                  <span className="mb-1 block text-2xs text-muted-foreground">Đến ngày</span>
                  <input
                    type="date"
                    value={endDate}
                    min={workDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo-500/60 focus:outline-none"
                  />
                </div>
              </div>
              {isMultiDay && (
                <p className="mt-1.5 text-2xs text-indigo-300">
                  {effectiveType === 'lam_theo_ca'
                    ? <>ℹ️ Làm theo ca — tạo đề xuất cho <b>mọi ngày</b> trong khoảng (kể cả Chủ nhật, tính công bình thường), chỉ bỏ qua ngày lễ.</>
                    : <>ℹ️ Sẽ tạo đề xuất cho từng ngày làm việc trong khoảng — tự bỏ qua Chủ nhật &amp; ngày lễ.</>}
                </p>
              )}
            </div>
          )}

          {/* Giờ vào */}
          {showInInput && !(allowHalf && dayPart) && (
            <div>
              <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">
                Giờ Vào Đề Xuất *
              </label>
              <input
                type="time"
                value={checkinTime}
                onChange={e => setCheckinTime(e.target.value)}
                className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo-500/60 focus:outline-none"
              />
            </div>
          )}

          {/* Giờ ra */}
          {showOutInput && !(allowHalf && dayPart) && (
            <div>
              <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">
                Giờ Ra Đề Xuất *
              </label>
              <input
                type="time"
                value={checkoutTime}
                onChange={e => setCheckoutTime(e.target.value)}
                className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo-500/60 focus:outline-none"
              />
            </div>
          )}

          {/* Thông báo với chế độ công đặc biệt */}
          {isWorkMode && (
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/8 px-3 py-2.5">
              <p className="text-xs text-indigo-300">
                {customWorkTime
                  ? <>ℹ️ Chế độ <b>{label}</b> — nhập khoảng giờ bạn làm thực tế. Khoảng giờ này sẽ được tính bù vào ngày công sau khi quản lý duyệt.</>
                  : <>ℹ️ Chế độ <b>{label}</b> sẽ được tính là <b>1 ngày công đầy đủ</b> sau khi quản lý duyệt.</>}
              </p>
            </div>
          )}

          {/* Lý do */}
          <div>
            <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">
              Lý Do *
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={`Nhập lý do đề xuất ${label.toLowerCase()}...`}
              rows={3}
              className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500/60 focus:outline-none resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Info */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2.5">
            <p className="text-xs text-amber-400">
              ⚠️ Yêu cầu sẽ được gửi đến quản lý để xét duyệt. Sau khi được duyệt, dữ liệu công sẽ được cập nhật tự động.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
          <button onClick={guardedClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !reason.trim()}
            className="flex items-center gap-2 btn-indigo rounded-xl px-4 py-2 text-sm font-600 disabled:opacity-40"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {submitting ? 'Đang gửi...' : 'Gửi Yêu Cầu'}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
