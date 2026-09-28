'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Wallet, Banknote, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Scale, Plus, Trash2 } from 'lucide-react';
import { formatVND, parseVND } from '@/lib/format';
import MoneyInput from '@/components/ui/MoneyInput';
import { api } from '../lib/solaceApi';
import { Modal, Field, INP } from './InventoryTab';
import { useConfirm } from '@/context/ConfirmContext';

/** Nhóm khoản sinh TỰ ĐỘNG từ nghiệp vụ — xoá chỉ gỡ khỏi sổ quỹ, không đảo nghiệp vụ gốc. */
const AUTO_CATEGORIES = new Set(['sale', 'topup', 'debt_payment', 'refund']);

type Account = 'cash' | 'bank';
interface CashTxn {
  id: string; account: Account; direction: 'in' | 'out'; amount: number; category: string;
  note: string | null; business_date: string | null; created_at: string;
}
interface CashData {
  balances: { cash: number; bank: number };
  txns: CashTxn[];
  openingSet: { cash: boolean; bank: boolean };
}

const ACCOUNT_LABEL: Record<Account, string> = { cash: 'Tiền mặt', bank: 'Ngân hàng' };
const CAT_LABEL: Record<string, string> = {
  opening: 'Số dư đầu kỳ', sale: 'Bán hàng', topup: 'Nạp ví', debt_payment: 'Thu nợ',
  purchase: 'Mua nguyên liệu', expense: 'Chi phí', refund: 'Hoàn tiền', transfer: 'Chuyển quỹ', adjust: 'Kiểm quỹ',
};

type ModalMode = null | 'in' | 'out' | 'transfer' | 'adjust' | { opening: Account };

