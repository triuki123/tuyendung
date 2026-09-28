'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Loader2, AlertTriangle, CalendarCheck2,
  AlarmClockOff, LogOut, UserX, FileQuestion, Palmtree,
} from 'lucide-react';
import { fmtMinutes } from './types';

export interface DayEvent {
  date: string;
  kind: 'late' | 'early_leave' | 'missing_punch' | 'absent' | 'leave';
  minutes?: number;
  checkIn?: string | null;
  checkOut?: string | null;
  leaveTypeName?: string;
  leaveMode?: 'day' | 'hour';
  missingSide?: 'in' | 'out';
}

interface DiligenceDayLogProps {
  userId: string;   // nhân sự đang xem
  from: string;
  to: string;
}

const KIND_META: Record<DayEvent['kind'], {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  chip: string;
  dot: string;
}> = {
  late:          { label: 'Đi trễ',      icon: AlarmClockOff, chip: 'border-amber-500/30 bg-amber-500/15 text-amber-400',   dot: 'text-amber-400' },
  early_leave:   { label: 'Về sớm',      icon: LogOut,        chip: 'border-orange-500/30 bg-orange-500/15 text-orange-400', dot: 'text-orange-400' },
  absent:        { label: 'Vắng KP',     icon: UserX,         chip: 'border-rose-500/30 bg-rose-500/15 text-rose-400',       dot: 'text-rose-400' },
  missing_punch: { label: 'Quên chấm',   icon: FileQuestion,  chip: 'border-sky-500/30 bg-sky-500/15 text-sky-400',          dot: 'text-sky-400' },
  leave:         { label: 'Nghỉ phép',   icon: Palmtree,      chip: 'border-teal-500/30 bg-teal-500/15 text-teal-400',       dot: 'text-teal-400' },
};

const DOW_VN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function fmtDateVN(d: string): string {
  const [y, m, dd] = d.split('-').map(Number);
  return `${DOW_VN[new Date(y, m - 1, dd).getDay()]}, ${String(dd).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

function eventText(e: DayEvent): string {
  switch (e.kind) {
    case 'late':
      return `Trễ ${fmtMinutes(e.minutes ?? 0)}${e.checkIn ? ` · vào ${e.checkIn}` : ''}`;
    case 'early_leave':
      return `Sớm ${fmtMinutes(e.minutes ?? 0)}${e.checkOut ? ` · ra ${e.checkOut}` : ''}`;
    case 'missing_punch':
      return e.missingSide === 'in'
        ? `Thiếu giờ vào${e.checkOut ? ` · ra ${e.checkOut}` : ''}`
        : `Thiếu giờ ra${e.checkIn ? ` · vào ${e.checkIn}` : ''}`;
    case 'absent':
      return 'Không chấm công, không có đơn phép';
    case 'leave':
      return `${e.leaveTypeName ?? 'Nghỉ phép'}${e.leaveMode === 'hour' ? ' (theo giờ)' : ''}`;
  }
}

/** Tab "Chi tiết ngày" — nhật ký từng ngày đi trễ/về sớm/vắng/quên chấm/nghỉ phép. */
export default function DiligenceDayLog({ userId, from, to }: DiligenceDayLogProps) {
  const [events, setEvents] = useState<DayEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | DayEvent['kind']>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const stored = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
        const callerId = stored ? (JSON.parse(stored).id ?? '') : '';
        const res = await fetch(`/api/attendance/diligence/${userId}?from=${from}&to=${to}`, {
          headers: { 'x-current-user-id': callerId },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Lỗi tải dữ liệu');
        if (!cancelled) setEvents(json.data ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Lỗi tải dữ liệu');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, from, to]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events) c[e.kind] = (c[e.kind] ?? 0) + 1;
    return c;
  }, [events]);

  const filtered = useMemo(
    () => (filter === 'all' ? events : events.filter((e) => e.kind === filter)),
    [events, filter]
  );

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (error) {
    return (
      <div className="flex flex-col items-center py-10 text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mb-2 text-amber-400/60" />
        <p className="text-xs">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Chip lọc theo loại sự kiện */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <button
          onClick={() => setFilter('all')}
          className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-600 transition-colors ${
            filter === 'all'
              ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-400'
              : 'border-white/10 text-muted-foreground hover:text-foreground'
          }`}
        >
          Tất cả ({events.length})
        </button>
        {(Object.keys(KIND_META) as DayEvent['kind'][]).map((k) => {
          const n = counts[k] ?? 0;
          if (n === 0) return null;
          return (
            <button
              key={k}
              onClick={() => setFilter(filter === k ? 'all' : k)}
              className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-600 transition-colors ${
                filter === k ? KIND_META[k].chip : 'border-white/10 text-muted-foreground hover:text-foreground'
              }`}
            >
              {KIND_META[k].label} ({n})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-muted-foreground">
          <CalendarCheck2 className="h-8 w-8 mb-2 text-emerald-400/50" />
          <p className="text-xs">
            {events.length === 0
              ? 'Không có vi phạm hay nghỉ phép nào trong kỳ — chuyên cần hoàn hảo 🎉'
              : 'Không có sự kiện thuộc loại này'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/5 divide-y divide-white/5 overflow-hidden">
          {filtered.map((e, i) => {
            const meta = KIND_META[e.kind];
            const Icon = meta.icon;
            return (
              <div key={`${e.date}-${e.kind}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                <Icon className={`h-4 w-4 shrink-0 ${meta.dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-600 text-foreground">{fmtDateVN(e.date)}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{eventText(e)}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-600 ${meta.chip}`}>
                  {meta.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
