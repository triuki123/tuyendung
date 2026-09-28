'use client';

import React, { useEffect, useState } from 'react';
import { X, Loader2, ClipboardCheck } from 'lucide-react';
import { formatVND, parseVND } from '@/lib/format';
import MoneyInput from '@/components/ui/MoneyInput';
import { api } from '../../quan-ly/lib/solaceApi';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { POS_MODAL_Z } from './modalLayers';

interface Summary { total_orders: number; total_revenue: number; cash_total: number; bankqr_total: number; wallet_total: number; unpaid_total: number; }
interface Closed extends Summary { cash_counted: number | null; variance: number; created_at: string; note: string | null; }
interface ActiveShift { id: string; shift_label?: string | null; opened_by_name?: string | null; opened_at: string; opening_float: number; }

export default function ShiftCloseModal({ onClose }: { onClose: () => void }) {
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose);
  const [businessDate, setBusinessDate] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [closed, setClosed] = useState<Closed | null>(null);
  const [shift, setShift] = useState<ActiveShift | null>(null);
  const [shiftLive, setShiftLive] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [cashCounted, setCashCounted] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ orders: number; revenue: number; variance: number | null; hasCount: boolean } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get<{ data: { businessDate: string; summary: Summary; closed: Closed | null; activeShift: ActiveShift | null; shiftLive: Summary | null } }>('/api/solace/shift-close');
      setBusinessDate(r.data.businessDate); setSummary(r.data.summary); setClosed(r.data.closed);
      setShift(r.data.activeShift); setShiftLive(r.data.shiftLive);
      if (r.data.closed?.cash_counted != null) setCashCounted(String(r.data.closed.cash_counted));
      if (r.data.closed?.note) setNote(r.data.closed.note);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Khi có phiên ca đang mở: đối soát theo CA (quỹ đầu + tiền mặt bán trong ca).
  const view = shift && shiftLive ? shiftLive : summary;
  const openingFloat = shift?.opening_float ?? 0;
  const expectedCash = view ? openingFloat + view.cash_total : 0;
  const counted = cashCounted ? parseVND(cashCounted) : null;
  const variance = counted != null && view ? counted - (shift ? expectedCash : view.cash_total) : null;

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      await api.post('/api/solace/shift-close', {
        cashCounted: cashCounted ? parseVND(cashCounted) : null, note: note || null,
      });
      markClean();
      setDone({ orders: view?.total_orders ?? 0, revenue: view?.total_revenue ?? 0, variance, hasCount: counted != null });
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <div className={`fixed inset-0 ${POS_MODAL_Z.base} flex items-center justify-center p-4`} style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={guardedClose}>
      <div className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden max-h-[90vh] flex flex-col" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()} onChange={markDirty}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4 shrink-0">
          <h2 className="text-base font-700 text-foreground flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-amber-400" /> Kết ca {businessDate && `· ${businessDate}`}</h2>
          <button onClick={guardedClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : done ? (
            <div className="text-center py-4">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-sm font-600 text-foreground">{shift ? 'Đã kết phiên ca' : 'Đã kết ca'} {businessDate}</p>
              <p className="text-xs text-muted-foreground mt-1">{done.orders} đơn · thu {formatVND(done.revenue)}</p>
              {done.hasCount && done.variance != null && (
                <p className={`text-xs mt-1 ${done.variance === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  Chênh lệch quỹ: {formatVND(done.variance)}
                </p>
              )}
              <p className="text-2xs text-muted-foreground mt-2">Đã gửi thông báo tới người nhận cấu hình (nếu có).</p>
            </div>
          ) : view && (
            <>
              {shift ? (
                <p className="text-2xs text-emerald-400">{shift.shift_label || 'Phiên ca'} đang mở{shift.opened_by_name ? ` · ${shift.opened_by_name}` : ''} — từ {new Date(shift.opened_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}. Kết ca sẽ chốt phiên này.</p>
              ) : closed && (
                <p className="text-2xs text-amber-400">Ca này đã kết lúc {new Date(closed.created_at).toLocaleString('vi-VN')} — kết lại sẽ cập nhật số liệu.</p>
              )}
              <div className="rounded-xl bg-white/5 p-3 space-y-1.5">
                <Row label="Số đơn" value={String(view.total_orders)} />
                <Row label="Doanh thu đã thu" value={formatVND(view.total_revenue)} strong />
                <div className="border-t border-white/10 my-1" />
                {shift && <Row label="Quỹ đầu ca" value={formatVND(openingFloat)} />}
                <Row label="Tiền mặt bán" value={formatVND(view.cash_total)} />
                <Row label="Chuyển khoản" value={formatVND(view.bankqr_total)} />
                <Row label="Ví tín dụng" value={formatVND(view.wallet_total)} />
                <Row label="Còn nợ / chưa thu" value={formatVND(view.unpaid_total)} amber />
                {shift && (<><div className="border-t border-white/10 my-1" /><Row label="Tiền mặt phải có trong két" value={formatVND(expectedCash)} strong /></>)}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Tiền mặt đếm thực tế (tuỳ chọn)</label>
                <MoneyInput value={cashCounted} onValueChange={(n) => setCashCounted(n ? String(n) : '')} placeholder="Nhập số tiền đếm được"
                  className="w-full rounded-xl px-3 py-2 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />
                {variance != null && (
                  <p className={`text-xs ${variance === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    Chênh lệch so với {shift ? 'tiền phải có' : 'tiền mặt hệ thống'}: {formatVND(variance)}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Ghi chú</label>
                <input value={note} onChange={e => setNote(e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />
              </div>
              {err && <p className="text-xs text-red-400">{err}</p>}
            </>
          )}
        </div>

        {!done && !loading && (
          <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4 shrink-0">
            <button onClick={guardedClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Đóng</button>
            <button disabled={busy} onClick={submit} className="rounded-xl px-4 py-2 text-sm font-600 bg-amber-500 text-white hover:bg-amber-400 disabled:opacity-50">
              {busy ? 'Đang kết ca…' : (closed ? 'Kết lại ca' : 'Kết ca & gửi thông báo')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, strong, amber }: { label: string; value: string; strong?: boolean; amber?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm ${strong ? 'font-700 text-foreground' : amber ? 'text-amber-400' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}
