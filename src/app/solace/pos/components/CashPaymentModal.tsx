'use client';

import React, { useState } from 'react';
import { X, Banknote } from 'lucide-react';
import { formatVND, parseVND } from '@/lib/format';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { POS_MODAL_Z } from './modalLayers';

/** Modal thu tiền mặt: nhập tiền khách đưa → hiện tiền thối. */
export default function CashPaymentModal({ total, busy, onConfirm, onClose }: {
  total: number; busy?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  useEscapeKey(onClose, !busy);
  const [tendered, setTendered] = useState('');
  const got = tendered ? parseVND(tendered) : 0;
  const change = got - total;
  // Gợi ý mệnh giá thường dùng
  const quick = [total, Math.ceil(total / 10000) * 10000, Math.ceil(total / 50000) * 50000, 100000, 200000, 500000]
    .filter((v, i, a) => v >= total && a.indexOf(v) === i).slice(0, 4);

  return (
    <div className={`fixed inset-0 ${POS_MODAL_Z.picker} flex items-center justify-center p-4`} style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={() => { if (!busy) onClose(); }}>
      <div className="w-full max-w-sm rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-base font-700 text-foreground flex items-center gap-2"><Banknote className="h-4 w-4 text-emerald-400" /> Thu tiền mặt</h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Cần thu</span>
            <span className="text-lg font-700 text-foreground">{formatVND(total)}</span>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Tiền khách đưa</label>
            <input autoFocus value={tendered} onChange={e => setTendered(e.target.value)} inputMode="numeric" placeholder="0"
              className="w-full rounded-xl px-3 py-2.5 text-lg text-foreground border border-white/10 text-right" style={{ background: '#162033' }} />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {quick.map(v => (
                <button key={v} onClick={() => setTendered(String(v))}
                  className="rounded-lg px-2.5 py-1 text-xs border border-white/10 text-muted-foreground hover:text-foreground">{formatVND(v)}</button>
              ))}
            </div>
          </div>
          {got > 0 && (
            <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
              <span className="text-sm text-muted-foreground">Tiền thối</span>
              <span className={`text-lg font-700 ${change < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {change < 0 ? `Thiếu ${formatVND(-change)}` : formatVND(change)}
              </span>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button disabled={busy} onClick={onConfirm}
            className="rounded-xl px-4 py-2 text-sm font-600 bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50">
            {busy ? 'Đang xử lý…' : 'Xác nhận thu'}
          </button>
        </div>
      </div>
    </div>
  );
}
