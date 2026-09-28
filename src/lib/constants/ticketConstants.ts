/**
 * Ticket Constants - Cấu hình trạng thái, độ ưu tiên
 */

export const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: 'Thấp', color: 'text-ink-muted', bg: 'bg-slate-500/15 border-slate-500/30' },
  medium: { label: 'Trung bình', color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/30' },
  high: { label: 'Cao', color: 'text-orange-400', bg: 'bg-orange-500/15 border-orange-500/30' },
  critical: { label: 'Khẩn cấp', color: 'text-red-400', bg: 'bg-red-500/15 border-red-500/30' },
};

export const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  // Legacy values (backward compat)
  open:     { label: 'Đã gửi',        color: 'text-blue-400',    bg: 'bg-blue-500/15 border-blue-500/30' },
  resolved: { label: 'Đã hoàn thành', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' },
  pending:  { label: 'Đã gửi',        color: 'text-blue-400',    bg: 'bg-blue-500/15 border-blue-500/30' },
  // New values
  submitted:   { label: 'Đã gửi',        color: 'text-blue-400',    bg: 'bg-blue-500/15 border-blue-500/30' },
  in_progress: { label: 'Đang xử lý',    color: 'text-amber-400',   bg: 'bg-amber-500/15 border-amber-500/30' },
  completed:   { label: 'Đã hoàn thành', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' },
  rejected:    { label: 'Từ chối',       color: 'text-red-400',     bg: 'bg-red-500/15 border-red-500/30' },
  closed:      { label: 'Đóng',          color: 'text-ink-muted',   bg: 'bg-slate-500/15 border-slate-500/30' },
};

export const SORT_OPTIONS = [
  { label: 'Mới nhất', value: 'newest' },
  { label: 'Cũ nhất', value: 'oldest' },
  { label: 'Ưu tiên cao nhất', value: 'priority-high' },
  { label: 'Ưu tiên thấp nhất', value: 'priority-low' },
  { label: 'A → Z', value: 'title-asc' },
  { label: 'Z → A', value: 'title-desc' },
];
