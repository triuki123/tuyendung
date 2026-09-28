'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X, Trash2, ImagePlus, Plus } from 'lucide-react';
import { parseVND, formatVND } from '@/lib/format';
import MoneyInput from '@/components/ui/MoneyInput';
import { api } from '../lib/solaceApi';
import { INP, Field } from './InventoryTab';
import type { SolaceCategory, SolaceProduct, SolaceOptionGroup } from '@/lib/services/solaceCatalogService';
import type { SolaceIngredient, RecipeItem } from '@/lib/services/solaceInventoryService';
import { useConfirm } from '@/context/ConfirmContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

interface Props {
  product: SolaceProduct | null;
  categories: SolaceCategory[];
  onClose: () => void;
  onSaved: () => void;
}

interface RecipeRow { ingredient_id: string; qty: string; wastage_pct: string; }

export default function ProductModal({ product, categories, onClose, onSaved }: Props) {
  const confirm = useConfirm();
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose);
  const editMode = !!product;
  const [name, setName] = useState(product?.name ?? '');
  const [categoryId, setCategoryId] = useState(product?.category_id ?? '');
  const [price, setPrice] = useState(String(product?.price ?? ''));
  const [description, setDescription] = useState(product?.description ?? '');
  const [trackRecipe, setTrackRecipe] = useState(product?.track_recipe ?? true);
  const [isActive, setIsActive] = useState(product?.is_active ?? true);

  const [allGroups, setAllGroups] = useState<SolaceOptionGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [ingredients, setIngredients] = useState<SolaceIngredient[]>([]);
  const [recipe, setRecipe] = useState<RecipeRow[]>([]);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(product?.has_image ? `/api/solace/products/${product.id}/image` : null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Tải nhóm tuỳ chọn + nguyên liệu (+ dữ liệu hiện có nếu sửa).
  useEffect(() => {
    (async () => {
      try {
        const [g, ing] = await Promise.all([
          api.get<{ data: SolaceOptionGroup[] }>('/api/solace/option-groups?all=1'),
          api.get<{ data: SolaceIngredient[] }>('/api/solace/ingredients').catch(() => ({ data: [] as SolaceIngredient[] })),
        ]);
        setAllGroups(g.data); setIngredients(ing.data);
        if (product) {
          const [og, rec] = await Promise.all([
            api.get<{ data: string[] }>(`/api/solace/products/${product.id}/option-groups`),
            api.get<{ data: RecipeItem[] }>(`/api/solace/products/${product.id}/recipe`),
          ]);
          setSelectedGroups(og.data);
          setRecipe(rec.data.map(r => ({ ingredient_id: r.ingredient_id, qty: String(r.qty), wastage_pct: String(r.wastage_pct) })));
        }
      } catch { /* để trống nếu lỗi tải phụ */ }
    })();
  }, [product]);

  const pickImage = (f: File | null) => {
    setImageFile(f);
    if (f) setImagePreview(URL.createObjectURL(f));
  };

  const removeImage = async () => {
    setImageFile(null); setImagePreview(null);
    if (fileRef.current) fileRef.current.value = '';
    if (editMode && product?.has_image) {
      try { await api.del(`/api/solace/products/${product.id}/image`); } catch { /* bỏ qua */ }
    }
  };

  const deleteProduct = async () => {
    if (!product || !(await confirm({ title: 'Xoá món?', message: `Xoá món "${product.name}"?`, confirmLabel: 'Xoá', danger: true }))) return;
    setBusy(true);
    try { await api.del(`/api/solace/products/${product.id}`); onSaved(); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  // Giá vốn ước tính theo công thức × giá vốn TB nguyên liệu × (1 + hao).
  const cogs = recipe.reduce((s, r) => {
    const ing = ingredients.find(x => x.id === r.ingredient_id);
    const q = Number(r.qty);
    if (!ing || !(q > 0)) return s;
    return s + q * (1 + (Number(r.wastage_pct) || 0) / 100) * Number(ing.avg_cost);
  }, 0);
  const priceNum = parseVND(price);
  const margin = priceNum > 0 ? Math.round((1 - cogs / priceNum) * 100) : 0;

  const toggleGroup = (id: string) =>
    setSelectedGroups(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const addRecipeRow = () => setRecipe(prev => [...prev, { ingredient_id: '', qty: '', wastage_pct: '0' }]);
  const updateRow = (i: number, patch: Partial<RecipeRow>) =>
    setRecipe(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const removeRow = (i: number) => setRecipe(prev => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!name.trim()) { setErr('Nhập tên món'); return; }
    setBusy(true); setErr('');
    try {
      const body = {
        name, category_id: categoryId || null, price: parseVND(price),
        description: description || null, track_recipe: trackRecipe, is_active: isActive,
      };
      let productId = product?.id;
      if (editMode) {
        await api.put(`/api/solace/products/${productId}`, body);
      } else {
        const r = await api.post<{ data: SolaceProduct }>('/api/solace/products', body);
        productId = r.data.id;
      }
      // Gắn nhóm tuỳ chọn
      await api.put(`/api/solace/products/${productId}/option-groups`, { groupIds: selectedGroups });
      // Công thức (chỉ dòng hợp lệ)
      const items = recipe
        .filter(r => r.ingredient_id && Number(r.qty) > 0)
        .map(r => ({ ingredient_id: r.ingredient_id, qty: Number(r.qty), wastage_pct: Number(r.wastage_pct) || 0 }));
      await api.put(`/api/solace/products/${productId}/recipe`, { items });
      // Ảnh
      if (imageFile) {
        const form = new FormData(); form.append('file', imageFile);
        await api.upload(`/api/solace/products/${productId}/image`, form);
      }
      markClean();
      onSaved();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={guardedClose}>
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 overflow-hidden max-h-[92vh] flex flex-col" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()} onChange={markDirty}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4 shrink-0">
          <h2 className="text-base font-700 text-foreground">{editMode ? 'Sửa món' : 'Thêm món'}</h2>
          <button onClick={guardedClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="flex gap-4">
            {/* Ảnh */}
            <div className="shrink-0">
              <div className="relative w-24 h-24">
                <button onClick={() => fileRef.current?.click()}
                  className="w-24 h-24 rounded-2xl border border-dashed border-white/15 bg-white/5 flex items-center justify-center overflow-hidden">
                  {imagePreview
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                    : <ImagePlus className="h-6 w-6 text-muted-foreground" />}
                </button>
                {imagePreview && (
                  <button onClick={removeImage} title="Gỡ ảnh"
                    className="absolute -top-2 -right-2 rounded-full p-1 bg-red-500 text-white shadow"><X className="h-3 w-3" /></button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => pickImage(e.target.files?.[0] ?? null)} />
              <p className="text-2xs text-muted-foreground text-center mt-1">Ảnh món</p>
            </div>
            {/* Tên + danh mục + giá */}
            <div className="flex-1 space-y-3">
              <Field label="Tên món"><input autoFocus value={name} onChange={e => setName(e.target.value)} className={INP} style={{ background: '#162033' }} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Danh mục">
                  <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={INP} style={{ background: '#162033' }}>
                    <option value="">— Không —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Giá (đ)"><MoneyInput value={price} onValueChange={(n) => setPrice(n ? String(n) : '')} className={INP} style={{ background: '#162033' }} /></Field>
              </div>
            </div>
          </div>

          <Field label="Mô tả"><input value={description} onChange={e => setDescription(e.target.value)} className={INP} style={{ background: '#162033' }} /></Field>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="accent-indigo-500" /> Đang bán
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={trackRecipe} onChange={e => setTrackRecipe(e.target.checked)} className="accent-indigo-500" /> Trừ kho theo công thức
            </label>
          </div>

          {/* Nhóm tuỳ chọn */}
          {allGroups.length > 0 && (
            <Field label="Nhóm tuỳ chọn áp dụng">
              <div className="flex flex-wrap gap-2">
                {allGroups.map(g => (
                  <button key={g.id} onClick={() => toggleGroup(g.id)}
                    className={`text-xs px-2.5 py-1 rounded-full border ${selectedGroups.includes(g.id) ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground'}`}>
                    {g.name}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {/* Công thức */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Công thức (định mức + khấu hao)</label>
              <button onClick={addRecipeRow} className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"><Plus className="h-3.5 w-3.5" /> Thêm nguyên liệu</button>
            </div>
            {cogs > 0 && (
              <p className="text-2xs text-muted-foreground">
                Giá vốn ước tính: <span className="text-amber-400 font-600">{formatVND(cogs)}</span>
                {priceNum > 0 && <> · Lãi gộp <span className={margin >= 0 ? 'text-emerald-400' : 'text-red-400'}>{margin}%</span></>}
              </p>
            )}
            {ingredients.length === 0 ? (
              <p className="text-2xs text-muted-foreground">Chưa có nguyên liệu — thêm ở tab Kho trước.</p>
            ) : recipe.length === 0 ? (
              <p className="text-2xs text-muted-foreground">Chưa khai báo công thức (món sẽ không trừ kho).</p>
            ) : (
              <div className="space-y-2">
                {recipe.map((r, i) => {
                  const ing = ingredients.find(x => x.id === r.ingredient_id);
                  return (
                    <div key={i} className="rounded-xl border border-white/5 p-2.5 space-y-2 sm:space-y-0 sm:p-0 sm:border-0 sm:flex sm:items-center sm:gap-2">
                      <select value={r.ingredient_id} onChange={e => updateRow(i, { ingredient_id: e.target.value })}
                        className="w-full sm:flex-1 rounded-lg px-2.5 py-1.5 text-sm text-foreground border border-white/10" style={{ background: '#162033' }}>
                        <option value="">— Chọn nguyên liệu —</option>
                        {ingredients.map(x => <option key={x.id} value={x.id}>{x.name} ({x.unit})</option>)}
                      </select>
                      <div className="flex items-center gap-2 min-w-0">
                        <input value={r.qty} onChange={e => updateRow(i, { qty: e.target.value })} placeholder="Định mức" inputMode="decimal"
                          className="flex-1 min-w-0 sm:w-24 sm:flex-none rounded-lg px-2.5 py-1.5 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />
                        {ing?.unit && <span className="text-2xs text-muted-foreground shrink-0">{ing.unit}</span>}
                        <input value={r.wastage_pct} onChange={e => updateRow(i, { wastage_pct: e.target.value })} placeholder="%hao" inputMode="numeric"
                          className="w-14 shrink-0 rounded-lg px-2 py-1.5 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />
                        <span className="text-2xs text-muted-foreground shrink-0">%</span>
                        <button onClick={() => removeRow(i)} className="text-muted-foreground hover:text-red-400 shrink-0 p-1"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/5 px-6 py-4 shrink-0">
          {editMode ? (
            <button disabled={busy} onClick={deleteProduct} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-red-400 hover:bg-red-500/10">
              <Trash2 className="h-4 w-4" /> Xoá món
            </button>
          ) : <span />}
          <div className="flex gap-3">
            <button onClick={guardedClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
            <button disabled={busy} onClick={save} className="rounded-xl px-4 py-2 text-sm font-600 bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">
              {busy ? 'Đang lưu…' : 'Lưu món'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
