'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Check, X, Search, Wallet, Plus } from 'lucide-react';
import { formatVND, parseVND } from '@/lib/format';
import { api } from '../lib/solaceApi';
import { Modal, Field, INP } from './InventoryTab';
import MemberPicker, { type Member } from '../../pos/components/MemberPicker';

interface TopupReq { id: string; user_id: string; amount: number; method: string; status: string; note: string | null; created_at: string; name?: string; email?: string; }
interface WalletData { user_id: string; balance: number; total_topup: number; total_spent: number; name?: string; }
interface Txn { id: string; type: string; amount: number; balance_after: number; note: string | null; created_at: string; }

const TXN_LABEL: Record<string, string> = { topup: 'Nạp', payment: 'Thanh toán', refund: 'Hoàn', adjust: 'Điều chỉnh' };

export default function WalletAdminTab() {
  const [reqs, setReqs] = useState<TopupReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [pickMember, setPickMember] = useState(false);
  const [member, setMember] = useState<Member | null>(null);
  const [wallet, setWallet] = useState<{ wallet: WalletData; txns: Txn[] } | null>(null);
  const [topupFor, setTopupFor] = useState<{ mode: 'topup' | 'adjust' } | null>(null);

  const loadReqs = async () => {
    setLoading(true);
    try { const r = await api.get<{ data: TopupReq[] }>('/api/solace/topup-requests?status=pending'); setReqs(r.data); }
    catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadReqs(); }, []);

  const loadWallet = async (m: Member) => {
    setMember(m);
    const r = await api.get<{ data: { wallet: WalletData; txns: Txn[] } }>(`/api/solace/wallet/${m.id}`);
    setWallet(r.data);
  };

  const act = async (id: string, action: 'approve' | 'reject') => {
    try {
      await fetch(`/api/solace/topup-requests/${id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
        .then(async r => { if (!r.ok) throw new Error((await r.json()).error || 'Lỗi'); });
      loadReqs();
      if (member) loadWallet(member);
    } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className="space-y-6">
      {/* Yêu cầu nạp chờ duyệt */}
      <section className="space-y-2">
        <h3 className="text-sm font-600 text-foreground">Yêu cầu nạp chờ duyệt</h3>
        {err && <p className="text-xs text-red-400">{err}</p>}
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : reqs.length === 0 ? (
          <p className="text-xs text-muted-foreground">Không có yêu cầu nào.</p>
        ) : (
          <div className="rounded-2xl border border-white/5 divide-y divide-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
            {reqs.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{r.name ?? r.user_id} · <span className="font-600">{formatVND(r.amount)}</span></p>
                  <p className="text-2xs text-muted-foreground">{r.method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'} · {new Date(r.created_at).toLocaleString('vi-VN')}</p>
                </div>
                <button onClick={() => act(r.id, 'approve')} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-600 bg-emerald-600 text-white hover:bg-emerald-500"><Check className="h-3.5 w-3.5" /> Duyệt</button>
                <button onClick={() => act(r.id, 'reject')} className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-red-400"><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Tra cứu ví thành viên */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-600 text-foreground">Tra cứu ví thành viên</h3>
          <button onClick={() => setPickMember(true)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-500 border border-white/10 text-muted-foreground hover:text-foreground">
            <Search className="h-4 w-4" /> Chọn thành viên
          </button>
        </div>

        {wallet && member && (
          <div className="rounded-2xl border border-white/5 p-4 space-y-3" style={{ background: 'var(--card)' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-600 text-foreground">{member.name}</p>
                <p className="text-2xs text-muted-foreground">{member.email}</p>
              </div>
              <div className="text-right">
                <p className="text-2xs text-muted-foreground">Số dư</p>
                <p className="text-lg font-700 text-emerald-400">{formatVND(wallet.wallet.balance)}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setTopupFor({ mode: 'topup' })} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-600 bg-indigo-600 text-white hover:bg-indigo-500"><Plus className="h-4 w-4" /> Nạp tiền</button>
              <button onClick={() => setTopupFor({ mode: 'adjust' })} className="rounded-xl px-3 py-2 text-sm font-500 border border-white/10 text-muted-foreground hover:text-foreground">Điều chỉnh</button>
            </div>
            <div className="space-y-1">
              {wallet.txns.slice(0, 8).map(t => (
                <div key={t.id} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{TXN_LABEL[t.type] ?? t.type}{t.note ? ` · ${t.note}` : ''}</span>
                  <span className={t.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}>{t.amount >= 0 ? '+' : ''}{formatVND(t.amount)}</span>
                </div>
              ))}
              {wallet.txns.length === 0 && <p className="text-2xs text-muted-foreground">Chưa có giao dịch</p>}
            </div>
          </div>
        )}
      </section>

      {pickMember && <MemberPicker title="Tra cứu ví thành viên" onPick={(m) => { setPickMember(false); loadWallet(m); }} onClose={() => setPickMember(false)} />}
      {topupFor && member && (
        <TopupForm mode={topupFor.mode} member={member}
          onClose={() => setTopupFor(null)}
          onDone={() => { setTopupFor(null); loadWallet(member); }} />
      )}
    </div>
  );
}

function TopupForm({ mode, member, onClose, onDone }: { mode: 'topup' | 'adjust'; member: Member; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'transfer'>('cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    const amt = parseVND(amount) * (mode === 'adjust' && amount.trim().startsWith('-') ? -1 : 1);
    if (mode === 'topup' && parseVND(amount) <= 0) { setErr('Nhập số tiền'); return; }
    setBusy(true); setErr('');
    try {
      await api.post('/api/solace/wallet/topup', {
        user_id: member.id, type: mode, amount: mode === 'adjust' ? amt : parseVND(amount), method, note: note || null,
      });
      onDone();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <Modal title={mode === 'topup' ? `Nạp tiền cho ${member.name}` : `Điều chỉnh ví ${member.name}`} onClose={onClose} onSave={save} busy={busy} saveLabel="Xác nhận">
      <Field label={mode === 'adjust' ? 'Số tiền (âm để trừ)' : 'Số tiền'}>
        <input autoFocus value={amount} onChange={e => setAmount(e.target.value)} className={INP} style={{ background: '#162033' }} />
      </Field>
      {mode === 'topup' && (
        <Field label="Hình thức">
          <div className="flex gap-2">
            {([['cash', 'Tiền mặt'], ['transfer', 'Chuyển khoản']] as const).map(([m, l]) => (
              <button key={m} onClick={() => setMethod(m)}
                className={`flex-1 rounded-xl px-2 py-2 text-xs border ${method === m ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground'}`}>{l}</button>
            ))}
          </div>
        </Field>
      )}
      <Field label="Ghi chú"><input value={note} onChange={e => setNote(e.target.value)} className={INP} style={{ background: '#162033' }} /></Field>
      {err && <p className="text-xs text-red-400">{err}</p>}
    </Modal>
  );
}
