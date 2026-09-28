'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Minus, Trash2, X, Search, Save } from 'lucide-react';
import { formatVND } from '@/lib/format';
import { api } from '../../quan-ly/lib/solaceApi';
import OptionPicker, { type MenuProduct } from '../../components/OptionPicker';
import type { SolaceCategory, SolaceOptionValue } from '@/lib/services/solaceCatalogService';
import type { SolaceOrder } from '@/lib/services/solaceOrderService';
import { useToast } from '@/context/ToastContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { POS_MODAL_Z } from './modalLayers';

interface EditLine {
  key: string; product_id: string; name: string; unit_price: number;
  qty: number; option_value_ids: string[]; optionNames: string[]; note: string | null;
}

/** Bỏ dấu để tìm món không cần gõ dấu. */
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

/**
 * Sửa MÓN của 1 đơn CHƯA THU: tăng/giảm/xoá dòng, thêm món mới.
 * Lưu = thay toàn bộ danh sách (server reconcile kho + tính lại tiền).
 */
export default function EditOrderModal({ order, onClose, onSaved }: {
  order: SolaceOrder; onClose: () => void; onSaved: (o: SolaceOrder) => void;
}) {
  const toast = useToast();
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  const [categories, setCategories] = useState<SolaceCategory[]>([]);
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState('all');
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState<MenuProduct | null>(null);
  useEscapeKey(guardedClose, !picking);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const [lines, setLines] = useState<EditLine[]>(() =>
    (order.items ?? [])
      .filter(it => !!it.product_id)
      .map(it => ({
        key: it.id, product_id: it.product_id as string, name: it.name_snapshot, unit_price: Number(it.unit_price), qty: it.qty,
        option_value_ids: Array.isArray(it.options_json) ? (it.options_json as Array<{ value_id?: string }>).map(o => o.value_id).filter((x): x is string => !!x) : [],
        optionNames: Array.isArray(it.options_json) ? (it.options_json as Array<{ name: string }>).map(o => o.name) : [],
        note: it.note,
      }))
  );
  const droppedCount = (order.items ?? []).filter(it => !it.product_id).length;

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<{ data: { categories: SolaceCategory[]; products: MenuProduct[] } }>('/api/solace/pos-menu');
        setCategories(r.data.categories); setProducts(r.data.products);
      } catch (e) { setErr((e as Error).message); }
      finally { setLoading(false); }
    })();
  }, []);

  const q = norm(search.trim());
  const shown = products.filter(p => (activeCat === 'all' || p.category_id === activeCat) && (!q || norm(p.name).includes(q)));
  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.unit_price * l.qty, 0), [lines]);
  const discount = Math.max(0, Math.min(Number(order.discount), subtotal));
  const total = subtotal - discount + Number(order.delivery_fee);

  const newKey = () => `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const addLine = (p: MenuProduct, opts: SolaceOptionValue[], qty: number, note: string) => {
    markDirty();
    const extra = opts.reduce((s, o) => s + Number(o.extra_price), 0);
    setLines(prev => [...prev, {
      key: newKey(), product_id: p.id, name: p.name, unit_price: Number(p.price) + extra,
      qty, option_value_ids: opts.map(o => o.id), optionNames: opts.map(o => o.name), note: note || null,
    }]);
  };
  const clickProduct = (p: MenuProduct) => {
    if (p.available === false) return;
    if (p.optionGroups.length > 0) { setPicking(p); return; }
    markDirty();
    setLines(prev => {
      const i = prev.findIndex(l => l.product_id === p.id && l.option_value_ids.length === 0 && !l.note);
      if (i < 0) return [...prev, { key: newKey(), product_id: p.id, name: p.name, unit_price: Number(p.price), qty: 1, option_value_ids: [], optionNames: [], note: null }];
      const next = [...prev]; next[i] = { ...next[i], qty: next[i].qty + 1 }; return next;
    });
  };
  const setQty = (key: string, d: number) => { markDirty(); setLines(prev => prev.flatMap(l => {
    if (l.key !== key) return [l];
    const q2 = l.qty + d;
    return q2 < 1 ? [] : [{ ...l, qty: q2 }];
  })); };
  const removeLine = (key: string) => { markDirty(); setLines(prev => prev.filter(l => l.key !== key)); };

  const save = async () => {
    if (lines.length === 0) { setErr('Đơn phải còn ít nhất 1 món (huỷ đơn nếu muốn bỏ hết)'); return; }
    setSaving(true); setErr('');
    try {
      const r = await api.put<{ data: SolaceOrder; warnings: string[] }>(`/api/solace/orders/${order.id}/items`, {
        items: lines.map(l => ({ product_id: l.product_id, qty: l.qty, option_value_ids: l.option_value_ids, note: l.note })),
      });
      if ((r.warnings ?? []).length > 0) toast.warning('Cảnh báo kho: ' + r.warnings.join('; '));
      markClean();
      onSaved(r.data);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className={`fixed inset-0 ${POS_MODAL_Z.detail} flex items-end sm:items-center justify-center sm:p-4`} style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={() => { if (!picking) guardedClose(); }}>
      <div className="w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl border border-white/10 overflow-hidden max-h-[90vh] flex flex-col" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-3.5 shrink-0">
          <h2 className="text-base font-700 text-foreground">Sửa món · Đơn {order.code ?? ''}</h2>
          <button onClick={guardedClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-hidden flex-1 min-h-0">
          {/* Danh sách món trong đơn */}
          <div className="p-4 overflow-y-auto border-b lg:border-b-0 lg:border-r border-white/5">
            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider mb-2">Món trong đơn ({lines.length})</p>
            {droppedCount > 0 && <p className="text-2xs text-amber-400 mb-2">⚠️ {droppedCount} món cũ đã bị gỡ khỏi thực đơn — sẽ không còn trong đơn sau khi lưu.</p>}
            <div className="space-y-2">
              {lines.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">Đơn đang trống — thêm món bên phải.</p>
              ) : lines.map(l => (
                <div key={l.key} className="rounded-xl bg-white/5 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">{l.name}</p>
                      {l.optionNames.length > 0 && <p className="text-2xs text-muted-foreground">{l.optionNames.join(', ')}</p>}
                      {l.note && <p className="text-2xs text-muted-foreground italic">“{l.note}”</p>}
                    </div>
                    <button onClick={() => removeLine(l.key)} className="text-muted-foreground hover:text-red-400 shrink-0 p-1 -m-1"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setQty(l.key, -1)} className="rounded-lg p-2 bg-white/5 text-foreground active:bg-white/10"><Minus className="h-3.5 w-3.5" /></button>
                      <span className="text-sm text-foreground w-6 text-center">{l.qty}</span>
                      <button onClick={() => setQty(l.key, 1)} className="rounded-lg p-2 bg-white/5 text-foreground active:bg-white/10"><Plus className="h-3.5 w-3.5" /></button>
                    </div>
                    <span className="text-sm font-600 text-foreground">{formatVND(l.unit_price * l.qty)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Thêm món */}
          <div className="p-4 overflow-y-auto">
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm món để thêm…" inputMode="search"
                className="w-full rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground border border-white/10 focus:border-indigo-500 outline-none" style={{ background: '#162033' }} />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              <Chip active={activeCat === 'all'} onClick={() => setActiveCat('all')}>Tất cả</Chip>
              {categories.map(c => <Chip key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)}>{c.name}</Chip>)}
            </div>
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {shown.map(p => {
                  const out = p.available === false;
                  return (
                    <button key={p.id} disabled={out} onClick={() => clickProduct(p)}
                      className={`rounded-xl border border-white/5 p-2.5 text-left ${out ? 'opacity-50 cursor-not-allowed' : 'hover:border-indigo-500/40 active:opacity-80'}`} style={{ background: 'var(--card)' }}>
                      <p className="text-sm font-600 text-foreground line-clamp-1">{p.name}</p>
                      <p className="text-xs text-indigo-400 font-600">{out ? 'Tạm hết' : formatVND(p.price)}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/5 px-5 py-3 shrink-0 space-y-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          {err && <p className="text-xs text-red-400">{err}</p>}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Tạm tính {discount > 0 ? `· giảm ${formatVND(discount)}` : ''}</span>
            <span className="text-lg font-700 text-foreground">{formatVND(total)}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={guardedClose} className="flex-1 rounded-xl py-2.5 text-sm font-600 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5">Huỷ</button>
            <button onClick={save} disabled={saving || lines.length === 0}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-600 bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu thay đổi
            </button>
          </div>
        </div>
      </div>

      {picking && <OptionPicker product={picking} onClose={() => setPicking(null)}
        onAdd={(opts, qty, note) => { addLine(picking, opts, qty, note); setPicking(null); }} />}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-500 border ${active ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground hover:text-foreground'}`}>
      {children}
    </button>
  );
}
