import { Clock, Loader2, CheckCircle, XCircle } from 'lucide-react';

/**
 * Task Priority Configuration
 * Được sử dụng để hiển thị styling và labels cho độ ưu tiên
 */
export const TASK_PRIORITY_CONFIG = {
  low: {
    label: 'Thấp',
    color: 'text-ink-muted',
    bg: 'bg-slate-500/15 border-slate-500/30',
    dotColor: '#6B7280', // Gray
  },
  medium: {
    label: 'Trung bình',
    color: 'text-amber-400',
    bg: 'bg-amber-500/15 border-amber-500/30',
    dotColor: '#EAB308', // Yellow
  },
  high: {
    label: 'Cao',
    color: 'text-orange-400',
    bg: 'bg-orange-500/15 border-orange-500/30',
    dotColor: '#F97316', // Orange
  },
};

/**
 * Task Status Configuration
 * Được sử dụng để hiển thị styling, labels, và icons cho trạng thái
 */
export const TASK_STATUS_CONFIG = {
  todo: {
    label: 'Chờ làm',
    color: 'text-ink-muted',
    bg: 'bg-slate-500/15 border-slate-500/30',
    icon: Clock,
    value: 'todo',
  },
  in_progress: {
    label: 'Đang làm',
    color: 'text-amber-400',
    bg: 'bg-amber-500/15 border-amber-500/30',
    icon: Loader2,
    value: 'in_progress',
  },
  done: {
    label: 'Hoàn thành',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/15 border-emerald-500/30',
    icon: CheckCircle,
    value: 'done',
  },
  cancelled: {
    label: 'Đã hủy',
    color: 'text-red-400',
    bg: 'bg-red-500/15 border-red-500/30',
    icon: XCircle,
    value: 'cancelled',
  },
};

/**
 * Task Sorting Options
 * Các tùy chọn sắp xếp danh sách task
 */
export const TASK_SORT_OPTIONS = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'oldest', label: 'Cũ nhất' },
  { value: 'priority-high', label: 'Ưu tiên cao trước' },
  { value: 'priority-low', label: 'Ưu tiên thấp trước' },
  { value: 'deadline-soon', label: 'Hạn sớm trước' },
  { value: 'deadline-late', label: 'Hạn muộn trước' },
  { value: 'title-asc', label: 'Tên (A-Z)' },
  { value: 'title-desc', label: 'Tên (Z-A)' },
];

/**
 * Helper function để lấy text cho status dropdown
 */
export function getTaskStatusText(status: string): string {
  return TASK_STATUS_CONFIG[status as keyof typeof TASK_STATUS_CONFIG]?.label || status;
}

/**
 * Helper function để lấy text cho priority dropdown
 */
export function getTaskPriorityText(priority: string): string {
  return TASK_PRIORITY_CONFIG[priority as keyof typeof TASK_PRIORITY_CONFIG]?.label || priority;
}

/**
 * Helper function để format deadline status
 */
export function formatTaskDeadlineStatus(dueDate: string | null): string {
  if (!dueDate) return 'Không có hạn';

  // Normalize dates to midnight to ignore time component
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const diff = due.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days < 0) {
    return '🔴 Quá hạn';
  } else if (days === 0) {
    return '⏰ Hôm nay';
  } else if (days === 1) {
    return '⏰ Ngày mai';
  } else if (days <= 7) {
    return `⏰ ${days} ngày nữa`;
  } else {
    return `📅 ${due.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
  }
}
