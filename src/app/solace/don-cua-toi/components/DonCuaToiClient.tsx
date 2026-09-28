'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, QrCode, Wallet, X } from 'lucide-react';
import { formatVND } from '@/lib/format';
import { api } from '../../quan-ly/lib/solaceApi';
import VietQrModal from '../../pos/components/VietQrModal';
import type { SolaceOrder } from '@/lib/services/solaceOrderService';
import { useConfirm } from '@/context/ConfirmContext';
import ErrorState from '@/components/ui/ErrorState';

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Chờ pha', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  preparing: { label: 'Đang pha', cls: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
  ready: { label: 'Sẵn sàng — mời nhận', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  done: { label: 'Hoàn tất', cls: 'text-muted-foreground bg-white/5 border-white/10' },
  cancelled: { label: 'Đã huỷ', cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
};

export default function DonCuaToiClient() {
  const confirm = useConfirm();
  const [orders, setOrders] = useState<SolaceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [loadErr, setLoadErr] = useState(false);
  const [qrOrder, setQrOrder] = useState<SolaceOrder | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { const r = await api.get<{ data: SolaceOrder[] }>('/api/solace/my-orders'); setOrders(r.data); setLoadErr(false); }
    catch (e) { if (!silent) setLoadErr(true); setErr((e as Error).message); }
    finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // Tự cập nhật trạng thái mỗi 15s (thấy "Sẵn sàng" mà không cần tải lại).
  useEffect(() => { const t = setInterval(() => load(true), 15000); return () => clearInterval(t); }, [load]);

  const action = async (id: string, act: 'cancel' | 'pay_wallet') => {
    try { await api.patch(`/api/solace/my-orders/${id}`, { action: act }); load(); }
    catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/solace" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Quán Solace
        </Link>
        <Link href="/solace/dat-mon" className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300">
          <Plus className="h-3.5 w-3.5" /> Đặt thêm
        </Link>
      </div>

      <div>
        <h1 className="text-xl sm:text-2xl font-700 text-foreground">Đơn Của Tôi</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">Theo dõi trạng thái & thanh toán đơn Solace</p>
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : loadErr ? (
        <ErrorState message="Không tải được danh sách đơn. Vui lòng thử lại." onRetry={() => load()} />
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground">
          <span className="text-3xl opacity-30">🧾</span><p className="text-sm mt-3">Bạn chưa có đơn nào</p>
          <Link href="/solace/dat-mon" className="text-xs text-indigo-400 mt-1">Đặt món ngay</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(o => {
            const st = STATUS[o.status] ?? STATUS.pending;
            const unpaid = o.payment_status !== 'paid' && o.status !== 'cancelled';
            return (
              <div key={o.id} className="rounded-2xl border border-white/5 p-3.5" style={{ background: 'var(--card)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-600 text-foreground">{o.code}</p>
                    <p className="text-2xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString('vi-VN')} · {o.fulfillment_type === 'dine_in' ? `Tại chỗ${o.floor_note ? ' · ' + o.floor_note : ''}` : 'Tại quầy'}
                    </p>
                  </div>
                  <span className={`text-2xs font-600 px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                </div>

                <div className="mt-2 space-y-0.5">
                  {(o.items ?? []).map(it => (
                    <p key={it.id} className="text-xs text-muted-foreground">{it.qty}× {it.name_snapshot}
                      {Array.isArray(it.options_json) && it.options_json.length ? ` (${(it.options_json as Array<{ name: string }>).map(x => x.name).join(', ')})` : ''}</p>
                  ))}
                </div>

                <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                  <div>
                    <span className="text-sm font-700 text-foreground">{formatVND(o.total)}</span>
                    <span className={`ml-2 text-2xs ${o.payment_status === 'paid' ? 'text-emerald-400' : o.payment_status === 'partial' ? 'text-sky-400' : o.payment_status === 'debt' ? 'text-amber-400' : 'text-muted-foreground'}`}>
                      {o.payment_status === 'paid' ? 'Đã thanh toán' : o.payment_status === 'partial' ? 'Thanh toán một phần' : o.payment_status === 'debt' ? 'Ghi nợ' : 'Chưa thanh toán'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {unpaid && (
                      <button onClick={() => action(o.id, 'pay_wallet')} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-600 bg-violet-600 text-white hover:bg-violet-500">
                        <Wallet className="h-3.5 w-3.5" /> Trả bằng ví
                      </button>
                    )}
                    {unpaid && o.payment_method === 'bankqr' && (
                      <button onClick={() => setQrOrder(o)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-500 border border-white/10 text-muted-foreground hover:text-foreground">
                        <QrCode className="h-3.5 w-3.5" /> Xem QR
                      </button>
                    )}
                    {o.status === 'pending' && (
                      <button onClick={async () => { if (await confirm({ title: 'Huỷ đơn?', message: `Huỷ đơn ${o.code}?`, confirmLabel: 'Huỷ đơn', danger: true })) action(o.id, 'cancel'); }}
                        className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-red-400"><X className="h-4 w-4" /></button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {qrOrder && <VietQrModal orderId={qrOrder.id} orderCode={qrOrder.code} hideConfirm
        onPaid={() => setQrOrder(null)} onClose={() => setQrOrder(null)} />}
    </div>
  );
}
