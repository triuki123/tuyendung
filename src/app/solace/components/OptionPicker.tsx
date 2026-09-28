'use client';

import React, { useState } from 'react';
import { X, Plus, Minus } from 'lucide-react';
import { formatVND } from '@/lib/format';
import type { SolaceProduct, SolaceOptionGroup, SolaceOptionValue } from '@/lib/services/solaceCatalogService';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { POS_MODAL_Z } from '../pos/components/modalLayers';

export type MenuProduct = SolaceProduct & { optionGroups: SolaceOptionGroup[]; available?: boolean };

/** Chọn tuỳ chọn (đường/đá/size…) + số lượng + ghi chú cho 1 món — dùng chung POS & webapp. */
export default function OptionPicker({ product, onClose, onAdd }: {
  product: MenuProduct; onClose: () => void; onAdd: (opts: SolaceOptionValue[], qty: number, note: string) => void;
}) {
  useEscapeKey(onClose);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

  const toggle = (g: SolaceOptionGroup, valueId: string) => {
    setSelected(prev => {
      const cur = prev[g.id] ?? [];
      if (g.selection_type === 'single') return { ...prev, [g.id]: [valueId] };
      return { ...prev, [g.id]: cur.includes(valueId) ? cur.filter(x => x !== valueId) : [...cur, valueId] };
    });
  };

  const chosen: SolaceOptionValue[] = product.optionGroups.flatMap(g =>
    (g.values ?? []).filter(v => (selected[g.id] ?? []).includes(v.id)));
  const extra = chosen.reduce((s, o) => s + Number(o.extra_price), 0);

  const confirm = () => {
    const missing = product.optionGroups.find(g => g.is_required && (selected[g.id] ?? []).length === 0);
    if (missing) { setErr(`Vui lòng chọn: ${missing.name}`); return; }
    onAdd(chosen, qty, note);
  };

  return (
    <div className={`fixed inset-0 ${POS_MODAL_Z.picker} flex items-end sm:items-center justify-center sm:p-4`} style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-white/10 overflow-hidden max-h-[90vh] flex flex-col" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4 shrink-0">
          <div>
            <h2 className="text-base font-700 text-foreground">{product.name}</h2>
            <p className="text-sm text-indigo-400 font-600">{formatVND(Number(product.price) + extra)}</p>
          </div>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          {product.optionGroups.map(g => (
            <div key={g.id}>
              <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider mb-2">
                {g.name}{g.is_required && <span className="text-red-400"> *</span>}
                <span className="ml-1 normal-case font-400">({g.selection_type === 'single' ? 'chọn 1' : 'chọn nhiều'})</span>
              </p>
              <div className="space-y-1.5">
                {(g.values ?? []).map(v => {
                  const on = (selected[g.id] ?? []).includes(v.id);
                  return (
                    <button key={v.id} onClick={() => toggle(g, v.id)}
                      className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-sm border ${on ? 'border-indigo-500 bg-indigo-500/10 text-foreground' : 'border-white/10 text-muted-foreground'}`}>
                      <span>{v.name}</span>
                      {Number(v.extra_price) > 0 && <span className="text-amber-400 text-xs">+{formatVND(v.extra_price)}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div>
            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider mb-2">Ghi chú</p>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="VD: ít đá, mang đi…"
              className="w-full rounded-xl px-3 py-2 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-white/5 px-6 py-4 shrink-0"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <div className="flex items-center gap-2">
            <button onClick={() => setQty(q => Math.max(1, q - 1))} className="rounded-lg p-1.5 bg-white/5 text-foreground"><Minus className="h-4 w-4" /></button>
            <span className="text-sm text-foreground w-6 text-center">{qty}</span>
            <button onClick={() => setQty(q => q + 1)} className="rounded-lg p-1.5 bg-white/5 text-foreground"><Plus className="h-4 w-4" /></button>
          </div>
          <button onClick={confirm} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-600 bg-indigo-600 text-white hover:bg-indigo-500">
            Thêm · {formatVND((Number(product.price) + extra) * qty)}
          </button>
        </div>
      </div>
    </div>
  );
}
