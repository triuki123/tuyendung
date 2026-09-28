'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, FileText, Plus, X } from 'lucide-react';
import { formatVND } from '@/lib/format';
import MoneyInput from '@/components/ui/MoneyInput';

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  pending: { text: 'Chờ duyệt', cls: 'text-orange-400 bg-orange-500/10' },
  approved: { text: 'Đã duyệt', cls: 'text-emerald-400 bg-emerald-500/10' },
  rejected: { text: 'Từ chối', cls: 'text-red-400 bg-red-500/10' },
};

/** Đơn xin nghỉ + ứng lương của công nhân (ứng lương ẩn khi kho chưa bật) */
export default function RequestsView({ advanceEnabled }: { advanceEnabled: boolean }) {
  const [data, setData] = useState<{ leaves: any[]; advances: any[] }>({ leaves: [], advances: [] });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | 'leave' | 'advance'>(null);

  const load = useCallback(() => {
    fetch('/api/warehouse/requests')
      .then((r) => r.json())
      .then((j) => setData(j.data || { leaves: [], advances: [] }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const Badge = ({ status }: { status: string }) => {
    const s = STATUS_LABEL[status] || STATUS_LABEL.pending;
    return <span className={`rounded-full px-2 py-0.5 text-[10px] font-600 ${s.cls}`}>{s.text}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-700 text-foreground">Yêu cầu</h2>
        <div className="flex gap-2">
          <button onClick={() => setModal('leave')} className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-600 text-white flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Xin nghỉ
          </button>
          {advanceEnabled && (
            <button onClick={() => setModal('advance')} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-600 text-foreground flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Ứng lương
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : data.leaves.length === 0 && data.advances.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <FileText className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có yêu cầu nào</p>
          <p className="text-xs mt-1 opacity-60">Xin nghỉ trước để được tính &quot;nghỉ có báo&quot;</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.leaves.length > 0 && (
            <div className="rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5" style={{ background: 'var(--card)' }}>
              <p className="px-4 py-2.5 text-xs font-600 text-muted-foreground uppercase tracking-wider">Đơn xin nghỉ</p>
              {data.leaves.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm text-foreground">
                      {new Date(r.from_date + 'T12:00:00').toLocaleDateString('vi-VN')}
                      {r.to_date !== r.from_date && ` → ${new Date(r.to_date + 'T12:00:00').toLocaleDateString('vi-VN')}`}
                    </p>
                    {r.reason && <p className="text-[11px] text-muted-foreground">{r.reason}</p>}
                  </div>
                  <Badge status={r.status} />
                </div>
              ))}
            </div>
          )}
          {(advanceEnabled || data.advances.length > 0) && data.advances.length > 0 && (
            <div className="rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5" style={{ background: 'var(--card)' }}>
              <p className="px-4 py-2.5 text-xs font-600 text-muted-foreground uppercase tracking-wider">Ứng lương</p>
              {data.advances.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-600 text-foreground">{formatVND(Number(r.amount))}</p>
                    {r.reason && <p className="text-[11px] text-muted-foreground">{r.reason}</p>}
                  </div>
                  <Badge status={r.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {modal && <RequestModal kind={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </div>
  );
}

function RequestModal({ kind, onClose, onSaved }: { kind: 'leave' | 'advance'; onClose: () => void; onSaved: () => void }) {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const body = kind === 'leave'
        ? { kind, from_date: fromDate, to_date: toDate || fromDate, reason }
        : { kind, amount, reason };
      const res = await fetch('/api/warehouse/requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Gửi thất bại'); return; }
      onSaved();
    } catch {
      setError('Lỗi kết nối');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-base font-700 text-foreground">{kind === 'leave' ? 'Xin nghỉ' : 'Xin ứng lương'}</h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          {kind === 'leave' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Từ ngày</label>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2.5 text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Đến ngày</label>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2.5 text-sm text-foreground" />
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Số tiền muốn ứng</label>
              <MoneyInput
                value={amount}
                onValueChange={(n) => setAmount(n)}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2.5 text-sm text-foreground"
                placeholder="VD: 1.000.000"
              />
            </div>
          )}
          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Lý do</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2.5 text-sm text-foreground resize-none" />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button onClick={submit} disabled={busy || (kind === 'leave' ? !fromDate : !amount)}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white disabled:opacity-50 flex items-center gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Gửi
          </button>
        </div>
      </div>
    </div>
  );
}
