'use client';

import React from 'react';
import Link from 'next/link';
import { Contact, TicketPlus, DoorOpen, CalendarOff } from 'lucide-react';

const ACTIONS = [
  { label: 'Đầu Mối Liên Hệ', href: '/tra-cuu/dau-moi', icon: <Contact size={18} />, color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  { label: 'Tạo ticket', href: '/tickets', icon: <TicketPlus size={18} />, color: 'text-red-400', bg: 'bg-red-500/15' },
  { label: 'Đặt phòng', href: '/room-bookings', icon: <DoorOpen size={18} />, color: 'text-teal-400', bg: 'bg-teal-500/15' },
  { label: 'Xin nghỉ phép', href: '/tra-cuu/du-lieu-cong/nghi-phep/tao', icon: <CalendarOff size={18} />, color: 'text-violet-400', bg: 'bg-violet-500/15' },
];

/** Hàng nút thao tác nhanh cho nhân viên. */
export default function UserQuickActions() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
      {ACTIONS.map(a => (
        <Link
          key={a.label}
          href={a.href}
          className="flex items-center gap-2.5 rounded-2xl border border-line-subtle px-3.5 py-3 hover:bg-white/[0.04] transition-colors"
          style={{ background: 'var(--card)' }}
        >
          <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${a.bg}`}>
            <span className={a.color}>{a.icon}</span>
          </span>
          <span className="text-sm font-600 text-foreground">{a.label}</span>
        </Link>
      ))}
    </div>
  );
}
