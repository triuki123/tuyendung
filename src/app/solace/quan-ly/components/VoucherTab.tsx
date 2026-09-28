'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Pencil } from 'lucide-react';
import { formatVND, parseVND } from '@/lib/format';
import MoneyInput from '@/components/ui/MoneyInput';
import { api } from '../lib/solaceApi';
import { Modal, Field, INP } from './InventoryTab';
import { useConfirm } from '@/context/ConfirmContext';

interface Voucher {
  code: string; type: 'percent' | 'amount'; value: number; min_order: number;
  max_discount: number; usage_limit: number; used_count: number; is_active: boolean; expires_at: string | null;
}

export default function VoucherTab() {
  const confirm = useConfirm();
  const [list, setList] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<Voucher | null>(null);
  const [showNew, setShowNew] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await api.get<{ data: Voucher[] }>('/api/solace/vouchers'); setList(r.data); }
    catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const del = async (code: string) => {
    if (!(await confirm({ title: 'Xoá mã giảm giá?', message: `Xoá mã "${code}"?`, confirmLabel: 'Xoá', danger: true }))) return;
    await api.del(`/api/solace/vouchers/${encodeURIComponent(code)}`); load();
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Mã giảm giá khách nhập khi đặt món (webapp / bot Telegram).</p>
        <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-600 bg-indigo-600 text-white hover:bg-indigo-500">
          <Plus className="h-4 w-4" /> Thêm mã
        </button>
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}

      {list.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground"><span className="text-3xl opacity-30">🎁</span><p className="text-sm mt-3">Chưa có mã giảm giá</p></div>
      ) : (
        <div className="rounded-2xl border border-white/5 divide-y divide-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
          {list.map(v => (
            <div key={v.code} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-700 text-foreground">{v.code} {!v.is_active && <span className="text-2xs text-muted-foreground">(tắt)</span>}</p>
                <p className="text-2xs text-muted-foreground">
                  {v.type === 'percent' ? `Giảm ${v.value}%${v.max_discount > 0 ? ` (tối đa ${formatVND(v.max_discount)})` : ''}` : `Giảm ${formatVND(v.value)}`}
                  {v.min_order > 0 ? ` · đơn từ ${formatVND(v.min_order)}` : ''}
                  {v.usage_limit > 0 ? ` · đã dùng ${v.used_count}/${v.usage_limit}` : ` · đã dùng ${v.used_count}`}
                  {v.expires_at ? ` · HSD ${new Date(v.expires_at).toLocaleDateString('vi-VN')}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setEditing(v)} className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => del(v.code)} className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(showNew || editing) && <VoucherModal voucher={editing} onClose={() => { setShowNew(false); setEditing(null); }} onSaved={() => { setShowNew(false); setEditing(null); load(); }} />}
    </div>
  );
}

function VoucherModal({ voucher, onClose, onSaved }: { voucher: Voucher | null; onClose: () => void; onSaved: () => void }) {
  const e = voucher;
  const [code, setCode] = useState(e?.code ?? '');
  const [type, setType] = useState<'percent' | 'amount'>(e?.type ?? 'amount');
  const [value, setValue] = useState(String(e?.value ?? ''));
  const [minOrder, setMinOrder] = useState(String(e?.min_order ?? ''));
  const [maxDiscount, setMaxDiscount] = useState(String(e?.max_discount ?? ''));
  const [usageLimit, setUsageLimit] = useState(String(e?.usage_limit ?? ''));
  const [isActive, setIsActive] = useState(e?.is_active ?? true);
  const [expires, setExpires] = useState(e?.expires_at ? e.expires_at.slice(0, 10) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    if (!code.trim()) { setErr('Nhập mã'); return; }
    setBusy(true); setErr('');
    try {
      await api.post('/api/solace/vouchers', {
        code, type, value: type === 'percent' ? Number(value) || 0 : parseVND(value),
        min_order: parseVND(minOrder), max_discount: parseVND(maxDiscount),
        usage_limit: Number(usageLimit) || 0, is_active: isActive,
        expires_at: expires ? new Date(expires + 'T23:59:59').toISOString() : null,
      });
      onSaved();
    } catch (er) { setErr((er as Error).message); setBusy(false); }
  };

  return (
    <Modal title={e ? `Sửa mã ${e.code}` : 'Thêm mã giảm giá'} onClose={onClose} onSave={save} busy={busy}>
      <Field label="Mã (chữ HOA)"><input value={code} onChange={ev => setCode(ev.target.value.toUpperCase())} disabled={!!e} className={INP} style={{ background: '#162033' }} /></Field>
      <Field label="Loại giảm">
        <div className="flex gap-2">
          {([['amount', 'Số tiền'], ['percent', 'Phần trăm']] as const).map(([t, l]) => (
            <button key={t} onClick={() => setType(t)} className={`flex-1 rounded-xl px-2 py-2 text-xs border ${type === t ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground'}`}>{l}</button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={type === 'percent' ? 'Giảm (%)' : 'Giảm (đ)'}><input value={value} onChange={ev => setValue(ev.target.value)} className={INP} style={{ background: '#162033' }} /></Field>
        <Field label="Đơn tối thiểu (đ)"><input value={minOrder} onChange={ev => setMinOrder(ev.target.value)} className={INP} style={{ background: '#162033' }} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {type === 'percent' && <Field label="Giảm tối đa (đ, 0=∞)"><MoneyInput value={maxDiscount} onValueChange={(n) => setMaxDiscount(n ? String(n) : '')} className={INP} style={{ background: '#162033' }} /></Field>}
        <Field label="Giới hạn lượt (0=∞)"><input value={usageLimit} onChange={ev => setUsageLimit(ev.target.value)} className={INP} style={{ background: '#162033' }} /></Field>
      </div>
      <Field label="Hết hạn (tuỳ chọn)"><input type="date" value={expires} onChange={ev => setExpires(ev.target.value)} className={INP} style={{ background: '#162033' }} /></Field>
      <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={isActive} onChange={ev => setIsActive(ev.target.checked)} className="accent-indigo-500" /> Đang áp dụng</label>
      {err && <p className="text-xs text-red-400">{err}</p>}
    </Modal>
  );
}
