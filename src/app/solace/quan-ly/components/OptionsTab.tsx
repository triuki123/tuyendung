'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, X, Check, Pencil, FlaskConical } from 'lucide-react';
import { formatVND, parseVND } from '@/lib/format';
import MoneyInput from '@/components/ui/MoneyInput';
import { api } from '../lib/solaceApi';
import type { SolaceOptionGroup } from '@/lib/services/solaceCatalogService';
import type { SolaceIngredient } from '@/lib/services/solaceInventoryService';
import { useConfirm } from '@/context/ConfirmContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

export default function OptionsTab() {
  const [groups, setGroups] = useState<SolaceOptionGroup[]>([]);
  const [ingredients, setIngredients] = useState<SolaceIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editGroup, setEditGroup] = useState<SolaceOptionGroup | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [r, ing] = await Promise.all([
        api.get<{ data: SolaceOptionGroup[] }>('/api/solace/option-groups?all=1'),
        api.get<{ data: SolaceIngredient[] }>('/api/solace/ingredients').catch(() => ({ data: [] as SolaceIngredient[] })),
      ]);
      setGroups(r.data); setIngredients(ing.data);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Nhóm tuỳ chọn (đường, đá, size, topping…) — gắn vào món ở tab Thực Đơn.</p>
        <button onClick={() => setShowAdd(true)} className="btn-accent inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-600 bg-indigo-600 text-white hover:bg-indigo-500">
          <Plus className="h-4 w-4" /> Thêm nhóm
        </button>
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}

      {groups.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground">
          <SlidersIcon /><p className="text-sm mt-3">Chưa có nhóm tuỳ chọn</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {groups.map(g => <GroupCard key={g.id} group={g} ingredients={ingredients} onChanged={load} onEdit={() => setEditGroup(g)} />)}
        </div>
      )}

      {(showAdd || editGroup) && (
        <GroupModal group={editGroup} onClose={() => { setShowAdd(false); setEditGroup(null); }}
          onSaved={() => { setShowAdd(false); setEditGroup(null); load(); }} />
      )}
    </div>
  );
}

function SlidersIcon() { return <span className="text-3xl opacity-30">🎚️</span>; }

