'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, ChevronLeft, ChevronRight, Receipt } from 'lucide-react';
import { formatVND } from '@/lib/format';
import { api } from '../lib/solaceApi';
import OrderDetailModal from '../../pos/components/OrderDetailModal';
import type { SolaceOrder } from '@/lib/services/solaceOrderService';

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

/** Ngày hôm nay theo giờ VN (YYYY-MM-DD). */
const todayVN = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
function shiftDate(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

export default function OrderHistoryTab() {
  const [date, setDate] = useState(todayVN());
  const [orders, setOrders] = useState<SolaceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState<'all' | string>('all');
  const [pay, setPay] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [detailId, setDetailId] = useState<string | null>(null);
  // Chi trong ngày (từ Sổ Quỹ) — chỉ có khi user có quyền solace-cash.
  const [cash, setCash] = useState<{ in: number; out: number; purchase: number; expense: number; refund: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const r = await api.get<{ data: SolaceOrder[] }>(`/api/solace/orders?date=${date}&limit=300`);
      setOrders(r.data);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
    // Quỹ ngày (đối soát chi) — không chặn danh sách đơn nếu không có quyền/lỗi.
    try {
      const c = await api.get<{ data: { txns: Array<{ direction: 'in' | 'out'; amount: number; category: string }> } }>(`/api/solace/cash?date=${date}`);
      const t = c.data?.txns ?? [];
      const sum = (pred: (x: { direction: 'in' | 'out'; amount: number; category: string }) => boolean) => t.filter(pred).reduce((s, x) => s + Number(x.amount), 0);
      setCash({
        in: sum(x => x.direction === 'in'),
        out: sum(x => x.direction === 'out'),
        purchase: sum(x => x.direction === 'out' && x.category === 'purchase'),
        expense: sum(x => x.direction === 'out' && x.category === 'expense'),
        refund: sum(x => x.direction === 'out' && x.category === 'refund'),
      });
    } catch { setCash(null); }
  }, [date]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => orders.filter(o =>
    (status === 'all' || o.status === status) &&
    (pay === 'all' || (pay === 'paid' ? o.payment_status === 'paid' : o.payment_status !== 'paid'))
  ), [orders, status, pay]);

  const rev = useMemo(() => {
    const live = orders.filter(o => o.status !== 'cancelled');
    const paidSum = (m?: string) => live
      .filter(o => (m ? o.payment_method === m : true))
      .reduce((s, o) => s + Number(o.paid_amount), 0);
    return {
      count: live.length,
      revenue: live.reduce((s, o) => s + Number(o.total), 0),
      collected: paidSum(),
      cash: paidSum('cash'), bank: paidSum('bankqr'), wallet: paidSum('wallet'),
      unpaid: live.filter(o => o.payment_status !== 'paid').reduce((s, o) => s + (Number(o.total) - Number(o.paid_amount)), 0),
    };
  }, [orders]);

  const isToday = date === todayVN();

  return (
    <div className="space-y-4">
      {/* Chọn ngày */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(d => shiftDate(d, -1))} className="rounded-lg p-2 border border-white/10 text-muted-foreground hover:text-foreground active:bg-white/5"><ChevronLeft className="h-4 w-4" /></button>
          <input type="date" value={date} max={todayVN()} onChange={e => setDate(e.target.value || todayVN())}
            className="rounded-lg px-2.5 py-1.5 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />
          <button onClick={() => setDate(d => shiftDate(d, 1))} disabled={isToday}
            className="rounded-lg p-2 border border-white/10 text-muted-foreground hover:text-foreground active:bg-white/5 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
        </div>
        {!isToday && <button onClick={() => setDate(todayVN())} className="text-xs text-indigo-400 hover:text-indigo-300">Hôm nay</button>}
      </div>

      {/* Tổng kết & đối soát ngày */}
      <div className="rounded-2xl border border-white/5 p-4 space-y-3" style={{ background: 'var(--card)' }}>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Số đơn" value={String(rev.count)} />
          <Stat label="Doanh thu" value={formatVND(rev.revenue)} />
          <Stat label="Đã thu" value={formatVND(rev.collected)} accent="text-emerald-400" />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted-foreground">
          <span>Tiền mặt: <b className="text-foreground">{formatVND(rev.cash)}</b></span>
          <span>Chuyển khoản: <b className="text-foreground">{formatVND(rev.bank)}</b></span>
          <span>Ví: <b className="text-foreground">{formatVND(rev.wallet)}</b></span>
          {rev.unpaid > 0 && <span>Còn nợ: <b className="text-amber-400">{formatVND(rev.unpaid)}</b></span>}
        </div>

        {cash && (
          <div className="border-t border-white/5 pt-3 space-y-1.5">
            <p className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Quỹ trong ngày (đối soát)</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Tiền vào quỹ</span>
              <span className="text-emerald-400 font-600">+{formatVND(cash.in)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Tiền ra quỹ</span>
              <span className="text-red-400 font-600">−{formatVND(cash.out)}</span>
            </div>
            <p className="text-2xs text-muted-foreground">Chi: Mua NL {formatVND(cash.purchase)} · Chi phí {formatVND(cash.expense)} · Hoàn tiền {formatVND(cash.refund)}</p>
            <div className="flex items-center justify-between border-t border-white/5 pt-1.5 text-sm">
              <span className="font-600 text-foreground">Chênh quỹ trong ngày</span>
              <span className={`font-700 ${cash.in - cash.out >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {cash.in - cash.out >= 0 ? '+' : '−'}{formatVND(Math.abs(cash.in - cash.out))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Lọc */}
      <div className="flex flex-wrap gap-1.5">
        {([['all', 'Tất cả'], ['done', 'Hoàn tất'], ['cancelled', 'Đã huỷ']] as const).map(([k, l]) => (
          <Chip key={k} active={status === k} onClick={() => setStatus(k)}>{l}</Chip>
        ))}
        <span className="w-px bg-white/10 mx-1" />
        {([['all', 'Mọi TT'], ['paid', 'Đã thu'], ['unpaid', 'Chưa thu']] as const).map(([k, l]) => (
          <Chip key={k} active={pay === k} onClick={() => setPay(k)}>{l}</Chip>
        ))}
      </div>

      {err && <p className="text-xs text-red-400">{err}</p>}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground">
          <Receipt className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Không có đơn nào</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {shown.map(o => (
            <button key={o.id} onClick={() => setDetailId(o.id)}
              className="text-left rounded-2xl border border-white/5 p-3.5 hover:border-indigo-500/40 active:bg-white/5 transition-colors" style={{ background: 'var(--card)' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-600 text-foreground">{o.code}</p>
                  <p className="text-2xs text-muted-foreground">{hhmm(o.created_at)}{o.customer_name ? ` · ${o.customer_name}` : ''}</p>
                </div>
                <span className={`shrink-0 text-2xs font-600 px-2 py-0.5 rounded-full border ${STATUS_CLS[o.status] ?? ''}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                <span className="text-sm font-700 text-foreground">{formatVND(o.total)}</span>
                <span className={`text-2xs ${o.payment_status === 'paid' ? 'text-emerald-400' : o.payment_status === 'partial' ? 'text-sky-400' : 'text-amber-400'}`}>
                  {PAYSTATUS_LABEL[o.payment_status] ?? o.payment_status} · {PAY_LABEL[o.payment_method ?? ''] ?? '—'}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {detailId && <OrderDetailModal id={detailId} onClose={() => setDetailId(null)} onChanged={() => load()} />}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-white/5 px-3 py-2.5" style={{ background: 'var(--card)' }}>
      <p className="text-2xs text-muted-foreground">{label}</p>
      <p className={`text-base font-700 leading-tight truncate ${accent ?? 'text-foreground'}`}>{value}</p>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-500 border transition-colors ${active ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground'}`}>
      {children}
    </button>
  );
}
