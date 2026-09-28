'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Trophy, Download } from 'lucide-react';

type RangeKey = 'month' | 'quarter' | 'year';

function vnDate(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
}

function rangeFor(key: RangeKey): { from: string; to: string; label: string } {
  const now = vnDate();
  const y = now.getFullYear();
  const m = now.getMonth();
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (key === 'month') {
    return { from: fmt(new Date(y, m, 1)), to: fmt(new Date(y, m + 1, 0)), label: `Tháng ${m + 1}/${y}` };
  }
  if (key === 'quarter') {
    const q = Math.floor(m / 3);
    return { from: fmt(new Date(y, q * 3, 1)), to: fmt(new Date(y, q * 3 + 3, 0)), label: `Quý ${q + 1}/${y}` };
  }
  return { from: `${y}-01-01`, to: `${y}-12-31`, label: `Năm ${y}` };
}

const MEDALS = ['🥇', '🥈', '🥉'];

/** Xếp hạng công nhân theo sản lượng + chuyên cần (tháng/quý/năm) — nguồn khen thưởng */
export default function RankingTab({ warehouseId, warehouseName }: { warehouseId: string; warehouseName: string }) {
  const [range, setRange] = useState<RangeKey>('month');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = rangeFor(range);
    try {
      const res = await fetch(`/api/warehouse/admin/ranking?warehouseId=${warehouseId}&from=${from}&to=${to}`);
      const json = await res.json();
      setRows(json.data || []);
    } finally {
      setLoading(false);
    }
  }, [warehouseId, range]);

  useEffect(() => { load(); }, [load]);

  const exportExcel = async () => {
    const XLSX = await import('xlsx-js-style');
    const { label } = rangeFor(range);
    const ws = XLSX.utils.json_to_sheet(rows.map((r, i) => ({
      'Hạng': i + 1,
      'Họ tên': r.full_name,
      'Trạng thái': r.status === 'active' ? 'Đang làm' : 'Đã nghỉ',
      'Ngày công': Number(r.days_worked),
      'Tổng giờ': Number(r.total_hours),
      'Tổng sản lượng': Number(r.total_qty),
      'Chi tiết': (r.by_product || []).map((p: any) => `${p.product}: ${p.qty} ${p.unit}`).join('; '),
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Xếp Hạng');
    XLSX.writeFile(wb, `xep-hang-${warehouseName.replace(/\s+/g, '-')}-${label.replace(/[\s/]/g, '-')}.xlsx`);
  };

  const { label } = rangeFor(range);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-700 text-foreground">Xếp hạng — {label}</h2>
          <p className="text-xs text-muted-foreground">Theo sản lượng, tham khảo chuyên cần để khen thưởng</p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-xl border border-white/10 overflow-hidden">
            {(['month', 'quarter', 'year'] as RangeKey[]).map((k) => (
              <button key={k} onClick={() => setRange(k)}
                className={`px-3 py-2 text-xs font-600 ${range === k ? 'bg-indigo-600 text-white' : 'text-muted-foreground'}`}>
                {k === 'month' ? 'Tháng' : k === 'quarter' ? 'Quý' : 'Năm'}
              </button>
            ))}
          </div>
          <button onClick={exportExcel} disabled={rows.length === 0}
            className="rounded-xl border border-white/10 px-3 py-2 text-xs font-600 text-foreground flex items-center gap-1.5 disabled:opacity-40">
            <Download className="h-3.5 w-3.5" /> Excel
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <Trophy className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có dữ liệu trong kỳ này</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5" style={{ background: 'var(--card)' }}>
          {rows.map((r, i) => (
            <div key={r.worker_id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-8 text-center text-lg">{MEDALS[i] || <span className="text-xs text-muted-foreground">#{i + 1}</span>}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-600 ${r.status === 'active' ? 'text-foreground' : 'text-muted-foreground'}`}>{r.full_name}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {Number(r.days_worked)} công · {Number(r.total_hours)}h
                  {(r.by_product || []).length > 0 && ' · ' + r.by_product.map((p: any) => `${p.product}: ${Number(p.qty).toLocaleString('vi-VN')} ${p.unit}`).join(' · ')}
                </p>
              </div>
              <p className="text-base font-700 text-indigo-400">{Number(r.total_qty).toLocaleString('vi-VN')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
