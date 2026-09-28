'use client';

import React, { useMemo } from 'react';
import { Loader2, GripVertical } from 'lucide-react';
import { Ticket } from '@/lib/types/ticket';

interface KanbanBoardProps {
  tickets: Ticket[];
  loading: boolean;
  onSelectTicket: (ticket: Ticket) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'Mở', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
  in_progress: { label: 'Đang xử lý', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
  resolved: { label: 'Đã giải quyết', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  closed: { label: 'Đóng', color: 'text-ink-muted', bg: 'bg-slate-500/10 border-slate-500/30' },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: 'Thấp', color: 'text-ink-muted', bg: 'bg-slate-500/15' },
  medium: { label: 'Trung bình', color: 'text-amber-400', bg: 'bg-amber-500/15' },
  high: { label: 'Cao', color: 'text-orange-400', bg: 'bg-orange-500/15' },
  critical: { label: 'Khẩn cấp', color: 'text-red-400', bg: 'bg-red-500/15' },
};

const STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;

export default function KanbanBoard({ tickets, loading, onSelectTicket }: KanbanBoardProps) {
  // Group tickets by status
  const columnData = useMemo(() => {
    const grouped = STATUSES.reduce((acc, status) => {
      acc[status] = tickets.filter(t => t.status === status);
      return acc;
    }, {} as Record<string, Ticket[]>);
    return grouped;
  }, [tickets]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/05 p-8 flex items-center justify-center" style={{ background: 'var(--card)' }}>
        <div className="flex flex-col items-center gap-2">
          <Loader2 size={32} className="text-indigo-400 animate-spin" />
          <p className="text-sm text-muted-foreground">Đang tải...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 min-w-full pb-4">
        {STATUSES.map(status => {
          const config = STATUS_CONFIG[status];
          const cards = columnData[status] || [];

          return (
            <div key={status} className="flex flex-col">
              {/* Column Header */}
              <div className="mb-4">
                <div className={`px-3 py-2 rounded-lg border ${config.bg}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-sm font-600 ${config.color}`}>{config.label}</p>
                      <p className="text-xs text-muted-foreground mt-1">{cards.length} ticket</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cards Container */}
              <div className="flex-1 space-y-3">
                {cards.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-line p-4 text-center">
                    <p className="text-xs text-muted-foreground">Không có ticket</p>
                  </div>
                ) : (
                  cards.map(ticket => {
                    const p = PRIORITY_CONFIG[ticket.priority];
                    return (
                      <div
                        key={ticket.id}
                        onClick={() => onSelectTicket(ticket)}
                        className="p-3 rounded-lg border border-line bg-white/02 hover:bg-white/05 cursor-pointer transition-all hover:border-line-strong group"
                      >
                        {/* Priority Badge */}
                        <div className="flex items-center justify-between mb-2">
                          <span className={`inline-flex text-2xs font-600 px-2 py-0.5 rounded ${p.bg} ${p.color}`}>
                            {p.label}
                          </span>
                          <GripVertical size={12} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>

                        {/* Code */}
                        <p className="text-2xs text-muted-foreground font-mono mb-1">{ticket.code}</p>

                        {/* Title */}
                        <p className="text-sm font-500 text-foreground line-clamp-2 mb-2">{ticket.title}</p>

                        {/* Metadata */}
                        <div className="space-y-1">
                          <p className="text-2xs text-muted-foreground">
                            <span className="text-ink-faint">Người tạo:</span> {ticket.created_by_name}
                          </p>
                          {ticket.assigned_to_name && (
                            <p className="text-2xs text-muted-foreground">
                              <span className="text-ink-faint">Giao cho:</span> {ticket.assigned_to_name}
                            </p>
                          )}
                          <p className="text-2xs text-muted-foreground">
                            {ticket.created_at.split('T')[0]}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
