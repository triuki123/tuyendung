'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, CalendarCheck, CheckCircle2, AlertTriangle, Clock, DoorOpen, BarChart3 } from 'lucide-react';
import type { RoomAnalytics } from '@/lib/services/roomAnalyticsService';

const RANGES = [
  { label: '7 ngày', days: 7 },
  { label: '30 ngày', days: 30 },
  { label: '90 ngày', days: 90 },
];

function StatCard({ icon, value, label, tone = 'default' }: { icon: React.ReactNode; value: React.ReactNode; label: string; tone?: 'default' | 'good' | 'warn' }) {
  const color = tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : 'text-foreground';
  return (
    <div className="rounded-2xl border border-white/5 p-4" style={{ background: 'var(--card)' }}>
      <div className="flex items-center gap-2 text-muted-foreground mb-2">{icon}<span className="text-2xs uppercase tracking-wider font-600">{label}</span></div>
      <p className={`text-2xl font-700 tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

export default function RoomAnalyticsClient() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<RoomAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/room-bookings/analytics?days=${days}`)
      .then(r => r.json())
      .then(j => setData(j.success ? j.data : null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [days]);

  const peakMax = data ? Math.max(1, ...data.peakHours.map(p => p.count)) : 1;

  return (
    <div className="space-y-5 sm:space-y-6">
      <Link href="/room-bookings" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Đặt Phòng Họp
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-foreground">Hiệu Suất Phòng Họp</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Tỉ lệ nhận phòng · no-show · giờ cao điểm · theo phòng</p>
        </div>
        <div className="flex gap-1.5 rounded-xl border border-white/10 p-1" style={{ background: 'var(--card)' }}>
          {RANGES.map(r => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`px-3 py-1.5 rounded-lg text-xs font-600 transition-colors ${days === r.days ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !data ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <BarChart3 className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có dữ liệu</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
            <StatCard icon={<CalendarCheck className="h-3.5 w-3.5" />} value={data.totalBookings} label="Tổng booking" />
            <StatCard icon={<CheckCircle2 className="h-3.5 w-3.5" />} value={`${data.checkInRate}%`} label="Tỉ lệ nhận phòng" tone="good" />
            <StatCard icon={<AlertTriangle className="h-3.5 w-3.5" />} value={data.noShow} label="No-show" tone={data.noShow > 0 ? 'warn' : 'default'} />
            <StatCard icon={<Clock className="h-3.5 w-3.5" />} value={data.totalHours} label="Tổng giờ đặt" />
            <StatCard icon={<DoorOpen className="h-3.5 w-3.5" />} value={data.byRoom.length} label="Phòng có dùng" />
          </div>

          {/* Giờ cao điểm */}
          <div className="rounded-2xl border border-white/5 p-4 sm:p-5" style={{ background: 'var(--card)' }}>
            <h2 className="text-base font-600 text-foreground mb-4">Giờ cao điểm (theo giờ bắt đầu)</h2>
            {data.peakHours.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
            ) : (
              <div className="flex items-end gap-1.5 h-32">
                {data.peakHours.map(p => (
                  <div key={p.hour} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div className="w-full rounded-t bg-indigo-500/70 hover:bg-indigo-400 transition-colors" style={{ height: `${(p.count / peakMax) * 100}%` }} title={`${p.count} buổi`} />
                    <span className="text-[9px] text-muted-foreground tabular-nums">{p.hour}h</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Theo phòng */}
          <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
            <div className="px-4 sm:px-5 py-3 border-b border-white/5">
              <h2 className="text-base font-600 text-foreground">Theo phòng</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="px-4 py-2.5 text-left text-2xs font-600 uppercase tracking-wider text-muted-foreground">Phòng</th>
                    <th className="px-4 py-2.5 text-right text-2xs font-600 uppercase tracking-wider text-muted-foreground">Buổi</th>
                    <th className="px-4 py-2.5 text-right text-2xs font-600 uppercase tracking-wider text-muted-foreground">Giờ</th>
                    <th className="px-4 py-2.5 text-right text-2xs font-600 uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Nhận phòng</th>
                    <th className="px-4 py-2.5 text-right text-2xs font-600 uppercase tracking-wider text-muted-foreground">Tỉ lệ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byRoom.map(r => (
                    <tr key={r.room_name} className="border-b border-white/[0.03] last:border-0">
                      <td className="px-4 py-2.5 text-sm text-foreground">{r.room_name}</td>
                      <td className="px-4 py-2.5 text-sm text-muted-foreground text-right tabular-nums">{r.bookings}</td>
                      <td className="px-4 py-2.5 text-sm text-muted-foreground text-right tabular-nums">{r.hours}</td>
                      <td className="px-4 py-2.5 text-sm text-muted-foreground text-right tabular-nums hidden sm:table-cell">{r.checkedIn}/{r.checkedIn + r.noShow}</td>
                      <td className={`px-4 py-2.5 text-sm text-right tabular-nums font-600 ${r.checkInRate >= 70 ? 'text-emerald-400' : r.checkInRate >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{r.checkInRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
