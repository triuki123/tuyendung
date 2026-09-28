import React from 'react';
import Link from 'next/link';
import { Ticket, ArrowRight } from 'lucide-react';
import { MOCK_TICKETS } from '@/lib/mockData';
import { PriorityBadge, TicketStatusBadge } from '@/components/ui/TicketBadge';

export default function RecentTickets() {
  const recent = MOCK_TICKETS?.slice(0, 5);

  return (
    <div className="rounded-2xl border border-white/05 overflow-hidden" style={{ background: 'var(--card)' }}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/05">
        <div className="flex items-center gap-2">
          <Ticket size={18} className="text-indigo-400" />
          <h3 className="text-base font-600 text-foreground">Ticket Gần Đây</h3>
          <span className="text-2xs font-600 text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-2 py-0.5">
            {MOCK_TICKETS?.filter(t => t?.status === 'open' || t?.status === 'in_progress')?.length} đang mở
          </span>
        </div>
        <Link href="/dashboard" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors">
          Xem tất cả <ArrowRight size={13} />
        </Link>
      </div>
      <div className="divide-y divide-white/04">
        {recent?.map(ticket => (
          <div key={`ticket-row-${ticket?.id}`} className="px-5 py-3.5 table-row-hover">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-500 text-foreground truncate">{ticket?.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground font-mono">{ticket?.code}</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="text-xs text-muted-foreground">{ticket?.asset_code}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <PriorityBadge priority={ticket?.priority} />
                <TicketStatusBadge status={ticket?.status} />
              </div>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-2xs text-muted-foreground">Danh mục: {ticket?.support_category || '—'}</span>
              <span className="text-2xs text-muted-foreground">{ticket?.created_at}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}