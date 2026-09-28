/**
 * Registry phê duyệt qua Telegram — thiết kế mở rộng.
 * Mỗi loại yêu cầu khai báo: API duyệt sẵn có + body Duyệt/Từ chối + nhãn + link chi tiết.
 * Webhook chỉ GỌI NỘI BỘ chính các API PUT này nên tái dụng 100% logic + quyền + thông báo.
 *
 * Thêm loại mới = thêm 1 entry vào REGISTRY, KHÔNG sửa webhook.
 */

export type ApprovalType = 'leave' | 'adj' | 'adjbatch' | 'ot' | 'room' | 'expense';

interface Approver {
  id: string;
  name: string;
  role: string;
}

export interface ApprovalTypeConfig {
  label: string;
  /** Đường dẫn API duyệt (tương đối, ghép với origin của request). */
  endpoint: (id: string) => string;
  method: 'PUT' | 'POST';
  approveBody: (approver: Approver) => Record<string, unknown>;
  rejectBody: (approver: Approver, note?: string) => Record<string, unknown>;
  /** Link "Xem chi tiết" mở web app. */
  detailPath: (id: string) => string;
}

export const REGISTRY: Record<ApprovalType, ApprovalTypeConfig> = {
  leave: {
    label: 'Đơn nghỉ phép',
    endpoint: (id) => `/api/leave/requests/${id}`,
    method: 'PUT',
    approveBody: () => ({ action: 'approved' }),
    rejectBody: (_a, note) => ({ action: 'rejected', review_note: note || 'Từ chối qua Telegram' }),
    detailPath: () => `/tra-cuu/du-lieu-cong/nghi-phep`,
  },
  adj: {
    label: 'Đề xuất bù công',
    endpoint: (id) => `/api/attendance/adjustments/${id}`,
    method: 'PUT',
    approveBody: () => ({ action: 'approved' }),
    rejectBody: (_a, note) => ({ action: 'rejected', review_note: note || 'Từ chối qua Telegram' }),
    detailPath: () => `/tra-cuu/du-lieu-cong/xac-nhan`,
  },
  adjbatch: {
    label: 'Đề xuất bù công nhiều ngày',
    endpoint: (id) => `/api/attendance/adjustments/batch/${id}`,
    method: 'PUT',
    approveBody: () => ({ action: 'approved' }),
    rejectBody: (_a, note) => ({ action: 'rejected', review_note: note || 'Từ chối qua Telegram' }),
    detailPath: () => `/tra-cuu/du-lieu-cong/xac-nhan`,
  },
  ot: {
    label: 'Khai báo tăng ca',
    endpoint: (id) => `/api/attendance/overtime/${id}`,
    method: 'PUT',
    approveBody: () => ({ action: 'approved' }),
    rejectBody: (_a, note) => ({ action: 'rejected', review_note: note || 'Từ chối qua Telegram' }),
    detailPath: () => `/tra-cuu/du-lieu-cong/xac-nhan`,
  },
  room: {
    label: 'Đặt phòng họp',
    endpoint: (id) => `/api/room-bookings/${id}`,
    method: 'PUT',
    approveBody: (a) => ({ status: 'approved', approved_by: a.id, approval_by_name: a.name }),
    rejectBody: (a, note) => ({
      status: 'rejected',
      approved_by: a.id,
      approval_by_name: a.name,
      rejection_reason: note || 'Phòng họp không khả dụng',
    }),
    detailPath: (id) => `/room-bookings?bookingId=${id}`,
  },
  expense: {
    label: 'Phiếu chi',
    endpoint: (id) => `/api/expenses/${id}/approve`,
    method: 'POST',
    approveBody: () => ({}),
    rejectBody: (_a, note) => ({ reason: note || 'Từ chối qua Telegram' }),
    detailPath: (id) => `/chi-phi?open=${id}`,
  },
};

/** callback_data ngắn gọn (≤64 byte): `apv:<type>:<a|r>:<id>` */
export function buildCallbackData(type: ApprovalType, action: 'a' | 'r', id: string): string {
  return `apv:${type}:${action}:${id}`;
}

export function parseCallbackData(
  data: string,
): { type: ApprovalType; action: 'approve' | 'reject'; id: string } | null {
  const m = /^apv:(leave|adjbatch|adj|ot|room|expense):(a|r):(.+)$/.exec(data || '');
  if (!m) return null;
  return {
    type: m[1] as ApprovalType,
    action: m[2] === 'a' ? 'approve' : 'reject',
    id: m[3],
  };
}
