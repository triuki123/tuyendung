'use client';

import React, { useEffect, useState } from 'react';
import { X, Cake, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

interface BirthdayPerson {
  id: string; name: string; avatar: string | null; email: string | null;
  dob_day: number; dob_month: number;
  department_name: string | null; company_name: string | null; is_vip: boolean;
}

const MONTHS = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

/** Danh sách nhân sự sinh nhật trong tháng — BOD & Leader highlight. */
export default function BirthdayMonthModal({ onClose }: { onClose: () => void }) {
  const nowMonth = Number(new Date().toLocaleString('en-US', { month: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }));
  const todayDay = Number(new Date().toLocaleString('en-US', { day: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }));
  const [month, setMonth] = useState(nowMonth);
  const [list, setList] = useState<BirthdayPerson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/birthdays/month?month=${month}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setList(j?.data || []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [month]);

  const vipCount = list.filter((p) => p.is_vip).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl border border-white/10 overflow-hidden max-h-[88vh] flex flex-col" style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center"><Cake className="h-5 w-5 text-amber-400" /></div>
            <div>
              <h2 className="text-base font-700 text-foreground">Sinh nhật trong tháng</h2>
              <p className="text-2xs text-muted-foreground">{list.length} người{vipCount > 0 ? ` · ${vipCount} BOD & Leader ⭐` : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>

        {/* Month switcher */}
        <div className="flex items-center justify-center gap-3 px-5 py-3 border-b border-white/5">
          <button onClick={() => setMonth((m) => (m === 1 ? 12 : m - 1))} className="btn-ghost rounded-lg p-1.5"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-600 text-foreground min-w-[80px] text-center">{MONTHS[month - 1]}</span>
          <button onClick={() => setMonth((m) => (m === 12 ? 1 : m + 1))} className="btn-ghost rounded-lg p-1.5"><ChevronRight className="h-4 w-4" /></button>
        </div>

        {/* List */}
        <div className="p-4 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <Cake className="h-9 w-9 mb-2 opacity-30" />
              <p className="text-sm">Không có sinh nhật nào trong {MONTHS[month - 1].toLowerCase()}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {list.map((p) => {
                const isToday = month === nowMonth && p.dob_day === todayDay;
                return (
                  <div key={p.id} className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${p.is_vip ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/5'} ${isToday ? 'ring-1 ring-amber-400/50' : ''}`} style={!p.is_vip ? { background: 'var(--secondary)' } : undefined}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-700 overflow-hidden shrink-0" style={{ background: p.is_vip ? 'linear-gradient(135deg,#f59e0b,#ec4899)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                      {p.avatar && p.avatar.startsWith('/') ? <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" /> : (p.name?.charAt(0).toUpperCase() ?? '?')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-600 text-foreground truncate flex items-center gap-1.5">
                        {p.name}
                        {p.is_vip && <span className="text-2xs text-amber-400 shrink-0">⭐ BOD & Leader</span>}
                        {isToday && <span className="text-2xs text-emerald-400 shrink-0">🎉 Hôm nay</span>}
                      </p>
                      <p className="text-2xs text-muted-foreground truncate">{[p.department_name, p.company_name].filter(Boolean).join(' · ')}</p>
                    </div>
                    <span className="text-sm font-700 text-amber-400 tabular-nums shrink-0">{String(p.dob_day).padStart(2, '0')}/{String(p.dob_month).padStart(2, '0')}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
