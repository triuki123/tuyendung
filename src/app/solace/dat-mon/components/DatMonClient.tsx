'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Plus, Minus, Trash2, ShoppingBag, ClipboardList } from 'lucide-react';
import { formatVND } from '@/lib/format';
import { api } from '../../quan-ly/lib/solaceApi';
import OptionPicker, { type MenuProduct } from '../../components/OptionPicker';
import type { SolaceCategory, SolaceOptionValue } from '@/lib/services/solaceCatalogService';
import CheckoutSheet from './CheckoutSheet';
import { useConfirm } from '@/context/ConfirmContext';
import ErrorState from '@/components/ui/ErrorState';

interface CartLine { key: string; product: MenuProduct; qty: number; options: SolaceOptionValue[]; note: string; }

export default function DatMonClient() {
  const router = useRouter();
  const confirm = useConfirm();
  const [categories, setCategories] = useState<SolaceCategory[]>([]);
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeCat, setActiveCat] = useState('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [picking, setPicking] = useState<MenuProduct | null>(null);
  const [checkout, setCheckout] = useState(false);

  const loadMenu = React.useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const r = await api.get<{ data: { categories: SolaceCategory[]; products: MenuProduct[] } }>('/api/solace/pos-menu');
      setCategories(r.data.categories); setProducts(r.data.products);
    } catch (e) {
      console.error('Lỗi tải thực đơn:', e);
      setLoadError(true);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadMenu(); }, [loadMenu]);

  const shown = products.filter(p => activeCat === 'all' || p.category_id === activeCat);
  const count = cart.reduce((s, l) => s + l.qty, 0);
  const total = useMemo(() => cart.reduce((s, l) => s + linePrice(l) * l.qty, 0), [cart]);
  // Số lượng mỗi món đang có trong giỏ (gộp mọi tuỳ chọn) → stepper/badge trên dòng món.
  const qtyByProduct = useMemo(() => {
    const m: Record<string, number> = {};
    cart.forEach(l => { m[l.product.id] = (m[l.product.id] ?? 0) + l.qty; });
    return m;
  }, [cart]);

  const newKey = () => `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const add = (product: MenuProduct, options: SolaceOptionValue[], qty: number, note: string) =>
    setCart(prev => [...prev, { key: newKey(), product, options, qty, note }]);
  // Món KHÔNG tuỳ chọn: gộp về 1 dòng để tăng/giảm trực tiếp trên dòng món (kiểu Grab).
  const incProduct = (p: MenuProduct) => setCart(prev => {
    const i = prev.findIndex(l => l.product.id === p.id && l.options.length === 0 && !l.note);
    if (i < 0) return [...prev, { key: newKey(), product: p, options: [], qty: 1, note: '' }];
    const next = [...prev]; next[i] = { ...next[i], qty: next[i].qty + 1 }; return next;
  });
  const decProduct = (p: MenuProduct) => setCart(prev => {
    const i = prev.findIndex(l => l.product.id === p.id && l.options.length === 0 && !l.note);
    if (i < 0) return prev;
    if (prev[i].qty <= 1) return prev.filter((_, idx) => idx !== i);
    const next = [...prev]; next[i] = { ...next[i], qty: next[i].qty - 1 }; return next;
  });
  const clickProduct = (p: MenuProduct) => {
    if (p.available === false) return;
    if (p.optionGroups.length > 0) setPicking(p); else incProduct(p);
  };
  const setQty = (key: string, d: number) => setCart(prev => prev.map(l => l.key === key ? { ...l, qty: Math.max(1, l.qty + d) } : l));
  const removeLine = (key: string) => setCart(prev => prev.filter(l => l.key !== key));
  const clearCart = async () => { if (cart.length && await confirm({ title: 'Xoá giỏ hàng?', message: 'Xoá toàn bộ món trong giỏ hàng?', confirmLabel: 'Xoá', danger: true })) setCart([]); };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (loadError) return <ErrorState message="Không tải được thực đơn. Vui lòng thử lại." onRetry={loadMenu} />;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <Link href="/solace" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Quán Solace
        </Link>
        <Link href="/solace/don-cua-toi" className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300">
          <ClipboardList className="h-3.5 w-3.5" /> Đơn của tôi
        </Link>
      </div>

      <div>
        <h1 className="text-xl sm:text-2xl font-700 text-foreground">Đặt Đồ Uống</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">Chọn món yêu thích & nhận tại quán Solace</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 sticky top-0 z-10 py-1" style={{ background: 'var(--background)' }}>
        <Chip active={activeCat === 'all'} onClick={() => setActiveCat('all')}>Tất cả</Chip>
        {categories.map(c => <Chip key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)}>{c.name}</Chip>)}
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground"><span className="text-3xl opacity-30">☕</span><p className="text-sm mt-3">Chưa có món</p></div>
      ) : (
        <div className="space-y-2.5">
          {shown.map(p => {
            const out = p.available === false;
            const inCart = qtyByProduct[p.id] ?? 0;
            const hasOpts = p.optionGroups.length > 0;
            return (
              <div key={p.id}
                className={`w-full flex items-center gap-3 rounded-2xl border border-white/5 p-2.5 transition-colors ${out ? 'opacity-50' : 'hover:border-indigo-500/40'}`}
                style={{ background: 'var(--card)' }}>
                <button onClick={() => clickProduct(p)} disabled={out}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left disabled:cursor-not-allowed">
                  <div className="w-16 h-16 rounded-xl bg-white/5 flex items-center justify-center overflow-hidden shrink-0">
                    {p.has_image
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={`/api/solace/products/${p.id}/image`} alt={p.name} className="w-full h-full object-cover" />
                      : <span className="text-2xl opacity-30">☕</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-600 text-foreground">{p.name}</p>
                    {p.description && <p className="text-2xs text-muted-foreground line-clamp-1">{p.description}</p>}
                    <p className="text-sm text-indigo-400 font-600 mt-0.5">{formatVND(p.price)}</p>
                  </div>
                </button>
                {out ? (
                  <span className="text-2xs text-amber-400 shrink-0">Tạm hết</span>
                ) : (!hasOpts && inCart > 0) ? (
                  <QtyStepper qty={inCart} onDec={() => decProduct(p)} onInc={() => incProduct(p)} />
                ) : (
                  <div className="relative shrink-0">
                    <button onClick={() => clickProduct(p)} className="rounded-full p-1.5 bg-indigo-600 text-white hover:bg-indigo-500"><Plus className="h-4 w-4" /></button>
                    {inCart > 0 && <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full text-2xs font-700 bg-emerald-500 text-white">{inCart}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Thanh giỏ hàng nổi */}
      {count > 0 && (
        <>
          {/* Nút xoá toàn bộ giỏ — phía trên thanh giỏ hàng */}
          <button onClick={clearCart}
            className="fixed right-4 sm:right-8 z-40 inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-600 bg-red-600/90 text-white shadow-lg hover:bg-red-600"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 7.5rem)' }}>
            <Trash2 className="h-3.5 w-3.5" /> Xoá giỏ
          </button>
          <button onClick={() => setCheckout(true)}
            className="fixed left-4 right-4 sm:left-auto sm:right-8 sm:w-80 z-40 flex items-center justify-between rounded-2xl px-4 py-3.5 bg-indigo-600 text-white shadow-lg hover:bg-indigo-500 active:bg-indigo-500"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4rem)' }}>
            <span className="flex items-center gap-2"><ShoppingBag className="h-5 w-5" /> {count} món</span>
            <span className="font-700">{formatVND(total)}</span>
          </button>
        </>
      )}

      {picking && <OptionPicker product={picking} onClose={() => setPicking(null)}
        onAdd={(opts, qty, note) => { add(picking, opts, qty, note); setPicking(null); }} />}

      {checkout && (
        <CheckoutSheet cart={cart} total={total}
          onClose={() => setCheckout(false)}
          onQty={setQty} onRemove={removeLine}
          onDone={() => { setCart([]); setCheckout(false); router.push('/solace/don-cua-toi'); }} />
      )}
    </div>
  );
}

function linePrice(l: CartLine): number {
  return Number(l.product.price) + l.options.reduce((s, o) => s + Number(o.extra_price), 0);
}

/** Stepper − N + trên dòng món (món không tuỳ chọn đã có trong giỏ). */
function QtyStepper({ qty, onDec, onInc }: { qty: number; onDec: () => void; onInc: () => void }) {
  return (
    <div className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-indigo-600 text-white p-0.5">
      <button onClick={onDec} className="rounded-full p-1.5 hover:bg-white/20 active:bg-white/30"><Minus className="h-3.5 w-3.5" /></button>
      <span className="text-sm font-700 min-w-[1.25rem] text-center">{qty}</span>
      <button onClick={onInc} className="rounded-full p-1.5 hover:bg-white/20 active:bg-white/30"><Plus className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-500 border ${active ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground'}`}>
      {children}
    </button>
  );
}

export type { CartLine };
export { linePrice };
