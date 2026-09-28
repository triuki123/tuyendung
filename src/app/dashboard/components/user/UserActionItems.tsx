'use client';

import React from 'react';
import Link from 'next/link';
import { ListChecks, CheckCircle2, ArrowRight, Ticket, ClipboardList, DoorOpen } from 'lucide-react';

interface Props {
  ticketsOpen: number;
  tasksTodo: number;
  roomsPending: number;
  loading?: boolean;
}

/** "Cần Xử Lý Hôm Nay" — việc CÁ NHÂN của nhân viên (ticket/task/đặt phòng chưa xong). */
export default function UserActionItems({ ticketsOpen, tasksTodo, roomsPending, loading }: Props) {
  const items = [
    { key: 'tickets', label: 'Ticket của tôi chưa xử lý', count: ticketsOpen, href: '/tickets', icon: <Ticket size={15} />, color: 'text-red-400', bg: 'bg-red-500/15' },
    { key: 'tasks', label: 'Công việc chưa hoàn thành', count: tasksTodo, href: '/tasks', icon: <ClipboardList size={15} />, color: 'text-violet-400', bg: 'bg-violet-500/15' },
    { key: 'rooms', label: 'Đặt phòng chờ duyệt', count: roomsPending, href: '/room-bookings', icon: <DoorOpen size={15} />, color: 'text-teal-400', bg: 'bg-teal-500/15' },
  ].filter(i => i.count > 0);
  const total = items.reduce((a, i) => a + i.count, 0);

  return (
    <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
      <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3.5 border-b border-line-subtle">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-rose-500/15 shrink-0">
          <ListChecks size={16} className="text-rose-400" />
        </div>
        <div>
          <h3 className="text-base font-600 text-foreground leading-tight">Cần Xử Lý Hôm Nay</h3>
          <p className="text-2xs text-muted-foreground">{loading ? 'Đang tải…' : total > 0 ? `${total} việc của bạn` : 'Bạn đã xong hết'}</p>
        </div>
      </div>
      {loading ? (
        <div className="h-20 animate-pulse bg-white/[0.02]" />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-muted-foreground">
          <CheckCircle2 className="h-8 w-8 mb-2 text-emerald-400/60" />
          <p className="text-sm">Không có việc cần xử lý 🎉</p>
        </div>
      ) : (
        <div className="divide-y divide-line-subtle">
          {items.map(i => (
            <Link key={i.key} href={i.href} className="flex items-center gap-3 px-4 sm:px-5 py-2.5 hover:bg-white/[0.04] transition-colors group">
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${i.bg}`}><span className={i.color}>{i.icon}</span></span>
              <span className="flex-1 text-sm text-foreground">{i.label}</span>
              <span className={`text-sm font-700 tabular-nums ${i.color}`}>{i.count}</span>
              <ArrowRight size={14} className="text-muted-foreground/40 group-hover:text-foreground transition-colors" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
