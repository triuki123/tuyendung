/**
 * Task Utilities
 * Handles task code generation, activity logging, and task-related operations
 */

/**
 * Format date as ddmmyyyy
 * @param date Date to format
 * @returns String in format ddmmyyyy
 */
export function formatDateForTaskCode(date: Date = new Date()): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}${month}${year}`;
}

/**
 * Generate task code in format Task-ddmmyyyy-0001
 * @param sequenceNumber The sequence number for today (1, 2, 3, etc.)
 * @param date Optional date, defaults to today
 * @returns Task code string
 */
export function generateTaskCode(sequenceNumber: number, date: Date = new Date()): string {
  const dateStr = formatDateForTaskCode(date);
  const sequenceStr = String(sequenceNumber).padStart(4, '0');
  return `Task-${dateStr}-${sequenceStr}`;
}

/**
 * Parse task code to extract date and sequence
 * @param taskCode Task code string (e.g., Task-18052026-0001)
 * @returns Object with date and sequence number, or null if invalid
 */
export function parseTaskCode(taskCode: string): { date: Date; sequence: number } | null {
  const regex = /^Task-(\d{2})(\d{2})(\d{4})-(\d{4})$/;
  const match = taskCode.match(regex);

  if (!match) return null;

  const [, day, month, year, sequence] = match;
  const date = new Date(`${year}-${month}-${day}`);

  return {
    date,
    sequence: parseInt(sequence, 10),
  };
}

/**
 * Task Activity Types
 */
export type TaskActivityAction =
  | 'created'
  | 'status_changed'
  | 'archived'
  | 'restored'
  | 'commented'
  | 'assigned'
  | 'title_changed'
  | 'description_changed';

/**
 * Activity Log Entry
 */
export interface TaskActivity {
  id?: number;
  task_id: string;
  user_id?: string;
  action: TaskActivityAction;
  old_value?: string;
  new_value?: string;
  description?: string;
  created_at?: string;
  created_by_user_id?: string;
  created_by_user_name?: string;
}

/**
 * Format activity log for display
 * @param activity Activity log entry
 * @returns Human-readable description
 */
export function formatActivityLog(activity: TaskActivity): string {
  const userName = activity.created_by_user_name || 'System';
  const timestamp = activity.created_at ? new Date(activity.created_at).toLocaleString('vi-VN') : '';

  switch (activity.action) {
    case 'created':
      return `${userName} tạo task lúc ${timestamp}`;
    case 'status_changed':
      return `${userName} thay đổi trạng thái từ "${activity.old_value}" → "${activity.new_value}" lúc ${timestamp}`;
    case 'archived':
      return `${userName} lưu trữ task lúc ${timestamp}`;
    case 'restored':
      return `${userName} khôi phục task lúc ${timestamp}`;
    case 'assigned':
      return `${userName} gán task cho "${activity.new_value}" lúc ${timestamp}`;
    case 'title_changed':
      return `${userName} cập nhật tiêu đề lúc ${timestamp}`;
    case 'description_changed':
      return `${userName} cập nhật mô tả lúc ${timestamp}`;
    case 'commented':
      return `${userName} bình luận lúc ${timestamp}`;
    default:
      return `${userName} cập nhật task lúc ${timestamp}`;
  }
}

/**
 * Get activity icon by action type
 * @param action Activity action type
 * @returns Icon component name
 */
export function getActivityIcon(action: TaskActivityAction): string {
  const iconMap: Record<TaskActivityAction, string> = {
    created: '✨',
    status_changed: '📝',
    archived: '📦',
    restored: '↻',
    commented: '💬',
    assigned: '👤',
    title_changed: '✏️',
    description_changed: '📄',
  };
  return iconMap[action] || '📝';
}

/**
 * Get activity color badge
 * @param action Activity action type
 * @returns Tailwind color classes
 */
export function getActivityBadgeColor(action: TaskActivityAction): string {
  const colorMap: Record<TaskActivityAction, string> = {
    created: 'bg-emerald-500/10 text-emerald-400',
    status_changed: 'bg-blue-500/10 text-blue-400',
    archived: 'bg-orange-500/10 text-orange-400',
    restored: 'bg-green-500/10 text-green-400',
    commented: 'bg-purple-500/10 text-purple-400',
    assigned: 'bg-indigo-500/10 text-indigo-400',
    title_changed: 'bg-yellow-500/10 text-yellow-400',
    description_changed: 'bg-cyan-500/10 text-cyan-400',
  };
  return colorMap[action] || 'bg-slate-500/10 text-ink-muted';
}