function GroupCard({ group, ingredients, onChanged, onEdit }: { group: SolaceOptionGroup; ingredients: SolaceIngredient[]; onChanged: () => void; onEdit: () => void }) {
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [vName, setVName] = useState('');
  const [vPrice, setVPrice] = useState('');
  const [editVal, setEditVal] = useState<string | null>(null);
  const [eName, setEName] = useState('');
  const [ePrice, setEPrice] = useState('');
  const [recipeFor, setRecipeFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const addValue = async () => {
    if (!vName.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/solace/option-groups/${group.id}/values`, { name: vName, extra_price: parseVND(vPrice) });
      setVName(''); setVPrice(''); setAdding(false); onChanged();
    } finally { setBusy(false); }
  };
  const delValue = async (id: string) => { await api.del(`/api/solace/option-values/${id}`); onChanged(); };
  const startEditVal = (v: { id: string; name: string; extra_price: number }) => { setEditVal(v.id); setEName(v.name); setEPrice(String(v.extra_price)); };
  const saveEditVal = async (id: string) => {
    if (!eName.trim()) return;
    await api.put(`/api/solace/option-values/${id}`, { name: eName, extra_price: parseVND(ePrice) });
    setEditVal(null); onChanged();
  };
  const delGroup = async () => {
    if (!(await confirm({ title: 'Xoá nhóm tuỳ chọn?', message: `Xoá nhóm "${group.name}"?`, confirmLabel: 'Xoá', danger: true }))) return;
    await api.del(`/api/solace/option-groups/${group.id}`); onChanged();
  };
  const toggle = async () => { await api.put(`/api/solace/option-groups/${group.id}`, { is_active: !group.is_active }); onChanged(); };

  return (
    <div className="rounded-2xl border border-white/5 p-4" style={{ background: 'var(--card)' }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-600 text-foreground">{group.name}</h3>
            {!group.is_active && <span className="text-2xs px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">Tắt</span>}
          </div>
          <p className="text-2xs text-muted-foreground mt-0.5">
            {group.selection_type === 'single' ? 'Chọn 1' : 'Chọn nhiều'}{group.is_required ? ' · Bắt buộc' : ''}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onEdit} title="Sửa nhóm" className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={toggle} className="btn-ghost rounded-lg px-2 py-1 text-2xs text-muted-foreground hover:text-foreground">
            {group.is_active ? 'Tắt' : 'Bật'}
          </button>
          <button onClick={delGroup} className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {(group.values ?? []).map(v => (
          <div key={v.id}>
            {editVal === v.id ? (
              <div className="flex items-center gap-1.5">
                <input autoFocus value={eName} onChange={e => setEName(e.target.value)}
                  className="flex-1 rounded-lg px-2 py-1 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />
                <MoneyInput value={ePrice} onValueChange={(n) => setEPrice(n ? String(n) : '')} placeholder="+giá"
                  className="w-20 rounded-lg px-2 py-1 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />
                <button onClick={() => saveEditVal(v.id)} className="rounded-lg p-1 bg-indigo-600 text-white"><Check className="h-3.5 w-3.5" /></button>
                <button onClick={() => setEditVal(null)} className="rounded-lg p-1 text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-1.5 group/val">
                <span className="text-sm text-foreground">{v.name}</span>
                <div className="flex items-center gap-2">
                  {v.extra_price > 0 && <span className="text-xs text-amber-400">+{formatVND(v.extra_price)}</span>}
                  <button onClick={() => setRecipeFor(recipeFor === v.id ? null : v.id)} title="Định mức nguyên liệu"
                    className={recipeFor === v.id ? 'text-indigo-400' : 'text-muted-foreground hover:text-foreground'}><FlaskConical className="h-3.5 w-3.5" /></button>
                  <button onClick={() => startEditVal(v)} className="text-muted-foreground hover:text-foreground opacity-0 group-hover/val:opacity-100"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => delValue(v.id)} className="text-muted-foreground hover:text-red-400"><X className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            )}
            {recipeFor === v.id && <OptionRecipeEditor valueId={v.id} valueName={v.name} ingredients={ingredients} />}
          </div>
        ))}
        {(group.values ?? []).length === 0 && <p className="text-2xs text-muted-foreground">Chưa có lựa chọn</p>}
      </div>

      {adding ? (
        <div className="mt-2 flex items-center gap-2">
          <input autoFocus value={vName} onChange={e => setVName(e.target.value)} placeholder="Tên lựa chọn"
            className="flex-1 rounded-lg px-2.5 py-1.5 text-sm text-foreground" style={{ background: '#162033' }} />
          <MoneyInput value={vPrice} onValueChange={(n) => setVPrice(n ? String(n) : '')} placeholder="+giá"
            className="w-20 rounded-lg px-2.5 py-1.5 text-sm text-foreground" style={{ background: '#162033' }} />
          <button disabled={busy} onClick={addValue} className="rounded-lg p-1.5 bg-indigo-600 text-white"><Check className="h-4 w-4" /></button>
          <button onClick={() => setAdding(false)} className="rounded-lg p-1.5 text-muted-foreground"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
          <Plus className="h-3.5 w-3.5" /> Thêm lựa chọn
        </button>
      )}
    </div>
  );
}

interface ORRow { ingredient_id: string; qty: string; wastage_pct: string; }

/** Trình sửa định mức nguyên liệu trừ thêm khi khách chọn 1 tuỳ chọn (option value). */
function OptionRecipeEditor({ valueId, valueName, ingredients }: { valueId: string; valueName: string; ingredients: SolaceIngredient[] }) {
  const [rows, setRows] = useState<ORRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await api.get<{ data: { ingredient_id: string; qty: number; wastage_pct: number }[] }>(`/api/solace/option-values/${valueId}/recipe`);
        setRows(r.data.map(x => ({ ingredient_id: x.ingredient_id, qty: String(x.qty), wastage_pct: String(x.wastage_pct) })));
      } catch { /* để trống nếu lỗi tải */ }
      finally { setLoading(false); }
    })();
  }, [valueId]);

  const addRow = () => setRows(p => [...p, { ingredient_id: '', qty: '', wastage_pct: '0' }]);
  const updRow = (i: number, patch: Partial<ORRow>) => setRows(p => p.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const rmRow = (i: number) => setRows(p => p.filter((_, idx) => idx !== i));

  const save = async () => {
    setBusy(true); setSaved(false);
    try {
      const items = rows
        .filter(r => r.ingredient_id && Number(r.qty) > 0)
        .map(r => ({ ingredient_id: r.ingredient_id, qty: Number(r.qty), wastage_pct: Number(r.wastage_pct) || 0 }));
      await api.put(`/api/solace/option-values/${valueId}/recipe`, { items });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-1 mb-2 ml-2 rounded-lg border border-white/10 bg-black/20 p-2.5 space-y-2">
      <p className="text-2xs text-muted-foreground">Nguyên liệu trừ thêm khi khách chọn <span className="text-foreground font-500">&quot;{valueName}&quot;</span>.</p>
      {loading ? (
        <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : ingredients.length === 0 ? (
        <p className="text-2xs text-muted-foreground">Chưa có nguyên liệu — thêm ở tab Kho trước.</p>
      ) : (
        <>
          {rows.map((r, i) => {
            const ing = ingredients.find(x => x.id === r.ingredient_id);
            return (
              <div key={i} className="flex items-center gap-1.5">
                <select value={r.ingredient_id} onChange={e => updRow(i, { ingredient_id: e.target.value })}
                  className="flex-1 min-w-0 rounded-lg px-2 py-1 text-sm text-foreground border border-white/10" style={{ background: '#162033' }}>
                  <option value="">— Chọn nguyên liệu —</option>
                  {ingredients.map(x => <option key={x.id} value={x.id}>{x.name} ({x.unit})</option>)}
                </select>
                <input value={r.qty} onChange={e => updRow(i, { qty: e.target.value })} placeholder="ĐM" inputMode="decimal"
                  className="w-16 rounded-lg px-2 py-1 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />
                {ing?.unit && <span className="text-2xs text-muted-foreground shrink-0">{ing.unit}</span>}
                <input value={r.wastage_pct} onChange={e => updRow(i, { wastage_pct: e.target.value })} placeholder="%hao" inputMode="numeric"
                  className="w-12 rounded-lg px-1.5 py-1 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />
                <span className="text-2xs text-muted-foreground shrink-0">%</span>
                <button onClick={() => rmRow(i)} className="text-muted-foreground hover:text-red-400 shrink-0 p-1"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            );
          })}
          {rows.length === 0 && <p className="text-2xs text-muted-foreground">Chưa khai báo — tuỳ chọn này không trừ kho.</p>}
          <div className="flex items-center justify-between">
            <button onClick={addRow} className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"><Plus className="h-3.5 w-3.5" /> Thêm nguyên liệu</button>
            <div className="flex items-center gap-2">
              {saved && <span className="text-2xs text-emerald-400">Đã lưu</span>}
              <button disabled={busy} onClick={save} className="rounded-lg px-3 py-1 text-xs font-600 bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">{busy ? 'Đang lưu…' : 'Lưu định mức'}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function GroupModal({ group, onClose, onSaved }: { group: SolaceOptionGroup | null; onClose: () => void; onSaved: () => void }) {
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose);
  const editMode = !!group;
  const [name, setName] = useState(group?.name ?? '');
  const [selType, setSelType] = useState<'single' | 'multi'>(group?.selection_type ?? 'single');
  const [required, setRequired] = useState(group?.is_required ?? false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    if (!name.trim()) { setErr('Nhập tên nhóm'); return; }
    setBusy(true); setErr('');
    try {
      if (editMode) await api.put(`/api/solace/option-groups/${group!.id}`, { name, selection_type: selType, is_required: required });
      else await api.post('/api/solace/option-groups', { name, selection_type: selType, is_required: required });
      markClean();
      onSaved();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={guardedClose}>
      <div className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()} onChange={markDirty}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-base font-700 text-foreground">{editMode ? 'Sửa nhóm tuỳ chọn' : 'Thêm nhóm tuỳ chọn'}</h2>
          <button onClick={guardedClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <Field label="Tên nhóm">
            <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="VD: Đường, Đá, Size"
              className="w-full rounded-xl px-3 py-2 text-sm text-foreground" style={{ background: '#162033' }} />
          </Field>
          <Field label="Kiểu chọn">
            <div className="flex gap-2">
              {(['single', 'multi'] as const).map(t => (
                <button key={t} onClick={() => setSelType(t)}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm border ${selType === t ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground'}`}>
                  {t === 'single' ? 'Chọn 1' : 'Chọn nhiều'}
                </button>
              ))}
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} className="accent-indigo-500" />
            Bắt buộc chọn
          </label>
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button onClick={guardedClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button disabled={busy} onClick={save} className="rounded-xl px-4 py-2 text-sm font-600 bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">
            {busy ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}
