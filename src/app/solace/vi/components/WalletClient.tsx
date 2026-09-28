'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Wallet, Plus, Loader2, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { formatVND } from '@/lib/format';
import { api } from '../../quan-ly/lib/solaceApi';
import TopUpModal from './TopUpModal';

interface WalletData { user_id: string; balance: number; total_topup: number; total_spent: number; }
interface Txn { id: string; type: string; amount: number; balance_after: number; method: string | null; note: string | null; created_at: string; }

const TXN_LABEL: Record<string, string> = { topup: 'Nạp tiền', payment: 'Thanh toán', refund: 'Hoàn tiền', adjust: 'Điều chỉnh' };

export default function WalletClient() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTopup, setShowTopup] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get<{ data: { wallet: WalletData; txns: Txn[] } }>('/api/solace/wallet');
      setWallet(r.data.wallet); setTxns(r.data.txns);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-5 sm:space-y-6">
      <Link href="/solace" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Quán Solace
      </Link>

      <div>
        <h1 className="text-xl sm:text-2xl font-700 text-foreground">Ví Của Tôi</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">Số dư tín dụng & lịch sử giao dịch tại Solace</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* Thẻ số dư */}
          <div className="rounded-3xl p-5 sm:p-6 text-white relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #6d28d9, #4338ca)' }}>
            <div className="flex items-center gap-2 text-white/80 text-sm"><Wallet className="h-4 w-4" /> Số dư khả dụng</div>
            <p className="text-3xl sm:text-4xl font-700 mt-2">{formatVND(wallet?.balance ?? 0)}</p>
            <div className="flex gap-4 mt-4 text-xs text-white/70">
              <span>Đã nạp: {formatVND(wallet?.total_topup ?? 0)}</span>
              <span>Đã chi: {formatVND(wallet?.total_spent ?? 0)}</span>
            </div>
            <button onClick={() => setShowTopup(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-white/20 hover:bg-white/30 px-4 py-2 text-sm font-600 backdrop-blur">
              <Plus className="h-4 w-4" /> Nạp tiền
            </button>
          </div>

          {/* Lịch sử */}
          <div>
            <h2 className="text-base font-600 text-foreground mb-2">Lịch sử giao dịch</h2>
            {txns.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-muted-foreground">
                <Wallet className="h-9 w-9 mb-2 opacity-30" /><p className="text-sm">Chưa có giao dịch</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/5 divide-y divide-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
                {txns.map(t => {
                  const credit = t.amount >= 0;
                  return (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${credit ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                        {credit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{TXN_LABEL[t.type] ?? t.type}{t.note ? <span className="text-muted-foreground"> · {t.note}</span> : ''}</p>
                        <p className="text-2xs text-muted-foreground">{new Date(t.created_at).toLocaleString('vi-VN')}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-600 ${credit ? 'text-emerald-400' : 'text-red-400'}`}>{credit ? '+' : ''}{formatVND(t.amount)}</p>
                        <p className="text-2xs text-muted-foreground">Số dư {formatVND(t.balance_after)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {showTopup && <TopUpModal onClose={() => setShowTopup(false)} onDone={() => { setShowTopup(false); load(); }} />}
    </div>
  );
}
