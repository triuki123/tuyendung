'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Printer, X, QrCode, ArrowLeftRight, Pencil, History, ChevronDown } from 'lucide-react';
import { formatVND } from '@/lib/format';
import { api } from '../../quan-ly/lib/solaceApi';
import { printInvoice } from '../lib/printInvoice';
import VietQrModal from './VietQrModal';
import ChangePaymentFlowModal from './ChangePaymentFlowModal';
import EditOrderModal from './EditOrderModal';
import type { SolaceOrder } from '@/lib/services/solaceOrderService';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { POS_MODAL_Z } from './modalLayers';

const ACTIVE_STATUSES = new Set(['pending', 'preparing', 'ready', 'delivering']);

const STATUS_LABEL: Record<string, string> = { pending: 'Chờ pha', preparing: 'Đang pha', ready: 'Sẵn sàng', delivering: 'Đang giao', done: 'Hoàn tất', cancelled: 'Đã huỷ' };
const STATUS_CLS: Record<string, string> = {
  pending: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  preparing: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  ready: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  delivering: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  done: 'text-muted-foreground bg-white/5 border-white/10',
  cancelled: 'text-red-400 bg-red-500/10 border-red-500/20',
};
const PAY_LABEL: Record<string, string> = { cash: 'Tiền mặt', wallet: 'Ví', bankqr: 'Chuyển khoản', mixed: 'Hỗn hợp' };
const PAYSTATUS_LABEL: Record<string, string> = { paid: 'Đã thu', partial: 'Thu một phần', debt: 'Ghi nợ', unpaid: 'Chưa thu' };

