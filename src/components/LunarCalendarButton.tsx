'use client';

import { useMemo, useRef, useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { solarToLunar, canChiYear, canChiMonth, canChiDay, weekdayVi } from '@/lib/lunar/lunarCalendar';

function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Nút lịch Âm-Dương trên topbar: xem ngày âm hôm nay + đổi nhanh ngày bất kỳ. */
export default function LunarCalendarButton() {
  const [open, setOpen] = useState(false);
  const [dateStr, setDateStr] = useState(todayLocalISO());
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const info = useMemo(() => {
    const [yy, mm, dd] = dateStr.split('-').map(Number);
    if (!yy || !mm || !dd) return null;
    const lunar = solarToLunar(dd, mm, yy);
    return {
      weekday: weekdayVi(dd, mm, yy),
      solar: `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${yy}`,
      lunarDay: lunar.day,
      lunarMonth: lunar.month,
      lunarYear: lunar.year,
      leap: lunar.leap,
      canChiDay: canChiDay(dd, mm, yy),
      canChiMonth: canChiMonth(lunar.month, lunar.year),
      canChiYear: canChiYear(lunar.year),
    };
  }, [dateStr]);

  const isToday = dateStr === todayLocalISO();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setDateStr(todayLocalISO()); setOpen((v) => !v); }}
        className="flex items-center justify-center w-9 h-9 rounded-xl btn-ghost text-muted-foreground hover:text-foreground transition-colors"
        title="Lịch Âm - Dương"
        aria-label="Lịch Âm - Dương"
      >
        <CalendarDays size={18} />
      </button>

      {open && info && (
        <div
          className="absolute right-0 top-12 w-72 rounded-2xl border border-white/10 z-50 overflow-hidden modal-entrance"
          style={{ background: 'var(--card)', boxShadow: 'var(--shadow-modal)' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <p className="text-sm font-700 text-foreground flex items-center gap-2">
              <CalendarDays size={15} className="text-indigo-400" /> Lịch Âm - Dương
            </p>
            <button onClick={() => setOpen(false)} className="btn-ghost rounded-lg p-1"><X size={14} /></button>
          </div>

          {/* Ngày lớn */}
          <div className="px-4 py-4 text-center border-b border-white/5">
            <p className="text-xs text-muted-foreground">{info.weekday} · Dương lịch {info.solar}</p>
            <p className="text-3xl font-700 text-indigo-400 mt-1">{info.lunarDay}/{info.lunarMonth}{info.leap ? ' (N)' : ''}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Âm lịch — năm {info.canChiYear}</p>
          </div>

          {/* Can chi chi tiết */}
          <div className="px-4 py-3 grid grid-cols-3 gap-2 text-center border-b border-white/5">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ngày</p>
              <p className="text-xs font-600 text-foreground">{info.canChiDay}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tháng</p>
              <p className="text-xs font-600 text-foreground">{info.canChiMonth}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Năm</p>
              <p className="text-xs font-600 text-foreground">{info.canChiYear}</p>
            </div>
          </div>

          {/* Đổi ngày */}
          <div className="px-4 py-3 space-y-2">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Xem ngày khác (dương lịch)</label>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2 text-sm text-foreground"
            />
            {!isToday && (
              <button onClick={() => setDateStr(todayLocalISO())} className="text-xs text-indigo-400 font-600">
                ← Về hôm nay
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
