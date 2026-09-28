'use client';

import React, { useState } from 'react';
import { X, Plus, Minus, Trash2, Wallet, Banknote, QrCode, BookOpen } from 'lucide-react';
import { formatVND } from '@/lib/format';
import { api } from '../../quan-ly/lib/solaceApi';
import { type CartLine } from './DatMonClient';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

type Method = 'wallet' | 'bankqr' | 'cash' | 'debt';

export default function CheckoutSheet({ cart, total, onClose, onQty, onRemove, onDone }: {
  cart: CartLine[]; total: number; onClose: () => void;
  onQty: (key: string, d: number) => void; onRemove: (key: string) => void; onDone: () => void;
}) {
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose);
  const [fulfillment, setFulfillment] = useState<'counter' | 'dine_in'>('counter');
  const [floor, setFloor] = useState('');
  const [whenMode, setWhenMode] = useState<'now' | 'scheduled'>('now');
  const [pickupTime, setPickupTime] = useState('');
  const [method, setMethod] = useState<Method>('wallet');
  const [voucherCode, setVoucherCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (cart.length === 0) return;
    if (fulfillment === 'dine_in' && !floor.trim()) { setErr('Nhập tầng/vị trí khi nhận tại chỗ'); return; }
    let pickup: string | null = null;
    if (whenMode === 'scheduled') {
      if (!pickupTime) { setErr('Chọn giờ hẹn nhận'); return; }
      const [h, m] = pickupTime.split(':').map(Number);
      const d = new Date(); d.setHours(h, m, 0, 0); pickup = d.toISOString();
    }
    setBusy(true); setErr('');
    try {
      await api.post('/api/solace/my-orders', {
        fulfillment_type: fulfillment, floor_note: floor || null, pickup_time: pickup,
        payment_method: method, voucher_code: voucherCode.trim() || null,
        items: cart.map(l => ({ product_id: l.product.id, qty: l.qty, option_value_ids: l.options.map(o => o.id), note: l.note || null })),
      });
      markClean();
      onDone();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  const methods: { k: Method; label: string; icon: React.ReactNode }[] = [
    { k: 'wallet', label: 'Ví tín dụng', icon: <Wallet className="h-4 w-4" /> },
    { k: 'bankqr', label: 'Chuyển khoản (VietQR)', icon: <QrCode className="h-4 w-4" /> },
    { k: 'cash', label: 'Tiền mặt khi nhận', icon: <Banknote className="h-4 w-4" /> },
    { k: 'debt', label: 'Ghi nợ', icon: <BookOpen className="h-4 w-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={guardedClose}>
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-white/10 overflow-hidden max-h-[92vh] flex flex-col" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()} onChange={markDirty}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4 shrink-0">
          <h2 className="text-base font-700 text-foreground">Xác nhận đơn</h2>
          <button onClick={guardedClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Món */}
          <div className="space-y-2">
            {cart.map(l => (
              <div key={l.key} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{l.product.name}</p>
                  {l.options.length > 0 && <p className="text-2xs text-muted-foreground">{l.options.map(o => o.name).join(', ')}</p>}
                  {l.note && <p className="text-2xs text-muted-foreground italic">“{l.note}”</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => onQty(l.key, -1)} className="rounded-lg p-1 bg-white/5 text-foreground"><Minus className="h-3 w-3" /></button>
                  <span className="text-sm text-foreground w-5 text-center">{l.qty}</span>
                  <button onClick={() => onQty(l.key, 1)} className="rounded-lg p-1 bg-white/5 text-foreground"><Plus className="h-3 w-3" /></button>
                  <button onClick={() => onRemove(l.key)} className="text-muted-foreground hover:text-red-400 ml-1"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>

          {/* Nhận */}
          <Section label="Nhận tại">
            <div className="flex gap-2">
              {([['counter', 'Tại quầy'], ['dine_in', 'Tại chỗ']] as const).map(([t, l]) => (
                <button key={t} onClick={() => { markDirty(); setFulfillment(t); }}
                  className={`flex-1 rounded-xl px-2 py-2 text-xs border ${fulfillment === t ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground'}`}>{l}</button>
              ))}
            </div>
            {fulfillment === 'dine_in' && (
              <input value={floor} onChange={e => setFloor(e.target.value)} placeholder="Tầng / vị trí (bắt buộc)"
                className="mt-2 w-full rounded-xl px-3 py-2 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />
            )}
          </Section>

          {/* Thời gian */}
          <Section label="Thời gian nhận">
            <div className="flex gap-2">
              {([['now', 'Nhận ngay'], ['scheduled', 'Hẹn giờ']] as const).map(([t, l]) => (
                <button key={t} onClick={() => { markDirty(); setWhenMode(t); }}
                  className={`flex-1 rounded-xl px-2 py-2 text-xs border ${whenMode === t ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground'}`}>{l}</button>
              ))}
            </div>
            {whenMode === 'scheduled' && (
              <input type="time" value={pickupTime} onChange={e => setPickupTime(e.target.value)}
                className="mt-2 w-full rounded-xl px-3 py-2 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />
            )}
          </Section>

          {/* Thanh toán */}
          <Section label="Thanh toán">
            <div className="grid grid-cols-2 gap-2">
              {methods.map(m => (
                <button key={m.k} onClick={() => { markDirty(); setMethod(m.k); }}
                  className={`flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs border ${method === m.k ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground'}`}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
            <p className="text-2xs text-muted-foreground mt-1.5">
              {method === 'wallet' && 'Trừ ngay vào ví tín dụng của bạn.'}
              {method === 'bankqr' && 'Sau khi đặt, mở "Đơn của tôi" để quét mã chuyển khoản.'}
              {method === 'cash' && 'Trả tiền mặt khi tới nhận; nhân viên xác nhận.'}
              {method === 'debt' && 'Ghi nợ trong hạn mức; thanh toán sau.'}
            </p>
          </Section>

          {/* Mã giảm giá / quà tặng */}
          <Section label="Mã giảm giá / quà tặng">
            <input value={voucherCode} onChange={e => setVoucherCode(e.target.value.toUpperCase())} placeholder="Nhập mã (nếu có)"
              className="w-full rounded-xl px-3 py-2 text-sm text-foreground border border-white/10 uppercase" style={{ background: '#162033' }} />
            <p className="text-2xs text-muted-foreground mt-1">Có mã quà từ minigame? Nhập tại đây để được giảm/miễn phí món.</p>
          </Section>

          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/5 px-6 py-4 shrink-0"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <div>
            <p className="text-2xs text-muted-foreground">Tổng cộng</p>
            <p className="text-lg font-700 text-foreground">{formatVND(total)}</p>
          </div>
          <button disabled={busy} onClick={submit}
            className="flex-1 rounded-xl px-4 py-3 text-sm font-600 bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">
            {busy ? 'Đang đặt…' : 'Đặt món'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
      {children}
    </div>
  );
}
