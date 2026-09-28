'use client';

import React from 'react';
import { BarChart3 } from 'lucide-react';

interface UserStatisticsProps {
  tickets: any[];
  tasks: any[];
}

function Row({ label, total, done, inProgress, todo, pct }: {
  label: string; total: number; done: number; inProgress: number; todo: number; pct: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-500 text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground"><span className="text-emerald-400 font-600">{pct}%</span> hoàn thành</span>
      </div>
      <div className="h-2 rounded-full bg-hover overflow-hidden">
        <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-3 mt-2 text-2xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Xong {done}</span>
        <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Đang làm {inProgress}</span>
        <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Chưa làm {todo}</span>
        <span className="ml-auto">Tổng {total}</span>
      </div>
    </div>
  );
}

/** Thống kê cá nhân — bản THU GỌN (tỉ lệ hoàn thành + breakdown), không dùng biểu đồ lớn. */
export default function UserStatistics({ tickets, tasks }: UserStatisticsProps) {
  const tkDone = tickets.filter(t => ['resolved', 'closed'].includes(t.status)).length;
  const tkProg = tickets.filter(t => t.status === 'in_progress').length;
  const tkTodo = tickets.filter(t => t.status === 'open').length;
  const tkPct = tickets.length > 0 ? Math.round((tkDone / tickets.length) * 100) : 0;

  const tsDone = tasks.filter(t => t.status === 'done').length;
  const tsProg = tasks.filter(t => t.status === 'in_progress').length;
  const tsTodo = tasks.filter(t => t.status === 'todo').length;
  const tsPct = tasks.length > 0 ? Math.round((tsDone / tasks.length) * 100) : 0;

  return (
    <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
      <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3.5 border-b border-line-subtle">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-sky-500/15 shrink-0">
          <BarChart3 size={16} className="text-sky-400" />
        </div>
        <h3 className="text-base font-600 text-foreground leading-tight">Thống Kê Cá Nhân</h3>
      </div>
      <div className="px-4 sm:px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Row label="Ticket" total={tickets.length} done={tkDone} inProgress={tkProg} todo={tkTodo} pct={tkPct} />
        <Row label="Công việc" total={tasks.length} done={tsDone} inProgress={tsProg} todo={tsTodo} pct={tsPct} />
      </div>
    </div>
  );
}
