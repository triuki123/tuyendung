'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, ClipboardEdit, Clock, X } from 'lucide-react';
import { MyRequestItem, KIND_META } from './types';

interface Props {
  month: number;
  year: number;
  items: MyRequestItem[];
  compact: boolean; // màn nhỏ: ô thấp, chip → chấm màu
  onSelectItem: (item: MyRequestItem) => void;
  /** Tạo đơn tại chỗ (modal) — bù công / tăng ca; nghỉ phép vẫn điều hướng trang riêng. */
  onCreate?: (kind: 'adjustment' | 'overtime', date: string) => void;
}

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

/** Lưới lịch tháng tự viết: 7 cột T2→CN, mỗi đơn là chip trong từng ngày thuộc khoảng. */
export default function RequestsCalendar({ month, year, items, compact, onSelectItem, onCreate }: Props) {
  const router = useRouter();
  const [dayMenu, setDayMenu] = useState<string | null>(null); // YYYY-MM-DD

  const pad = (n: number) => String(n).padStart(2, '0');
  const today = todayISO();

  // Danh sách ô: null = ô đệm trước ngày 1
  const cells = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    // getDay(): CN=0 → cột T2-đầu: (day+6)%7
    const lead = (first.getDay() + 6) % 7;
    const arr: (string | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(`${year}-${pad(month)}-${pad(d)}`);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [month, year]);

  // Map ngày → đơn (span nhiều ngày → xuất hiện ở từng ngày)
  const byDay = useMemo(() => {
    const map: Record<string, MyRequestItem[]> = {};
    for (const it of items) {
      const start = new Date(it.start_date + 'T00:00:00');
      const end = new Date(it.end_date + 'T00:00:00');
      let guard = 0;
      for (let d = new Date(start); d <= end && guard < 62; d.setDate(d.getDate() + 1), guard++) {
        const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        if (!key.startsWith(`${year}-${pad(month)}`)) continue;
        (map[key] ??= []).push(it);
      }
    }
    return map;
  }, [items, month, year]);

  function chipCls(it: MyRequestItem): string {
    const base = KIND_META[it.kind].chip;
    let extra = '';
    if (it.status === 'pending') extra = ' border-dashed opacity-80';
    else if (it.status === 'rejected') extra = ' line-through opacity-50';
    else if (it.status === 'cancelled') extra = ' opacity-40';
    return base + extra;
  }

  return (
    <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
      {/* Hàng thứ */}
      <div className="grid grid-cols-7 border-b border-white/5">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`px-1 py-2 text-center text-xs font-600 uppercase tracking-wider ${i >= 5 ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>
            {w}
          </div>
        ))}
      </div>

      {/* Lưới ngày */}
      <div className="grid grid-cols-7">
        {cells.map((date, idx) => {
          if (!date) return <div key={`e${idx}`} className="border-b border-r border-white/5 bg-white/[0.01]" />;
          const col = idx % 7;
          const isWeekend = col >= 5;
          const isToday = date === today;
          const dayItems = byDay[date] ?? [];
          return (
            <div
              key={date}
              onClick={() => setDayMenu(date)}
              className={`relative cursor-pointer border-b border-r border-white/5 p-1 transition-colors hover:bg-white/5 ${
                isWeekend ? 'bg-white/[0.03]' : ''
              } ${compact ? 'min-h-[52px]' : 'min-h-[90px]'} ${isToday ? 'ring-1 ring-inset ring-indigo-500' : ''}`}
            >
              <p className={`text-xs font-600 ${isToday ? 'text-indigo-400' : isWeekend ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>
                {Number(date.slice(8, 10))}
              </p>
              {compact ? (
                <div className="mt-1 flex flex-wrap gap-0.5">
                  {dayItems.slice(0, 4).map((it) => (
                    <button
                      key={it.id}
                      onClick={(e) => { e.stopPropagation(); onSelectItem(it); }}
                      className={`h-1.5 w-1.5 rounded-full ${KIND_META[it.kind].dot} ${it.status === 'pending' ? 'opacity-60' : it.status === 'rejected' || it.status === 'cancelled' ? 'opacity-30' : ''}`}
                      aria-label={it.sub_label}
                    />
                  ))}
                  {dayItems.length > 4 && <span className="text-[9px] text-muted-foreground">+{dayItems.length - 4}</span>}
                </div>
              ) : (
                <div className="mt-1 space-y-0.5">
                  {dayItems.slice(0, 3).map((it) => (
                    <button
                      key={it.id}
                      onClick={(e) => { e.stopPropagation(); onSelectItem(it); }}
                      className={`block w-full truncate rounded border px-1 py-0.5 text-left text-[10px] font-500 ${chipCls(it)}`}
                      title={it.sub_label}
                    >
                      {it.sub_label}
                    </button>
                  ))}
                  {dayItems.length > 3 && (
                    <p className="px-1 text-[10px] text-muted-foreground">+{dayItems.length - 3} đơn khác</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Menu tạo đơn cho ngày */}
      {dayMenu && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={() => setDayMenu(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl border border-white/10 overflow-hidden"
            style={{ background: 'var(--card)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <h2 className="text-base font-700 text-foreground">
                Tạo đơn ngày {new Date(dayMenu + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </h2>
              <button onClick={() => setDayMenu(null)} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-4 space-y-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <MenuItem
                icon={<CalendarDays className="h-4 w-4 text-emerald-400" />}
                bg="bg-emerald-500/15"
                title="Xin nghỉ phép"
                desc="Nghỉ theo ngày, nửa buổi hoặc theo giờ"
                onClick={() => router.push(`/tra-cuu/du-lieu-cong/nghi-phep/tao?date=${dayMenu}`)}
              />
              {/* Bù công/tăng ca chỉ có nghĩa cho ngày ĐÃ/ĐANG diễn ra — ngày tương lai server cũng từ chối */}
              {dayMenu <= todayISO() ? (
                <>
                  <MenuItem
                    icon={<ClipboardEdit className="h-4 w-4 text-violet-400" />}
                    bg="bg-violet-500/15"
                    title="Xin bù công / công đặc biệt"
                    desc="Bù công, công tác, WFH, làm theo ca"
                    onClick={() => {
                      const d = dayMenu; setDayMenu(null);
                      if (onCreate) onCreate('adjustment', d);
                      else router.push(`/tra-cuu/du-lieu-cong/tra-cuu?buCong=${d}`);
                    }}
                  />
                  <MenuItem
                    icon={<Clock className="h-4 w-4 text-amber-400" />}
                    bg="bg-amber-500/15"
                    title="Xin tăng ca"
                    desc="Khai báo giờ tăng ca của ngày này"
                    onClick={() => {
                      const d = dayMenu; setDayMenu(null);
                      if (onCreate) onCreate('overtime', d);
                      else router.push(`/tra-cuu/du-lieu-cong/tra-cuu?tangCa=${d}`);
                    }}
                  />
                </>
              ) : (
                <p className="px-2 py-1 text-[11px] text-muted-foreground opacity-70">
                  Bù công / tăng ca chỉ tạo được cho ngày đã diễn ra
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, bg, title, desc, onClick }: {
  icon: React.ReactNode; bg: string; title: string; desc: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-white/5 p-3 text-left transition-colors hover:bg-white/5"
    >
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${bg}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-600 text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
    </button>
  );
}
