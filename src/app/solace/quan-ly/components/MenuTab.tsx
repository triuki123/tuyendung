'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Loader2, Pencil, FolderPlus, X, Check, Trash2, ChevronUp, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { formatVND } from '@/lib/format';
import { api } from '../lib/solaceApi';
import type { SolaceCategory, SolaceProduct } from '@/lib/services/solaceCatalogService';
import ProductModal from './ProductModal';
import { useConfirm } from '@/context/ConfirmContext';

export default function MenuTab() {
  const confirm = useConfirm();
  const [categories, setCategories] = useState<SolaceCategory[]>([]);
  const [products, setProducts] = useState<SolaceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<SolaceProduct | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [addingCat, setAddingCat] = useState(false);
  const [catName, setCatName] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [c, p] = await Promise.all([
        api.get<{ data: SolaceCategory[] }>('/api/solace/categories?all=1'),
        api.get<{ data: SolaceProduct[] }>('/api/solace/products?all=1'),
      ]);
      setCategories(c.data); setProducts(p.data);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const addCat = async () => {
    if (!catName.trim()) return;
    await api.post('/api/solace/categories', { name: catName, sort_order: categories.length });
    setCatName(''); setAddingCat(false); load();
  };

  const toggleProduct = async (p: SolaceProduct) => {
    await api.put(`/api/solace/products/${p.id}`, { is_active: !p.is_active });
    load();
  };

  const renameCat = async (c: SolaceCategory, name: string) => {
    if (!name.trim() || name === c.name) return;
    await api.put(`/api/solace/categories/${c.id}`, { name }); load();
  };
  const toggleCat = async (c: SolaceCategory) => { await api.put(`/api/solace/categories/${c.id}`, { is_active: !c.is_active }); load(); };
  const deleteCat = async (c: SolaceCategory) => {
    if (!(await confirm({ title: 'Xoá danh mục?', message: `Xoá danh mục "${c.name}"? Món trong danh mục sẽ chuyển sang "Chưa phân loại".`, confirmLabel: 'Xoá', danger: true }))) return;
    await api.del(`/api/solace/categories/${c.id}`); load();
  };
  const moveCat = async (idx: number, dir: -1 | 1) => {
    const a = categories[idx], b = categories[idx + dir];
    if (!a || !b) return;
    await Promise.all([
      api.put(`/api/solace/categories/${a.id}`, { sort_order: b.sort_order }),
      api.put(`/api/solace/categories/${b.id}`, { sort_order: a.sort_order }),
    ]);
    load();
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const grouped = [
    ...categories.map(c => ({ cat: c, items: products.filter(p => p.category_id === c.id) })),
    { cat: null as SolaceCategory | null, items: products.filter(p => !p.category_id) },
  ].filter(g => g.items.length > 0 || g.cat);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Danh mục & món — giá, ảnh, tuỳ chọn, công thức, bật/tắt bán.</p>
        <div className="flex items-center gap-2">
          {addingCat ? (
            <div className="flex items-center gap-1.5">
              <input autoFocus value={catName} onChange={e => setCatName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCat()}
                placeholder="Tên danh mục" className="rounded-lg px-2.5 py-1.5 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />
              <button onClick={addCat} className="rounded-lg p-1.5 bg-indigo-600 text-white"><Check className="h-4 w-4" /></button>
              <button onClick={() => setAddingCat(false)} className="rounded-lg p-1.5 text-muted-foreground"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <button onClick={() => setAddingCat(true)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-500 border border-white/10 text-muted-foreground hover:text-foreground">
              <FolderPlus className="h-4 w-4" /> Danh mục
            </button>
          )}
          <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-600 bg-indigo-600 text-white hover:bg-indigo-500">
            <Plus className="h-4 w-4" /> Thêm món
          </button>
        </div>
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}

      {products.length === 0 && categories.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground">
          <span className="text-3xl opacity-30">☕</span>
          <p className="text-sm mt-3">Chưa có món nào</p>
          <p className="text-xs mt-1 opacity-60">Thêm danh mục rồi thêm món để bắt đầu</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(g => (
            <div key={g.cat?.id ?? 'none'}>
              {g.cat ? (
                <CategoryHeader cat={g.cat} idx={categories.findIndex(c => c.id === g.cat!.id)} total={categories.length}
                  onRename={renameCat} onToggle={toggleCat} onDelete={deleteCat} onMove={moveCat} />
              ) : (
                <h3 className="text-sm font-600 text-muted-foreground mb-2">Chưa phân loại</h3>
              )}
              {g.items.length === 0 ? (
                <p className="text-xs text-muted-foreground">Chưa có món trong danh mục này</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {g.items.map(p => (
                    <div key={p.id} className="rounded-2xl border border-white/5 overflow-hidden flex" style={{ background: 'var(--card)' }}>
                      <div className="w-20 h-20 shrink-0 bg-white/5 flex items-center justify-center overflow-hidden">
                        {p.has_image
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={`/api/solace/products/${p.id}/image`} alt={p.name} className="w-full h-full object-cover" />
                          : <span className="text-2xl opacity-30">☕</span>}
                      </div>
                      <div className="flex-1 min-w-0 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-600 text-foreground truncate">{p.name}</p>
                            <p className="text-sm text-indigo-400 font-600">{formatVND(p.price)}</p>
                            {(p.cost ?? 0) > 0 && (
                              <p className="text-2xs text-muted-foreground">
                                Vốn {formatVND(p.cost)} · Lãi {Math.round((1 - (p.cost ?? 0) / Math.max(p.price, 1)) * 100)}%
                              </p>
                            )}
                          </div>
                          <button onClick={() => setEditing(p)} className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-foreground shrink-0"><Pencil className="h-3.5 w-3.5" /></button>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <button onClick={() => toggleProduct(p)}
                            className={`text-2xs px-2 py-0.5 rounded-full border ${p.is_active ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-white/10 text-muted-foreground'}`}>
                            {p.is_active ? 'Đang bán' : 'Đã tắt'}
                          </button>
                          {!p.track_recipe && <span className="text-2xs text-muted-foreground">Không trừ kho</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {(showNew || editing) && (
        <ProductModal product={editing} categories={categories}
          onClose={() => { setShowNew(false); setEditing(null); }}
          onSaved={() => { setShowNew(false); setEditing(null); load(); }} />
      )}
    </div>
  );
}

function CategoryHeader({ cat, idx, total, onRename, onToggle, onDelete, onMove }: {
  cat: SolaceCategory; idx: number; total: number;
  onRename: (c: SolaceCategory, name: string) => void;
  onToggle: (c: SolaceCategory) => void;
  onDelete: (c: SolaceCategory) => void;
  onMove: (idx: number, dir: -1 | 1) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cat.name);

  return (
    <div className="flex items-center gap-2 mb-2 group/cat">
      {editing ? (
        <div className="flex items-center gap-1.5">
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { onRename(cat, name); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
            className="rounded-lg px-2 py-1 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />
          <button onClick={() => { onRename(cat, name); setEditing(false); }} className="rounded-lg p-1 bg-indigo-600 text-white"><Check className="h-3.5 w-3.5" /></button>
          <button onClick={() => { setName(cat.name); setEditing(false); }} className="rounded-lg p-1 text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <>
          <h3 className="text-sm font-600 text-foreground">{cat.name}</h3>
          {!cat.is_active && <span className="text-2xs px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">Đã ẩn</span>}
          <div className="flex items-center gap-0.5 opacity-0 group-hover/cat:opacity-100 transition-opacity">
            <button onClick={() => onMove(idx, -1)} disabled={idx <= 0} className="btn-ghost rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
            <button onClick={() => onMove(idx, 1)} disabled={idx >= total - 1} className="btn-ghost rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
            <button onClick={() => setEditing(true)} title="Đổi tên" className="btn-ghost rounded p-1 text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={() => onToggle(cat)} title={cat.is_active ? 'Ẩn' : 'Hiện'} className="btn-ghost rounded p-1 text-muted-foreground hover:text-foreground">{cat.is_active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>
            <button onClick={() => onDelete(cat)} title="Xoá" className="btn-ghost rounded p-1 text-muted-foreground hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </>
      )}
    </div>
  );
}
