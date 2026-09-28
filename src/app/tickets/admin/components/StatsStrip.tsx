'use client';

import React, { useMemo } from 'react';
import { Ticket } from '@/lib/types/ticket';

interface StatsStripProps {
  tickets: Ticket[];
  currentUser: any;
}

/**
 * Dải chỉ số gọn (1 hàng) cho trang Quản Lý Ticket.
 *
 * Thay cho <DashboardCards> + <StatsCards> cũ (8 thẻ, 2 hàng, ~250px) — đẩy danh sách
 * ticket xuống quá sâu. Đã bỏ 3 số TRÙNG LẶP với chỗ khác trên trang:
 *   - "Giao cho tôi"  → đã có ở tab "Ticket Giao Cho Tôi (n)"
 *   - "Tổng" và "Mở"  → đã có ở phụ đề "{n} ticket · {n} đang mở"
 */
export default function StatsStrip({ tickets, currentUser }: StatsStripProps) {
  const stats = useMemo(() => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const isOpen = (s: string) => s === 'open' || s === 'in_progress';

    const mine = tickets.filter(
      (t) => t.assigned_to === currentUser?.id && isOpen(t.status)
    ).length;
    const inProgress = tickets.filter((t) => t.status === 'in_progress').length;
    const overdue = tickets.filter(
      (t) => isOpen(t.status) && new Date(t.created_at) < sevenDaysAgo
    ).length;
    const critical = tickets.filter((t) => t.priority === 'critical').length;
    const done = tickets.filter(
      (t) => t.status === 'resolved' || t.status === 'closed'
    ).length;
    const rate = tickets.length > 0 ? Math.round((done / tickets.length) * 100) : 0;

    return [
      { label: 'Của tôi',    value: mine,          hint: 'đang mở',      color: 'text-blue-400' },
      { label: 'Đang xử lý', value: inProgress,    hint: '',             color: 'text-amber-400' },
      { label: 'Quá hạn',    value: overdue,       hint: 'hơn 7 ngày',   color: overdue > 0 ? 'text-red-400' : 'text-muted-foreground' },
      { label: 'Khẩn cấp',   value: critical,      hint: '',             color: critical > 0 ? 'text-red-400' : 'text-muted-foreground' },
      { label: 'Hoàn thành', value: `${rate}%`,    hint: 'toàn nhóm',    color: 'text-emerald-400' },
    ];
  }, [tickets, currentUser]);

  return (
    <div
      className="flex flex-wrap items-stretch rounded-xl border border-line overflow-hidden"
      style={{ background: 'var(--card)' }}
    >
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={`flex-1 min-w-[104px] px-3 py-2 sm:px-4 sm:py-2.5 ${
            i > 0 ? 'border-l border-line' : ''
          }`}
        >
          <div className="flex items-baseline gap-1.5">
            <span className={`text-base sm:text-lg font-700 leading-none ${s.color}`}>{s.value}</span>
            <span className="text-2xs sm:text-xs text-muted-foreground truncate">{s.label}</span>
          </div>
          {s.hint && (
            <p className="text-2xs text-muted-foreground/60 mt-0.5 truncate">{s.hint}</p>
          )}
        </div>
      ))}
    </div>
  );
}
