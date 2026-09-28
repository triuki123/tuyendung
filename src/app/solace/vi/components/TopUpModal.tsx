'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { X, Loader2 } from 'lucide-react';
import { formatVND, parseVND } from '@/lib/format';
import MoneyInput from '@/components/ui/MoneyInput';
import { buildVietQrPayload } from '@/lib/vietqr';
import { getCurrentUser } from '@/lib/authStore';
import { api } from '../../quan-ly/lib/solaceApi';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

const QRCodeCanvas = dynamic(() => import('qrcode.react').then(m => m.QRCodeCanvas), { ssr: false });

interface Bank { bankBin: string; accountNo: string; accountName: string; }

export default function TopUpModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose);
  const [method, setMethod] = useState<'transfer' | 'cash'>('transfer');
  const [amount, setAmount] = useState('');
  const [bank, setBank] = useState<Bank | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);

  const amt = parseVND(amount);
  const userName = (getCurrentUser() as { name?: string } | null)?.name ?? '';
  const addInfo = `NAP ${userName}`;

  useEffect(() => {
    api.get<{ data: Bank }>('/api/solace/bank-info').then(r => setBank(r.data)).catch(() => {});
  }, []);

  const qrPayload = method === 'transfer' && bank && amt > 0
    ? buildVietQrPayload({ bankBin: bank.bankBin, accountNo: bank.accountNo, amount: amt, addInfo })
    : null;

  const submit = async () => {
    if (amt <= 0) { setErr('Nhập số tiền nạp'); return; }
    setBusy(true); setErr('');
    try {
      await api.post('/api/solace/topup-requests', { amount: amt, method });
      markClean();
      setSent(true);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={guardedClose}>
      <div className="w-full max-w-sm rounded-3xl border border-white/10 overflow-hidden max-h-[90vh] flex flex-col" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()} onChange={markDirty}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4 shrink-0">
          <h2 className="text-base font-700 text-foreground">Nạp tiền vào ví</h2>
          <button onClick={guardedClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {sent ? (
            <div className="text-center py-4">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-sm font-600 text-foreground">Đã gửi yêu cầu nạp {formatVND(amt)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {method === 'transfer' ? 'Nhân viên sẽ xác nhận sau khi nhận được chuyển khoản.' : 'Vui lòng đưa tiền mặt tại quầy để nhân viên xác nhận.'}
              </p>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                {([['transfer', 'Chuyển khoản'], ['cash', 'Tiền mặt tại quầy']] as const).map(([m, l]) => (
                  <button key={m} onClick={() => { markDirty(); setMethod(m); }}
                    className={`flex-1 rounded-xl px-2 py-2 text-xs border ${method === m ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground'}`}>{l}</button>
                ))}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Số tiền</label>
                <MoneyInput autoFocus value={amount} onValueChange={(n) => setAmount(n ? String(n) : '')} placeholder="VD: 100.000"
                  className="w-full rounded-xl px-3 py-2.5 text-lg text-foreground border border-white/10 text-right" style={{ background: '#162033' }} />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[50000, 100000, 200000, 500000].map(v => (
                    <button key={v} onClick={() => { markDirty(); setAmount(String(v)); }}
                      className="rounded-lg px-2.5 py-1 text-xs border border-white/10 text-muted-foreground hover:text-foreground">{formatVND(v)}</button>
                  ))}
                </div>
              </div>

              {method === 'transfer' && (
                qrPayload ? (
                  <div className="text-center space-y-2">
                    <div className="inline-block rounded-2xl bg-white p-3"><QRCodeCanvas value={qrPayload} size={180} level="M" /></div>
                    <div className="text-xs text-muted-foreground">
                      <p>{bank?.accountName} · {bank?.accountNo}</p>
                      <p>Nội dung: <span className="text-foreground font-600">{addInfo}</span></p>
                    </div>
                  </div>
                ) : amt > 0 ? (
                  <p className="text-xs text-amber-400">Quán chưa cấu hình tài khoản ngân hàng — vui lòng chọn Tiền mặt hoặc liên hệ nhân viên.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Nhập số tiền để hiện mã VietQR.</p>
                )
              )}
              {err && <p className="text-xs text-red-400">{err}</p>}
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4 shrink-0">
          {sent ? (
            <button onClick={onDone} className="rounded-xl px-4 py-2 text-sm font-600 bg-indigo-600 text-white hover:bg-indigo-500">Xong</button>
          ) : (
            <>
              <button onClick={guardedClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
              <button disabled={busy} onClick={submit} className="rounded-xl px-4 py-2 text-sm font-600 bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">
                {busy ? 'Đang gửi…' : 'Gửi yêu cầu nạp'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
