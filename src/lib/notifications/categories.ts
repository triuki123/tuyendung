/**
 * categories.ts — phân loại thông báo (notifications.type) thành NHÓM để hiển thị/lọc
 * ở Trung Tâm Thông Báo. Thuần suy diễn từ `type` (không đụng DB).
 *
 * Dùng chung: server (lọc SQL theo mảng type của 1 nhóm) + client (render chips).
 */

export type CategoryKey =
  | 'tasks'
  | 'tickets'
  | 'approvals'
  | 'attendance'
  | 'hr'
  | 'recruitment'
  | 'assets'
  | 'rooms'
  | 'solace'
  | 'announcements'
  | 'other';

export interface CategoryMeta {
  key: CategoryKey;
  label: string;
  icon: string; // emoji cho gọn (đồng bộ với icon notif sẵn có)
}

/** Thứ tự hiển thị chips (không gồm 'Tất cả' — trang tự thêm). */
export const CATEGORY_META: CategoryMeta[] = [
  { key: 'tasks', label: 'Công việc', icon: '📋' },
  { key: 'tickets', label: 'Ticket', icon: '🎫' },
  { key: 'approvals', label: 'Chờ duyệt', icon: '✅' },
  { key: 'attendance', label: 'Chấm công & Phép', icon: '⏱️' },
  { key: 'hr', label: 'Nhân sự', icon: '👤' },
  { key: 'recruitment', label: 'Tuyển dụng', icon: '📣' },
  { key: 'assets', label: 'Tài sản', icon: '📦' },
  { key: 'rooms', label: 'Đặt phòng', icon: '🚪' },
  { key: 'solace', label: 'Solace', icon: '☕' },
  { key: 'announcements', label: 'Thông báo chung', icon: '📢' },
  { key: 'other', label: 'Khác', icon: '🔔' },
];

export const CATEGORY_LABEL: Record<CategoryKey, string> = CATEGORY_META.reduce(
  (acc, m) => {
    acc[m.key] = m.label;
    return acc;
  },
  {} as Record<CategoryKey, string>,
);

/**
 * Suy nhóm từ `type`. Ưu tiên rule cụ thể trước, rồi tới prefix. Bất kỳ type lạ nào
 * rơi vào 'other' → không bao giờ mất tin.
 */
export function categorize(type: string): CategoryKey {
  const t = (type || '').toLowerCase();

  // Duyệt yêu cầu (đơn CHỜ duyệt gửi tới người duyệt)
  if (
    t === 'overtime_submitted' ||
    t === 'adjustment_submitted' ||
    t === 'leave_submitted' ||
    t === 'onboarding_sent_to_admin' ||
    t.startsWith('delete_request')
  ) {
    return 'approvals';
  }

  // Chấm công & Phép (kết quả duyệt / check-in-out / tổng hợp)
  if (
    t.startsWith('attendance_') ||
    t.startsWith('overtime_') ||
    t.startsWith('adjustment_') ||
    t.startsWith('leave_')
  ) {
    return 'attendance';
  }

  if (t.startsWith('task_')) return 'tasks';
  if (t.startsWith('ticket_')) return 'tickets';
  if (t.startsWith('room_')) return 'rooms';
  if (t.startsWith('solace_')) return 'solace';
  if (t.startsWith('asset_') || t.startsWith('domain_')) return 'assets';

  if (
    t.startsWith('requisition_') ||
    t.startsWith('interview_') ||
    t.startsWith('application_') ||
    t.startsWith('recruitment_')
  ) {
    return 'recruitment';
  }

  if (
    t.startsWith('contract_') ||
    t.startsWith('evaluation_') ||
    t.startsWith('offboarding_') ||
    t.startsWith('onboarding_') ||
    t.startsWith('hr_doc_')
  ) {
    return 'hr';
  }

  if (t === 'announcement' || t === 'document' || t.startsWith('birthday_')) {
    return 'announcements';
  }

  return 'other';
}
