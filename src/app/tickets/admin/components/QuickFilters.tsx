import React from 'react';

interface QuickFiltersProps {
  statusFilter: string;
  onStatusChange: (status: string) => void;
  priorityFilter: string;
  onPriorityChange: (priority: string) => void;
}

export default function QuickFilters({
  statusFilter,
  onStatusChange,
  priorityFilter,
  onPriorityChange,
}: QuickFiltersProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-row gap-3">
      <select
        value={statusFilter}
        onChange={e => onStatusChange(e.target.value)}
        className="h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60"
      >
        <option value="">Tất cả trạng thái</option>
        <option value="open">Mở</option>
        <option value="in_progress">Đang xử lý</option>
        <option value="resolved">Đã giải quyết</option>
        <option value="closed">Đóng</option>
      </select>

      <select
        value={priorityFilter}
        onChange={e => onPriorityChange(e.target.value)}
        className="h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60"
      >
        <option value="">Tất cả độ ưu tiên</option>
        <option value="low">Thấp</option>
        <option value="medium">Trung bình</option>
        <option value="high">Cao</option>
        <option value="critical">Khẩn cấp</option>
      </select>
    </div>
  );
}
