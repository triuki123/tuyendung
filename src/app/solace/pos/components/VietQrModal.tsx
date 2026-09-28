'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { X, Loader2, CheckCircle2 } from 'lucide-react';
import { formatVND } from '@/lib/format';
import { api } from '../../quan-ly/lib/solaceApi';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { POS_MODAL_Z } from './modalLayers';

const QRCodeCanvas = dynamic(() => import('qrcode.react').then(m => m.QRCodeCanvas), { ssr: false });

interface QrData { payload: string; amount: number; accountNo: string; accountName: string; addInfo: string | null; }

/** Hiển thị VietQR chuyển khoản cho 1 đơn + nút xác nhận đã nhận tiền. */
export default function VietQrModal({ orderId, orderCode, onPaid, onClose, hideConfirm }: {
  orderId: string; orderCode: string | null; onPaid: () => void; onClose: () => void; hideConfirm?: boolean;
}) {
  const [qr, setQr] = useState<QrData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [confirming, setConfirming] = useState(false);
  useEscapeKey(onClose);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<{ data: QrData }>(`/api/solace/orders/${orderId}/vietqr`);
        setQr(r.data);
      } catch (e) { setErr((e as Error).message); }
      finally { setLoading(false); }
    })();
  }, [orderId]);

  const confirm = async () => {
    setConfirming(true);
    try { await api.post(`/api/solace/orders/${orderId}/pay`, { method: 'bankqr' }); onPaid(); }
    catch (e) { setErr((e as Error).message); setConfirming(false); }
  };

  return (
    <div className={`fixed inset-0 ${POS_MODAL_Z.child} flex items-center justify-center p-4`} style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
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
                {hideConfirm ? 'Quét bằng app ngân hàng để chuyển khoản. Nhân viên sẽ xác nhận khi nhận được tiền.'
                  : 'Khách quét bằng app ngân hàng. Sau khi nhận được tiền, bấm xác nhận.'}
              </p>
            </>
          )}
        </div>
        {!loading && !err && (
          <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
            <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Đóng</button>
            {!hideConfirm && (
              <button disabled={confirming} onClick={confirm}
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-600 bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50">
                <CheckCircle2 className="h-4 w-4" /> {confirming ? 'Đang xác nhận…' : 'Đã nhận tiền'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
