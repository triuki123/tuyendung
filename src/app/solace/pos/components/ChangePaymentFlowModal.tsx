'use client';

import React, { useState } from 'react';
import { X, Banknote, Landmark, Wallet, NotebookPen, Loader2, Check } from 'lucide-react';
import { formatVND } from '@/lib/format';
import { api } from '../../quan-ly/lib/solaceApi';
import type { SolaceOrder } from '@/lib/services/solaceOrderService';
import { useConfirm } from '@/context/ConfirmContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import CashPaymentModal from './CashPaymentModal';
import { POS_MODAL_Z } from './modalLayers';

type Form = 'cash' | 'bankqr' | 'wallet' | 'debt';

const OPTS: { key: Form; label: string; icon: React.ReactNode }[] = [
  { key: 'cash', label: 'Tiền mặt', icon: <Banknote className="h-4 w-4" /> },
  { key: 'bankqr', label: 'Chuyển khoản', icon: <Landmark className="h-4 w-4" /> },
  { key: 'wallet', label: 'Ví tín dụng', icon: <Wallet className="h-4 w-4" /> },
  { key: 'debt', label: 'Ghi nợ / thu sau', icon: <NotebookPen className="h-4 w-4" /> },
];

const labelOf = (k: Form | 'unpaid') =>
  k === 'unpaid' ? 'Chưa thu' : OPTS.find(o => o.key === k)?.label ?? k;

export default function ChangePaymentFlowModal({ order, onClose, onDone }: {
  order: SolaceOrder; onClose: () => void; onDone: () => void;
}) {
  const confirm = useConfirm();
  const [showCashCollect, setShowCashCollect] = useState(false);
  const [busy, setBusy] = useState<Form | null>(null);
  const [err, setErr] = useState('');
  useEscapeKey(onClose, !showCashCollect);

  const current: Form | 'unpaid' = order.payment_status === 'paid' && order.payment_method !== 'mixed'
    ? (order.payment_method as Form)
    : (order.payment_status === 'debt' ? 'debt' : 'unpaid');
  const hasMember = !!order.customer_user_id;

  const submitChange = async (target: Form) => {
    setBusy(target);
    setErr('');
    try {
      await api.post(`/api/solace/orders/${order.id}/change-payment`, { method: target });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Lỗi');
      setBusy(null);
    }
  };

  const change = async (target: Form) => {
    if (target === current) return;
    if (target === 'wallet' && !hasMember) {
      setErr('Đơn chưa gắn thành viên nên không thể chuyển sang ví tín dụng.');
      return;
    }
    if (target === 'cash' && order.payment_status !== 'paid') {
      setErr('');
      setShowCashCollect(true);
      return;
    }

    let msg: string;
    if (target === 'debt') {
      msg = order.payment_status === 'paid'
        ? 'Chuyển đơn về chưa thu và hoàn lại khoản đã ghi nhận trong sổ quỹ hoặc ví?'
        : 'Đánh dấu đơn này là ghi nợ để khách thanh toán sau?';
    } else if (order.payment_status === 'paid') {
      msg = `Đổi hình thức đã thu sang "${labelOf(target)}"? Sổ quỹ hoặc ví sẽ tự điều chỉnh.`;
    } else {
      msg = `Xác nhận thu ${formatVND(order.total)} bằng "${labelOf(target)}"?`;
    }

    if (!(await confirm({
      title: 'Đổi thanh toán?',
      message: msg,
      confirmLabel: 'Xác nhận',
      danger: target === 'debt',
    }))) return;

    await submitChange(target);
  };

  return (
    <>
      <div
        className={`fixed inset-0 ${POS_MODAL_Z.detail} flex items-end sm:items-center justify-center sm:p-4`}
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      >
        <div
          className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl border border-white/10 overflow-hidden"
          style={{ background: 'var(--card)' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-3.5">
            <h2 className="text-base font-700 text-foreground">Đổi hình thức thanh toán</h2>
            <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
          </div>

          <div className="p-5 space-y-3" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Đơn {order.code} · {formatVND(order.total)}</span>
              <span className="text-2xs px-2 py-0.5 rounded-full border border-white/10 text-foreground">Hiện tại: {labelOf(current)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {OPTS.map(opt => {
                const isCurrent = opt.key === current;
                const disabled = isCurrent || (opt.key === 'wallet' && !hasMember) || busy !== null;
                return (
                  <button
                    key={opt.key}
                    onClick={() => change(opt.key)}
                    disabled={disabled}
                    className={`relative flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-600 border transition-colors
                      ${isCurrent ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300'
                        : disabled ? 'border-white/10 text-muted-foreground/40 cursor-not-allowed'
                        : 'border-white/10 text-foreground hover:border-indigo-500/40 hover:bg-white/5'}`}
                  >
                    {busy === opt.key ? <Loader2 className="h-4 w-4 animate-spin" /> : opt.icon}
                    <span className="truncate">{opt.label}</span>
                    {isCurrent && <Check className="h-3.5 w-3.5 ml-auto text-indigo-400" />}
                  </button>
                );
              })}
            </div>

            {!hasMember && <p className="text-2xs text-muted-foreground">Ví tín dụng cần đơn đã gắn thành viên.</p>}
            {err && <p className="text-xs text-red-400">{err}</p>}
            <p className="text-2xs text-muted-foreground">
              Đổi hình thức cho đơn đã thu sẽ tự điều chỉnh sổ quỹ và ví tương ứng để số liệu không bị lệch.
            </p>
          </div>
        </div>
      </div>

      {showCashCollect && (
        <CashPaymentModal
          total={order.total}
          busy={busy === 'cash'}
          onConfirm={() => void submitChange('cash')}
          onClose={() => { if (busy !== 'cash') setShowCashCollect(false); }}
        />
      )}
    </>
  );
}
