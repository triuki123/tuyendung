import React from 'react';
import { TicketPriority, TicketStatus } from '@/lib/types/ticket';

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; className: string }> = {
  low: { label: 'Thấp', className: 'bg-slate-500/15 text-ink-muted border border-slate-500/30' },
  medium: { label: 'Trung bình', className: 'bg-blue-500/15 text-blue-400 border border-blue-500/30' },
  high: { label: 'Cao', className: 'bg-amber-500/15 text-amber-400 border border-amber-500/30' },
  critical: { label: 'Khẩn cấp', className: 'bg-red-500/15 text-red-400 border border-red-500/30' },
};

const STATUS_CONFIG: Record<TicketStatus, { label: string; className: string }> = {
  open: { label: 'Mở', className: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' },
  in_progress: { label: 'Đang xử lý', className: 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30' },
  resolved: { label: 'Đã giải quyết', className: 'bg-teal-500/15 text-teal-400 border border-teal-500/30' },
  closed: { label: 'Đóng', className: 'bg-slate-500/15 text-ink-muted border border-slate-500/30' },
  pending: { label: 'Chờ xử lý', className: 'bg-orange-500/15 text-orange-400 border border-orange-500/30' },
  rejected: { label: 'Từ chối', className: 'bg-red-500/15 text-red-400 border border-red-500/30' },
};

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const config = PRIORITY_CONFIG[priority];
  return (
    <span className={`inline-flex items-center rounded-full text-2xs font-600 px-2 py-0.5 ${config.className}`}>
      {config.label}
    </span>
  );
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center rounded-full text-2xs font-600 px-2 py-0.5 ${config.className}`}>
      {config.label}
    </span>
  );
}