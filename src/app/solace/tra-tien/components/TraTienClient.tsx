'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowLeft, Loader2, Wallet, QrCode, CheckCircle2, X } from 'lucide-react';
import { formatVND } from '@/lib/format';
import { api } from '../../quan-ly/lib/solaceApi';
import type { SolaceOrder } from '@/lib/services/solaceOrderService';
import { useEscapeKey } from '@/hooks/useEscapeKey';

const QRCodeCanvas = dynamic(() => import('qrcode.react').then(m => m.QRCodeCanvas), { ssr: false });

export default function TraTienClient() {
  const [balance, setBalance] = useState(0);
  const [orders, setOrders] = useState<SolaceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [paying, setPaying] = useState<string | null>(null);
  const [qrOrder, setQrOrder] = useState<SolaceOrder | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [w, u] = await Promise.all([
        api.get<{ data: { wallet: { balance: number } } }>('/api/solace/wallet'),
        api.get<{ data: SolaceOrder[] }>('/api/solace/my-orders/unpaid'),
      ]);
      setBalance(Number(w.data.wallet.balance));
      setOrders(u.data);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const payWallet = async (o: SolaceOrder) => {
    const due = Number(o.total) - Number(o.paid_amount);
    if (balance < due) { setErr('Số dư ví không đủ — vui lòng nạp thêm hoặc chuyển khoản.'); return; }
    setPaying(o.id); setErr('');
    try { await api.patch(`/api/solace/my-orders/${o.id}`, { action: 'pay_wallet' }); await load(); }
    catch (e) { setErr((e as Error).message); }
    finally { setPaying(null); }
  };

  return (
    <div className="space-y-5 max-w-lg mx-auto">
      <Link href="/solace" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Quán Solace
      </Link>

      <div>
        <h1 className="text-xl sm:text-2xl font-700 text-foreground">Trả Nợ / Thanh Toán</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">Trả các đơn chưa thanh toán bằng ví hoặc chuyển khoản VietQR</p>
      </div>

      <div className="rounded-2xl p-4 text-white flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #6d28d9, #4338ca)' }}>
        <span className="flex items-center gap-2 text-white/85 text-sm"><Wallet className="h-4 w-4" /> Số dư ví</span>
        <span className="text-2xl font-700">{formatVND(balance)}</span>
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center py-14 text-muted-foreground">
          <CheckCircle2 className="h-10 w-10 mb-2 text-emerald-400/60" />
          <p className="text-sm">Không có đơn nào cần thanh toán</p>
          <Link href="/solace/dat-mon" className="text-xs text-indigo-400 mt-1">Đặt món mới</Link>
        </div>
      ) : (
        <div className="space-y-2.5">
          {orders.map(o => {
            const due = Number(o.total) - Number(o.paid_amount);
            const notEnough = balance < due;
            return (
              <div key={o.id} className="rounded-2xl border border-white/5 p-3.5 space-y-3" style={{ background: 'var(--card)' }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-600 text-foreground">{o.code}</p>
                    <p className="text-2xs text-muted-foreground">{new Date(o.created_at).toLocaleString('vi-VN')}</p>
                  </div>
                  <p className="text-base text-foreground font-700 shrink-0">{formatVND(due)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button disabled={paying === o.id || notEnough} onClick={() => payWallet(o)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-600 bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40">
                    <Wallet className="h-4 w-4" /> {paying === o.id ? 'Đang trả…' : 'Trả bằng ví'}
                  </button>
                  <button onClick={() => setQrOrder(o)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-600 bg-sky-600 text-white hover:bg-sky-500">
                    <QrCode className="h-4 w-4" /> Chuyển khoản
                  </button>
                </div>
                {notEnough && <p className="text-2xs text-amber-400">Số dư ví không đủ cho đơn này — có thể chuyển khoản VietQR.</p>}
              </div>
            );
          })}
        </div>
      )}

      {qrOrder && <CustomerQrModal order={qrOrder} onClose={() => setQrOrder(null)} />}
    </div>
  );
}

interface QrData { payload: string; amount: number; accountNo: string; accountName: string; addInfo: string | null; }

/** QR chuyển khoản cho khách tự trả nợ — chỉ hiển thị, nhân viên xác nhận khi nhận tiền. */
function CustomerQrModal({ order, onClose }: { order: SolaceOrder; onClose: () => void }) {
  const [qr, setQr] = useState<QrData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  useEscapeKey(onClose);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<{ data: QrData }>(`/api/solace/my-orders/${order.id}/vietqr`);
        setQr(r.data);
      } catch (e) { setErr((e as Error).message); }
      finally { setLoading(false); }
    })();
  }, [order.id]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-base font-700 text-foreground">Chuyển khoản VietQR</h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-4 text-center">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : err ? (
            <p className="text-sm text-red-400">{err}</p>
          ) : qr && (
            <>
              <div className="inline-block rounded-2xl bg-white p-3">
                <QRCodeCanvas value={qr.payload} size={200} level="M" />
              </div>
              <div className="text-sm space-y-0.5">
                <p className="text-foreground font-700 text-lg">{formatVND(qr.amount)}</p>
                <p className="text-muted-foreground">{qr.accountName || '—'}</p>
                <p className="text-muted-foreground">STK: {qr.accountNo}</p>
                <p className="text-muted-foreground">Nội dung: <span className="text-foreground font-600">{qr.addInfo}</span></p>
              </div>
              <p className="text-2xs text-muted-foreground">
                Quét bằng app ngân hàng để chuyển khoản. Quán sẽ xác nhận & trừ nợ khi nhận được tiền.
              </p>
            </>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Đóng</button>
        </div>
      </div>
    </div>
  );
}
