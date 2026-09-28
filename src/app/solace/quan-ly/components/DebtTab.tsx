'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, ArrowLeft, BookOpen, Wallet, Banknote } from 'lucide-react';
import { formatVND, parseVND } from '@/lib/format';
import MoneyInput from '@/components/ui/MoneyInput';
import { api } from '../lib/solaceApi';
import { Modal, Field, INP } from './InventoryTab';

interface Debtor { user_id: string; name: string | null; email: string | null; total_debt: number; order_count: number; oldest_at: string; }
interface DebtOrder { id: string; code: string | null; total: number; paid_amount: number; due: number; created_at: string; }

export default function DebtTab() {
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<Debtor | null>(null);
  const [orders, setOrders] = useState<DebtOrder[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [settleFor, setSettleFor] = useState<DebtOrder | null>(null);

  const loadDebtors = async () => {
    setLoading(true);
    try { const r = await api.get<{ data: Debtor[] }>('/api/solace/debts'); setDebtors(r.data); }
    catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadDebtors(); }, []);

  const openMember = async (d: Debtor) => {
    setSel(d); setDetailLoading(true);
    try { const r = await api.get<{ data: { orders: DebtOrder[] } }>(`/api/solace/debts/${d.user_id}`); setOrders(r.data.orders); }
    finally { setDetailLoading(false); }
  };
  const refreshMember = async () => { if (sel) { await openMember(sel); } await loadDebtors(); };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  // Màn chi tiết 1 người
  if (sel) {
    return (
      <div className="space-y-4">
        <button onClick={() => { setSel(null); loadDebtors(); }} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Danh sách nợ
        </button>
        <div>
          <h3 className="text-base font-700 text-foreground">{sel.name ?? sel.user_id}</h3>
          <p className="text-xs text-muted-foreground">{sel.email}</p>
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
        {detailLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-emerald-400/70"><span className="text-3xl">🎉</span><p className="text-sm mt-2 text-muted-foreground">Đã hết nợ</p></div>
        ) : (
          <div className="rounded-2xl border border-white/5 divide-y divide-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
            {orders.map(o => (
              <div key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{o.code}</p>
                  <p className="text-2xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString('vi-VN')} · còn nợ {formatVND(o.due)}{Number(o.paid_amount) > 0 ? ` (đã trả ${formatVND(o.paid_amount)})` : ''}</p>
                </div>
                <button onClick={() => setSettleFor(o)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-600 bg-indigo-600 text-white hover:bg-indigo-500 shrink-0">Trả nợ</button>
              </div>
            ))}
          </div>
        )}
        {settleFor && <SettleModal order={settleFor} onClose={() => setSettleFor(null)} onDone={() => { setSettleFor(null); refreshMember(); }} />}
      </div>
    );
  }

  // Danh sách người nợ
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Thành viên còn nợ — bấm để xem chi tiết & thu nợ.</p>
      {err && <p className="text-xs text-red-400">{err}</p>}
      {debtors.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground"><BookOpen className="h-9 w-9 mb-2 opacity-30" /><p className="text-sm">Không có công nợ</p></div>
      ) : (
        <div className="rounded-2xl border border-white/5 divide-y divide-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
          {debtors.map(d => (
            <button key={d.user_id} onClick={() => openMember(d)} className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5 text-left">
              <div className="min-w-0">
                <p className="text-sm font-600 text-foreground truncate">{d.name ?? d.user_id}</p>
                <p className="text-2xs text-muted-foreground">{d.order_count} đơn · nợ từ {new Date(d.oldest_at).toLocaleDateString('vi-VN')}</p>
              </div>
              <span className="text-base font-700 text-amber-400 shrink-0">{formatVND(d.total_debt)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SettleModal({ order, onClose, onDone }: { order: DebtOrder; onClose: () => void; onDone: () => void }) {
  const [method, setMethod] = useState<'wallet' | 'cash'>('cash');
  const [amount, setAmount] = useState(String(order.due));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    const amt = parseVND(amount);
    if (amt <= 0) { setErr('Nhập số tiền'); return; }
    setBusy(true); setErr('');
    try { await api.post(`/api/solace/orders/${order.id}/settle`, { amount: amt, method }); onDone(); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <Modal title={`Trả nợ đơn ${order.code}`} onClose={onClose} onSave={save} busy={busy} saveLabel="Xác nhận thu">
      <p className="text-xs text-muted-foreground">Còn nợ: <span className="text-foreground font-600">{formatVND(order.due)}</span></p>
      <Field label="Hình thức">
        <div className="flex gap-2">
          <button onClick={() => setMethod('cash')} className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs border ${method === 'cash' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground'}`}><Banknote className="h-4 w-4" /> Tiền mặt</button>
          <button onClick={() => setMethod('wallet')} className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs border ${method === 'wallet' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground'}`}><Wallet className="h-4 w-4" /> Trừ ví</button>
        </div>
      </Field>
      <Field label="Số tiền thu (có thể trả từng phần)"><MoneyInput value={amount} onValueChange={(n) => setAmount(n ? String(n) : '')} className={INP} style={{ background: '#162033' }} /></Field>
      {err && <p className="text-xs text-red-400">{err}</p>}
    </Modal>
  );
}
