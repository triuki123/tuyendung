'use client';

import { useEffect, useState } from 'react';
import { Loader2, BarChart3 } from 'lucide-react';
import { formatNumber } from '@/lib/format';

function currentMonth(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()).slice(0, 7);
}

/** Sản lượng tháng của công nhân (quản lý nhập, công nhân xem) */
export default function OutputView() {
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/warehouse/output?month=${month}`)
      .then((r) => r.json())
      .then((j) => setRows(j.data || []))
      .finally(() => setLoading(false));
  }, [month]);

  // Tổng theo sản phẩm
  const totals = new Map<string, { unit: string; qty: number }>();
  for (const r of rows) {
    const cur = totals.get(r.product_name) || { unit: r.unit, qty: 0 };
    cur.qty += Number(r.quantity);
    totals.set(r.product_name, cur);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-700 text-foreground">Sản lượng</h2>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-xl border border-white/10 bg-[#162033] px-3 py-2 text-xs text-foreground"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <BarChart3 className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có sản lượng trong tháng này</p>
          <p className="text-xs mt-1 opacity-60">Quản lý sẽ nhập sản lượng cuối mỗi ngày</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2.5">
            {Array.from(totals.entries()).map(([name, t]) => (
              <div key={name} className="rounded-2xl border border-white/5 p-4 flex items-center justify-between" style={{ background: 'var(--card)' }}>
                <p className="text-sm font-600 text-foreground">{name}</p>
                <p className="text-lg font-700 text-indigo-400">{formatNumber(t.qty)} <span className="text-xs text-muted-foreground font-400">{t.unit}</span></p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5" style={{ background: 'var(--card)' }}>
            {rows.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-sm text-foreground">{r.product_name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(r.work_date + 'T12:00:00').toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' })}
                  </p>
                </div>
                <p className="text-sm font-600 text-foreground">{formatNumber(Number(r.quantity))} {r.unit}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
