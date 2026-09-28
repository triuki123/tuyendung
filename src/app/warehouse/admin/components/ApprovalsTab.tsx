'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, CheckSquare, Check, X } from 'lucide-react';
import { formatVND } from '@/lib/format';

/** Duyệt đơn xin nghỉ + ứng lương */
export default function ApprovalsTab({ warehouseId }: { warehouseId: string }) {
  const [data, setData] = useState<{ leaves: any[]; advances: any[] }>({ leaves: [], advances: [] });
  const [advanceEnabled, setAdvanceEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/warehouse/admin/requests?warehouseId=${warehouseId}`);
      const json = await res.json();
      setData(json.data || { leaves: [], advances: [] });
      setAdvanceEnabled(!!json.advance_enabled);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => { load(); }, [load]);

  const decide = async (kind: 'leave' | 'advance', id: string, approve: boolean) => {
    setBusyId(id);
    try {
      await fetch('/api/warehouse/admin/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouseId, kind, id, approve }),
      });
      load();
    } finally {
      setBusyId('');
    }
  };

  const Badge = ({ status }: { status: string }) => {
    if (status === 'approved') return <span className="rounded-full px-2 py-0.5 text-[10px] font-600 text-emerald-400 bg-emerald-500/10">Đã duyệt</span>;
    if (status === 'rejected') return <span className="rounded-full px-2 py-0.5 text-[10px] font-600 text-red-400 bg-red-500/10">Từ chối</span>;
    return <span className="rounded-full px-2 py-0.5 text-[10px] font-600 text-orange-400 bg-orange-500/10">Chờ duyệt</span>;
  };

  const Actions = ({ kind, r }: { kind: 'leave' | 'advance'; r: any }) =>
    r.status !== 'pending' ? <Badge status={r.status} /> : busyId === r.id ? (
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    ) : (
      <div className="flex gap-1.5">
        <button onClick={() => decide(kind, r.id, true)} className="rounded-lg bg-emerald-600/20 p-2" title="Duyệt">
          <Check className="h-4 w-4 text-emerald-400" />
        </button>
        <button onClick={() => decide(kind, r.id, false)} className="rounded-lg bg-red-600/20 p-2" title="Từ chối">
          <X className="h-4 w-4 text-red-400" />
        </button>
      </div>
    );

  const pendingCount = data.leaves.filter((r) => r.status === 'pending').length + data.advances.filter((r) => r.status === 'pending').length;

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-700 text-foreground">Duyệt yêu cầu</h2>
        <p className="text-xs text-muted-foreground">{pendingCount} yêu cầu chờ duyệt</p>
      </div>

      {data.leaves.length === 0 && data.advances.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <CheckSquare className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có yêu cầu nào</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
            <p className="px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wider border-b border-white/5">Đơn xin nghỉ</p>
            <div className="divide-y divide-white/5">
              {data.leaves.length === 0 && <p className="px-4 py-6 text-xs text-muted-foreground text-center">Không có đơn</p>}
              {data.leaves.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-600 text-foreground">{r.full_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(r.from_date + 'T12:00:00').toLocaleDateString('vi-VN')}
                      {r.to_date !== r.from_date && ` → ${new Date(r.to_date + 'T12:00:00').toLocaleDateString('vi-VN')}`}
                      {r.reason && ` · ${r.reason}`}
                    </p>
                  </div>
                  <Actions kind="leave" r={r} />
                </div>
              ))}
            </div>
          </div>

          {(advanceEnabled || data.advances.length > 0) && (
          <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
            <p className="px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wider border-b border-white/5">
              Ứng lương{!advanceEnabled && <span className="ml-2 normal-case text-orange-400/80">(đã tắt — chỉ hiện lịch sử)</span>}
            </p>
            <div className="divide-y divide-white/5">
              {data.advances.length === 0 && <p className="px-4 py-6 text-xs text-muted-foreground text-center">Không có đơn</p>}
              {data.advances.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-600 text-foreground">{r.full_name} — <span className="text-indigo-400">{formatVND(Number(r.amount))}</span></p>
                    {r.reason && <p className="text-[11px] text-muted-foreground">{r.reason}</p>}
                  </div>
                  <Actions kind="advance" r={r} />
                </div>
              ))}
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