/** Modal chi tiết 1 đơn Solace (dùng chung Hàng đợi + Lịch sử đơn). */
export default function OrderDetailModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged?: () => void }) {
  const [o, setO] = useState<SolaceOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [showQr, setShowQr] = useState(false);
  const [showChangePay, setShowChangePay] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  useEscapeKey(onClose, !showQr && !showChangePay && !showEdit);
  const loadOrder = async () => {
    try { const r = await api.get<{ data: SolaceOrder }>(`/api/solace/orders/${id}`); setO(r.data); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadOrder(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const fulfillment = o ? (o.fulfillment_type === 'dine_in' ? `Tại chỗ${o.floor_note ? ' · ' + o.floor_note : ''}`
    : o.fulfillment_type === 'delivery' ? `Giao${o.floor_note ? ' · ' + o.floor_note : ''}` : 'Tại quầy') : '';
  const due = o ? Math.max(0, Number(o.total) - Number(o.paid_amount ?? 0)) : 0;

  return (
    <div className={`fixed inset-0 ${POS_MODAL_Z.base} flex items-end sm:items-center justify-center sm:p-4`} style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={() => { if (!showQr && !showChangePay && !showEdit) onClose(); }}>
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-white/10 overflow-hidden max-h-[88vh] flex flex-col" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-3.5 shrink-0">
          <h2 className="text-base font-700 text-foreground">{loading ? 'Đang tải…' : `Đơn ${o?.code ?? ''}`}</h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-3" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
          {loading || !o ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{new Date(o.created_at).toLocaleString('vi-VN')}</span>
                <span className={`font-600 px-2 py-0.5 rounded-full border ${STATUS_CLS[o.status] ?? ''}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
              </div>
              <div className="text-xs text-muted-foreground">Nhận: <span className="text-foreground">{fulfillment}</span>{o.customer_name ? <> · Khách: <span className="text-foreground">{o.customer_name}</span></> : ''}</div>

              <div className="space-y-1.5 border-t border-white/5 pt-3">
                {(o.items ?? []).map(it => (
                  <div key={it.id} className="flex justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <span className="text-foreground">{it.qty}× {it.name_snapshot}</span>
                      {Array.isArray(it.options_json) && it.options_json.length > 0 &&
                        <span className="text-2xs text-muted-foreground"> ({(it.options_json as Array<{ name: string }>).map(x => x.name).join(', ')})</span>}
                      {it.note && <p className="text-2xs text-muted-foreground italic">“{it.note}”</p>}
                    </div>
                    <span className="text-foreground shrink-0">{formatVND(it.line_total)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 border-t border-white/5 pt-3 text-sm">
                <Row label="Tạm tính" value={formatVND(o.subtotal)} muted />
                {Number(o.discount) > 0 && <Row label={`Giảm giá${o.voucher_code ? ` (${o.voucher_code})` : ''}`} value={'− ' + formatVND(o.discount)} muted />}
                {Number(o.delivery_fee) > 0 && <Row label="Phí giao" value={formatVND(o.delivery_fee)} muted />}
                <Row label="Tổng cộng" value={formatVND(o.total)} strong />
                <Row label="Thanh toán" value={`${PAY_LABEL[o.payment_method ?? ''] ?? '—'} · ${PAYSTATUS_LABEL[o.payment_status] ?? o.payment_status}`} muted />
                {due > 0 && <Row label="Còn phải thu" value={formatVND(due)} muted />}
              </div>

              {o.cancel_reason && <p className="text-xs text-red-400 border-t border-white/5 pt-3">Lý do huỷ: {o.cancel_reason}</p>}

              <div className="grid grid-cols-2 gap-2">
                {o.status !== 'cancelled' && (
                  <button onClick={() => setShowQr(true)}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-600 border ${o.payment_status === 'paid' ? 'border-white/10 text-foreground hover:bg-white/5' : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'}`}>
                    <QrCode className="h-4 w-4" /> {o.payment_status === 'paid' ? 'Mã QR đơn' : 'Mã QR thu tiền'}
                  </button>
                )}
                <button onClick={() => printInvoice(o)}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-600 border border-white/10 text-foreground hover:bg-white/5 ${o.status === 'cancelled' ? 'col-span-2' : ''}`}>
                  <Printer className="h-4 w-4" /> In hoá đơn
                </button>
              </div>
              {ACTIVE_STATUSES.has(o.status) && o.payment_status !== 'paid' && (
                <button onClick={() => setShowEdit(true)}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-600 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10">
                  <Pencil className="h-4 w-4" /> Sửa món
                </button>
              )}
              {o.status !== 'cancelled' && (
                <button onClick={() => setShowChangePay(true)}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-600 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5">
                  <ArrowLeftRight className="h-4 w-4" /> Đổi hình thức thanh toán
                </button>
              )}

              <OrderEvents id={o.id} />
            </>
          )}
        </div>
      </div>

      {showQr && o && (
        <VietQrModal
          orderId={o.id}
          orderCode={o.code}
          hideConfirm={o.payment_status === 'paid'}
          onPaid={() => { setShowQr(false); loadOrder(); onChanged?.(); }}
          onClose={() => setShowQr(false)}
        />
      )}
      {showChangePay && o && (
        <ChangePaymentFlowModal
          order={o}
          onClose={() => setShowChangePay(false)}
          onDone={() => { setShowChangePay(false); loadOrder(); onChanged?.(); }}
        />
      )}
      {showEdit && o && (
        <EditOrderModal
          order={o}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => { setShowEdit(false); setO(updated); onChanged?.(); }}
        />
      )}
    </div>
  );
}

interface OrderEvent { id: string; kind: string; detail: string | null; actor_name: string | null; created_at: string; }
const EVENT_ICON: Record<string, string> = { created: '🆕', status: '➡️', paid: '💵', cancelled: '❌', edited: '✏️', payment_changed: '🔄' };

/** Lịch sử thao tác của đơn (audit) — bấm để mở, tải khi cần. */
function OrderEvents({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<OrderEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const toggle = async () => {
    const next = !open; setOpen(next);
    if (next && events === null) {
      setLoading(true);
      try { const r = await api.get<{ data: OrderEvent[] }>(`/api/solace/orders/${id}/events`); setEvents(r.data); }
      catch { setEvents([]); }
      finally { setLoading(false); }
    }
  };
  return (
    <div className="border-t border-white/5 pt-3">
      <button onClick={toggle} className="w-full flex items-center justify-between text-xs font-600 text-muted-foreground hover:text-foreground">
        <span className="inline-flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> Lịch sử thao tác</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2.5">
          {loading ? (
            <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : !events || events.length === 0 ? (
            <p className="text-2xs text-muted-foreground py-2">Chưa có ghi nhận.</p>
          ) : (
            <ol className="space-y-2">
              {events.map(e => (
                <li key={e.id} className="flex gap-2 text-2xs">
                  <span className="shrink-0">{EVENT_ICON[e.kind] ?? '•'}</span>
                  <div className="min-w-0">
                    <p className="text-foreground">{e.detail ?? e.kind}</p>
                    <p className="text-muted-foreground">{e.actor_name ?? 'Hệ thống'} · {new Date(e.created_at).toLocaleString('vi-VN')}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className={muted ? 'text-muted-foreground' : 'text-foreground'}>{label}</span>
      <span className={`${strong ? 'font-700 text-foreground text-base' : muted ? 'text-muted-foreground' : 'text-foreground'} tabular-nums`}>{value}</span>
    </div>
  );
}
