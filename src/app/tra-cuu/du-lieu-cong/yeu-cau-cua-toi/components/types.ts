/** Kiểu dữ liệu + meta dùng chung cho trang Yêu Cầu Của Tôi. */

export type UnifiedStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type RequestKind = 'leave' | 'adjustment' | 'overtime';

export interface MyRequestItem {
  id: string;
  kind: RequestKind;
  sub_type: string;
  sub_label: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  day_part: 'morning' | 'afternoon' | null;
  amount_days: number | null;
  amount_hours: number | null;
  reason: string | null;
  status: UnifiedStatus;
  raw_status: string;
  approver_name: string | null;
  decided_at: string | null;
  reject_reason: string | null;
  created_at: string;
  /** Mọi id record thuộc đơn (bù công theo LÔ gộp N ngày = N id) — hủy phải hủy đủ. */
  ids: string[];
}

/** Màu theo loại đơn: leave emerald, adjustment violet, overtime amber. */
export const KIND_META: Record<RequestKind, { label: string; chip: string; badge: string; dot: string }> = {
  leave: {
    label: 'Nghỉ phép',
    chip: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    badge: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
    dot: 'bg-emerald-400',
  },
  adjustment: {
    label: 'Bù công',
    chip: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
    badge: 'border-violet-500/30 bg-violet-500/15 text-violet-400',
    dot: 'bg-violet-400',
  },
  overtime: {
    label: 'Tăng ca',
    chip: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    badge: 'border-amber-500/30 bg-amber-500/15 text-amber-400',
    dot: 'bg-amber-400',
  },
};

export const STATUS_META: Record<UnifiedStatus, { label: string; cls: string }> = {
  pending: { label: 'Chờ duyệt', cls: 'border-amber-500/30 bg-amber-500/15 text-amber-400' },
  approved: { label: 'Đã duyệt', cls: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400' },
  rejected: { label: 'Từ chối', cls: 'border-red-500/30 bg-red-500/15 text-red-400' },
  cancelled: { label: 'Đã hủy', cls: 'border-slate-500/30 bg-slate-500/15 text-ink-muted' },
};

/** Endpoint hủy đơn pending theo loại (đều là DELETE, chính chủ). */
export const CANCEL_ENDPOINT: Record<RequestKind, (id: string) => string> = {
  leave: (id) => `/api/leave/requests/${id}`,
  adjustment: (id) => `/api/attendance/adjustments/${id}`,
  overtime: (id) => `/api/attendance/overtime/${id}`,
};

export function fmtDateVN(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Khoảng ngày hiển thị: 1 ngày → "05/08/2026", nhiều ngày → "05/08 → 09/08/2026". */
export function fmtRangeVN(start: string, end: string): string {
  if (start === end) return fmtDateVN(start);
  const s = new Date(start + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  return `${s} → ${fmtDateVN(end)}`;
}

/** Số lượng hiển thị: ưu tiên giờ (tăng ca, nghỉ theo giờ); bù giờ vào/ra không có "ngày". */
export function fmtAmount(item: MyRequestItem): string {
  const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  if (item.amount_hours != null && item.amount_hours > 0) return `${fmtNum(item.amount_hours)} giờ`;
  if (item.amount_days != null && item.amount_days > 0) return `${fmtNum(item.amount_days)} ngày`;
  return '—'; // bu_checkin/bu_checkout: chỉ vá 1 lượt quẹt, không tính ngày công
}

const TODAY_VN = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

/**
 * Đơn có hủy được không: pending mọi loại; riêng nghỉ phép ĐÃ DUYỆT vẫn hủy được
 * nếu chưa tới ngày nghỉ (backend hoàn quỹ — leaveRequestService.cancelLeave).
 */
export function canCancel(item: MyRequestItem): boolean {
  if (item.status === 'pending') return true;
  return item.kind === 'leave' && item.status === 'approved' && item.start_date > TODAY_VN();
}