export default function CashTab({ canDelete = false }: { canDelete?: boolean }) {
  const confirm = useConfirm();
  const [data, setData] = useState<CashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [modal, setModal] = useState<ModalMode>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get<{ data: CashData }>('/api/solace/cash');
      setData(r.data);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (t: CashTxn) => {
    const isAuto = AUTO_CATEGORIES.has(t.category);
    const ok = await confirm({
      title: 'Xoá khoản quỹ?',
      message: `${CAT_LABEL[t.category] ?? t.category} · ${t.direction === 'in' ? '+' : '−'}${formatVND(t.amount)}${t.note ? ` · ${t.note}` : ''}.`
        + (isAuto ? ' Khoản này sinh tự động từ nghiệp vụ (đơn/ví/nợ) — xoá chỉ gỡ khỏi sổ quỹ, KHÔNG hoàn lại nghiệp vụ gốc.' : '')
        + (t.category === 'transfer' ? ' Đây là 1 vế của chuyển quỹ — vế còn lại vẫn giữ nguyên.' : ''),
      confirmLabel: 'Xoá', danger: true,
    });
    if (!ok) return;
    setDeletingId(t.id); setErr('');
    try {
      await api.del(`/api/solace/cash/${t.id}`);
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setDeletingId(null); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data) return <p className="text-sm text-red-400">{err || 'Không tải được sổ quỹ'}</p>;

  return (
    <div className="space-y-4">
      {/* Số dư 2 quỹ */}
      <div className="grid grid-cols-2 gap-3">
        <BalanceCard icon={<Wallet className="h-5 w-5" />} label="Tiền mặt (két)" value={data.balances.cash}
          openingSet={data.openingSet.cash} onSetOpening={() => setModal({ opening: 'cash' })} />
        <BalanceCard icon={<Banknote className="h-5 w-5" />} label="Ngân hàng" value={data.balances.bank}
          openingSet={data.openingSet.bank} onSetOpening={() => setModal({ opening: 'bank' })} />
      </div>

      {/* Hành động */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <ActBtn onClick={() => setModal('in')} icon={<ArrowDownLeft className="h-4 w-4" />} label="Thu" tone="emerald" />
        <ActBtn onClick={() => setModal('out')} icon={<ArrowUpRight className="h-4 w-4" />} label="Chi" tone="red" />
        <ActBtn onClick={() => setModal('transfer')} icon={<ArrowLeftRight className="h-4 w-4" />} label="Chuyển quỹ" tone="indigo" />
        <ActBtn onClick={() => setModal('adjust')} icon={<Scale className="h-4 w-4" />} label="Kiểm quỹ" tone="amber" />
      </div>

      {err && <p className="text-xs text-red-400">{err}</p>}

      {/* Lịch sử thu/chi */}
      {data.txns.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground">
          <Wallet className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có giao dịch quỹ</p>
          <p className="text-xs mt-1 opacity-60">Đặt số dư đầu kỳ rồi bắt đầu vận hành</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.txns.map(t => {
            const isIn = t.direction === 'in';
            return (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 px-3.5 py-2.5" style={{ background: 'var(--card)' }}>
                <div className="min-w-0">
                  <p className="text-sm font-600 text-foreground">{CAT_LABEL[t.category] ?? t.category}</p>
                  <p className="text-2xs text-muted-foreground truncate">
                    {ACCOUNT_LABEL[t.account]} · {new Date(t.created_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {t.note ? ` · ${t.note}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-sm font-700 ${isIn ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isIn ? '+' : '−'}{formatVND(t.amount)}
                  </span>
                  {canDelete && (
                    <button onClick={() => handleDelete(t)} disabled={deletingId === t.id} title="Xoá khoản này"
                      className="text-muted-foreground hover:text-red-400 disabled:opacity-40 p-1">
                      {deletingId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && <CashModal mode={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </div>
  );
}

function BalanceCard({ icon, label, value, openingSet, onSetOpening }: {
  icon: React.ReactNode; label: string; value: number; openingSet: boolean; onSetOpening: () => void;
}) {
  return (
    <div className="rounded-2xl border border-white/5 p-4" style={{ background: 'var(--card)' }}>
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<span className="text-xs font-600">{label}</span></div>
      <p className={`text-2xl font-700 mt-1.5 ${value < 0 ? 'text-red-400' : 'text-foreground'}`}>{formatVND(value)}</p>
      {!openingSet && (
        <button onClick={onSetOpening} className="mt-2 inline-flex items-center gap-1 text-2xs text-indigo-400 hover:text-indigo-300">
          <Plus className="h-3 w-3" /> Đặt số dư đầu kỳ
        </button>
      )}
    </div>
  );
}

function ActBtn({ onClick, icon, label, tone }: { onClick: () => void; icon: React.ReactNode; label: string; tone: 'emerald' | 'red' | 'indigo' | 'amber' }) {
  const cls = {
    emerald: 'text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10',
    red: 'text-red-400 border-red-500/30 hover:bg-red-500/10',
    indigo: 'text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/10',
    amber: 'text-amber-400 border-amber-500/30 hover:bg-amber-500/10',
  }[tone];
  return (
    <button onClick={onClick} className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-600 ${cls}`}>
      {icon} {label}
    </button>
  );
}

function CashModal({ mode, onClose, onSaved }: { mode: Exclude<ModalMode, null>; onClose: () => void; onSaved: () => void }) {
  const opening = typeof mode === 'object' ? mode.opening : null;
  const [account, setAccount] = useState<Account>(opening ?? 'cash');
  const [to, setTo] = useState<Account>('bank');
  const [amount, setAmount] = useState('');
  const [counted, setCounted] = useState('');
  const [category, setCategory] = useState<'expense' | 'purchase' | 'sale'>(mode === 'out' ? 'expense' : 'sale');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const title = opening ? `Số dư đầu kỳ — ${ACCOUNT_LABEL[opening]}`
    : mode === 'in' ? 'Thu tiền (ghi tay)'
    : mode === 'out' ? 'Chi tiền'
    : mode === 'transfer' ? 'Chuyển quỹ'
    : 'Kiểm quỹ';

  const save = async () => {
    setBusy(true); setErr('');
    try {
      if (opening) {
        await api.post('/api/solace/cash', { action: 'opening', account: opening, amount: parseVND(amount) });
      } else if (mode === 'transfer') {
        if (account === to) throw new Error('Hai quỹ phải khác nhau');
        await api.post('/api/solace/cash', { action: 'transfer', from: account, to, amount: parseVND(amount), note: note || null });
      } else if (mode === 'adjust') {
        await api.post('/api/solace/cash', { action: 'adjust', account, counted: parseVND(counted), note: note || null });
      } else {
        await api.post('/api/solace/cash', {
          action: 'manual', account, direction: mode, amount: parseVND(amount),
          category: mode === 'out' ? category : 'sale', note: note || null,
        });
      }
      onSaved();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <Modal title={title} onClose={onClose} onSave={save} busy={busy} saveLabel={opening ? 'Lưu số dư' : 'Ghi sổ'}>
      {/* Quỹ (không hiện khi opening đã cố định) */}
      {!opening && (
        <Field label={mode === 'transfer' ? 'Từ quỹ' : 'Quỹ'}>
          <div className="flex gap-2">
            {(['cash', 'bank'] as Account[]).map(a => (
              <button key={a} type="button" onClick={() => setAccount(a)}
                className={`flex-1 rounded-xl px-2 py-2 text-sm border ${account === a ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground'}`}>{ACCOUNT_LABEL[a]}</button>
            ))}
          </div>
        </Field>
      )}

      {mode === 'transfer' && (
        <Field label="Đến quỹ">
          <div className="flex gap-2">
            {(['cash', 'bank'] as Account[]).map(a => (
              <button key={a} type="button" onClick={() => setTo(a)}
                className={`flex-1 rounded-xl px-2 py-2 text-sm border ${to === a ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground'}`}>{ACCOUNT_LABEL[a]}</button>
            ))}
          </div>
        </Field>
      )}

      {mode === 'out' && (
        <Field label="Loại chi">
          <div className="flex gap-2">
            {([['expense', 'Chi phí'], ['purchase', 'Mua nguyên liệu']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setCategory(k)}
                className={`flex-1 rounded-xl px-2 py-2 text-sm border ${category === k ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground'}`}>{l}</button>
            ))}
          </div>
        </Field>
      )}

      {mode === 'adjust' ? (
        <Field label="Số tiền thực đếm được (đ)"><MoneyInput autoFocus value={counted} onValueChange={(n) => setCounted(n ? String(n) : '')} className={INP} style={{ background: '#162033' }} /></Field>
      ) : (
        <Field label="Số tiền (đ)"><MoneyInput autoFocus value={amount} onValueChange={(n) => setAmount(n ? String(n) : '')} className={INP} style={{ background: '#162033' }} /></Field>
      )}

      {!opening && <Field label="Ghi chú"><input value={note} onChange={e => setNote(e.target.value)} placeholder="VD: tiền điện, nộp ngân hàng…" className={INP} style={{ background: '#162033' }} /></Field>}

      {err && <p className="text-xs text-red-400">{err}</p>}
    </Modal>
  );
}
