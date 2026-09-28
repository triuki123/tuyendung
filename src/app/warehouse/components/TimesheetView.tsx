'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, CalendarDays, Package } from 'lucide-react';

function currentMonth(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()).slice(0, 7);
}

/**
 * Bảng công tháng của công nhân — nhóm theo NGÀY, mỗi ngày liệt kê các ĐỢT
 * (kho chế độ flex có nhiều đợt/ngày), kèm sản lượng gắn với từng đợt.
 * Giờ tự khai chưa duyệt / bị từ chối KHÔNG tính vào tổng.
 */
export default function TimesheetView() {
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/warehouse/attendance?month=${month}`)
      .then((r) => r.json())
      .then((j) => setRows(j.data || []))
      .finally(() => setLoading(false));
  }, [month]);

  const fmtTime = (ts: string | null) =>
    ts ? new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) : '—';

  /** Giờ của 1 đợt — null nếu chưa đóng; đợt tự khai pending/rejected không tính vào tổng */
  const sessionHours = (r: any): number | null => {
    if (!r.check_in_at || !r.check_out_at) return null;
    return (new Date(r.check_out_at).getTime() - new Date(r.check_in_at).getTime()) / 3600000;
  };
  const countsTowardTotal = (r: any) =>
    r.check_out_at && r.declared_status !== 'pending' && r.declared_status !== 'rejected';

  // Nhóm theo ngày, giữ thứ tự đợt
  const days = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const r of rows) {
      const d = String(r.work_date).slice(0, 10);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(r);
    }
    return Array.from(map.entries()).map(([date, sessions]) => ({
      date,
      sessions,
      dayHours: sessions.reduce((s, r) => s + (countsTowardTotal(r) ? (sessionHours(r) ?? 0) : 0), 0),
    }));
  }, [rows]);

  const totalDays = days.filter((d) => d.sessions.some((r) => r.check_in_at)).length;
  const totalHours = days.reduce((s, d) => s + d.dayHours, 0).toFixed(1);

  const statusBadge = (r: any) => {
    if (!r.check_out_at) return <span className="text-orange-400">Chưa check-out</span>;
    if (r.declared_status === 'pending') return <span className="text-amber-400">tự khai · chờ duyệt</span>;
    if (r.declared_status === 'rejected') return <span className="text-red-400">bị từ chối</span>;
    return <span>{(sessionHours(r) ?? 0).toFixed(1)} giờ</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-700 text-foreground">Bảng công</h2>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-xl border border-white/10 bg-[#162033] px-3 py-2 text-xs text-foreground"
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl border border-white/5 p-3 text-center" style={{ background: 'var(--card)' }}>
          <p className="text-[11px] text-muted-foreground">Ngày công</p>
          <p className="text-xl font-700 text-indigo-400">{totalDays}</p>
        </div>
        <div className="rounded-2xl border border-white/5 p-3 text-center" style={{ background: 'var(--card)' }}>
          <p className="text-[11px] text-muted-foreground">Tổng giờ (đã duyệt)</p>
          <p className="text-xl font-700 text-indigo-400">{totalHours}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : days.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <CalendarDays className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có ngày công trong tháng này</p>
        </div>
      ) : (
        <div className="space-y-3">
          {days.map((d) => (
            <div key={d.date} className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
              <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
                <p className="text-sm font-600 text-foreground">
                  {new Date(d.date + 'T12:00:00').toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric' })}
                </p>
                <p className="text-xs font-600 text-indigo-400">{d.dayHours.toFixed(1)} giờ</p>
              </div>
              <div className="divide-y divide-white/5">
                {d.sessions.map((r) => (
                  <div key={r.id} className="px-4 py-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {d.sessions.length > 1 || r.session_no > 1 ? `Đợt ${r.session_no}` : (r.shift_name || 'Ca')}
                      </p>
                      <p className="text-sm text-foreground">{fmtTime(r.check_in_at)} → {fmtTime(r.check_out_at)}</p>
                      <p className="text-[11px] text-muted-foreground">{statusBadge(r)}</p>
                    </div>
                    {Array.isArray(r.outputs) && r.outputs.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {r.outputs.map((o: any, i: number) => (
                          <span key={i} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                            o.status === 'pending'
                              ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
                              : 'border-white/10 bg-white/5 text-muted-foreground'
                          }`}>
                            <Package className="h-3 w-3" />
                            {o.product_name}: {Number(o.quantity)} {o.unit}
                            {o.status === 'pending' && ' · chờ duyệt'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
