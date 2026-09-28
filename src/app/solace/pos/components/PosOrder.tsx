'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, Minus, Trash2, X, ShoppingBag, Search } from 'lucide-react';
import { formatVND, parseVND } from '@/lib/format';
import MoneyInput from '@/components/ui/MoneyInput';
import { api } from '../../quan-ly/lib/solaceApi';
import { printInvoice } from '../lib/printInvoice';
import CashPaymentModal from './CashPaymentModal';
import MemberPicker, { type Member } from './MemberPicker';
import VietQrModal from './VietQrModal';
import OptionPicker, { type MenuProduct } from '../../components/OptionPicker';
import type { SolaceCategory, SolaceOptionValue } from '@/lib/services/solaceCatalogService';
import type { SolaceOrder } from '@/lib/services/solaceOrderService';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface CartLine { key: string; product: MenuProduct; qty: number; options: SolaceOptionValue[]; note: string; }

export default function PosOrder({ onCreated }: { onCreated: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [categories, setCategories] = useState<SolaceCategory[]>([]);
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [picking, setPicking] = useState<MenuProduct | null>(null);
  const [showCartSheet, setShowCartSheet] = useState(false); // mobile: mở bottom-sheet giỏ hàng

  const [fulfillment, setFulfillment] = useState<'counter' | 'dine_in'>('counter');
  const [floorNote, setFloorNote] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [discount, setDiscount] = useState('');
  const [voucherCode, setVoucherCode] = useState('');
  const [showCash, setShowCash] = useState(false);
  const [showMember, setShowMember] = useState(false);
  const [vietqrOrder, setVietqrOrder] = useState<SolaceOrder | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const submitLockRef = useRef(false);

  // ESC đóng bottom-sheet giỏ hàng (không khi đang mở sub-modal hoặc đang gửi).
  useEscapeKey(() => setShowCartSheet(false),
    showCartSheet && !picking && !showCash && !showMember && !vietqrOrder && !submitting);

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
  const shown = useMemo(() => {
    const base = products.filter(p => !q || norm(p.name).includes(q));
    if (activeCat === 'top') {
      // Thao tác nhanh: ghim món bán chạy nhất lên đầu (theo lượt đã bán).
      return [...base].sort((a, b) => Number(b.sold_count) - Number(a.sold_count)).slice(0, 12);
    }
    if (activeCat === 'all') return base;
    return base.filter(p => p.category_id === activeCat);
  }, [products, q, activeCat]);
  // Số lượng mỗi món đang có trong giỏ (gộp mọi tuỳ chọn) → badge trên thẻ món.
  const qtyByProduct = useMemo(() => {
    const m: Record<string, number> = {};
    cart.forEach(l => { m[l.product.id] = (m[l.product.id] ?? 0) + l.qty; });
    return m;
  }, [cart]);
  const subtotal = useMemo(() => cart.reduce((s, l) => s + linePrice(l) * l.qty, 0), [cart]);
  const discountVal = Math.max(0, Math.min(parseVND(discount), subtotal));
  const total = subtotal - discountVal;

  const newKey = () => `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const addToCart = (product: MenuProduct, options: SolaceOptionValue[], qty: number, note: string) => {
    setCart(prev => [...prev, { key: newKey(), product, options, qty, note }]);
  };
  // Món KHÔNG tuỳ chọn: gộp về 1 dòng để tăng/giảm trực tiếp trên thẻ món (kiểu Grab).
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
    if (p.available === false) return; // món tạm hết → không cho chọn
    if (p.optionGroups.length > 0) setPicking(p);
    else incProduct(p);
  };
  const setQty = (key: string, d: number) => setCart(prev => prev.map(l => l.key === key ? { ...l, qty: Math.max(1, l.qty + d) } : l));
  const removeLine = (key: string) => setCart(prev => prev.filter(l => l.key !== key));
  const clearCart = async () => { if (cart.length && await confirm({ title: 'Xoá giỏ hàng?', message: 'Xoá toàn bộ món trong giỏ hàng?', confirmLabel: 'Xoá', danger: true })) setCart([]); };

  const validate = () => {
    if (cart.length === 0) { setErr('Giỏ hàng trống'); return false; }
    if (fulfillment === 'dine_in' && !floorNote.trim()) { setErr('Nhập tầng/vị trí khi nhận tại chỗ'); return false; }
    return true;
  };

  /** Tạo đơn (server trừ kho + tính giá). Trả order hoặc null nếu lỗi. */
  const createOrder = async (
    paid: boolean,
    customerUserId: string | null,
    method: string,
    paymentStatus?: 'unpaid' | 'debt'
  ): Promise<SolaceOrder | null> => {
    const r = await api.post<{ data: SolaceOrder; warnings: string[] }>('/api/solace/orders', {
      fulfillment_type: fulfillment, floor_note: floorNote || null, customer_name: customerName || null,
      payment_method: method, paid, discount: discountVal, voucher_code: voucherCode.trim() || null, customer_user_id: customerUserId,
      paymentStatus,
      note: orderNote.trim() || null,
      items: cart.map(l => ({ product_id: l.product.id, qty: l.qty, option_value_ids: l.options.map(o => o.id), note: l.note || null })),
    });
    if ((r.warnings ?? []).length > 0) toast.warning('Cảnh báo kho: ' + r.warnings.join('; '));
    return r.data;
  };

  const finish = (order: SolaceOrder) => {
    setCart([]); setFloorNote(''); setCustomerName(''); setOrderNote(''); setFulfillment('counter'); setDiscount(''); setVoucherCode('');
    setShowCash(false); setShowMember(false); setShowCartSheet(false);
    onCreated();
    void (async () => {
      if (await confirm({ title: 'Tạo đơn thành công', message: 'In hoá đơn?', confirmLabel: 'In hoá đơn' })) {
        printInvoice(order);
      }
    })();
  };

  // Tiền mặt (đã thu) / Ghi nợ.
  const submit = async (paid: boolean) => {
    if (submitLockRef.current) return;
    if (!validate()) return;
    submitLockRef.current = true;
    setSubmitting(true); setErr('');
    try {
      const o = await createOrder(paid, null, 'cash');
      if (o) await finish(o);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  };

  // Thanh toán bằng ví của 1 thành viên.
  const payWallet = async (member: Member) => {
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true); setErr('');
    let created: SolaceOrder | null = null;
    try {
      created = await createOrder(false, member.id, 'wallet');
      if (!created) return;
      await api.post(`/api/solace/orders/${created.id}/pay`, { method: 'wallet', customer_user_id: member.id });
      await finish(created);
    } catch (e) {
      // Trả ví thất bại (vd không đủ số dư) → huỷ đơn vừa tạo để hoàn kho, tránh trừ kho 2 lần.
      if (created) { try { await api.patch(`/api/solace/orders/${created.id}`, { status: 'cancelled' }); } catch { /* bỏ qua */ } }
      setErr((e as Error).message); setShowMember(false);
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  };

  // Chuyển khoản VietQR: tạo đơn (chưa thu) rồi mở QR để xác nhận.
  const startVietqr = async () => {
    if (submitLockRef.current) return;
    if (!validate()) return;
    submitLockRef.current = true;
    setSubmitting(true); setErr('');
    try {
      const o = await createOrder(false, null, 'bankqr');
      if (o) setVietqrOrder(o);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  // Nội dung giỏ hàng — dùng lại cho cột phải (desktop) và bottom-sheet (mobile).
  const cartBody = (
    <>
      <div className="flex items-center gap-2 mb-3">
        <ShoppingBag className="h-4 w-4 text-indigo-400" />
        <h3 className="text-base font-600 text-foreground">Giỏ hàng</h3>
        <span className="text-xs text-muted-foreground">({cart.length})</span>
        {cart.length > 0 && (
          <button onClick={clearCart}
            className="ml-auto inline-flex items-center gap-1 text-2xs font-600 text-red-400 hover:text-red-300">
            <Trash2 className="h-3.5 w-3.5" /> Xoá tất cả
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 space-y-2 overflow-y-auto -mx-1 px-1">
        {cart.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">Chọn món để thêm vào giỏ</p>
        ) : cart.map(l => (
          <div key={l.key} className="rounded-xl bg-white/5 p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-foreground">{l.product.name}</p>
                {l.options.length > 0 && <p className="text-2xs text-muted-foreground">{l.options.map(o => o.name).join(', ')}</p>}
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
              <span className="text-sm font-600 text-foreground">{formatVND(linePrice(l) * l.qty)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-white/5 mt-3 pt-3 space-y-3 shrink-0">
        {/* Nhận tại đâu */}
        <div className="flex gap-2">
          {([['counter', 'Tại quầy'], ['dine_in', 'Tại chỗ']] as const).map(([t, l]) => (
            <button key={t} onClick={() => setFulfillment(t)}
              className={`flex-1 rounded-xl px-2 py-2.5 text-sm border ${fulfillment === t ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground'}`}>{l}</button>
          ))}
        </div>
        {fulfillment === 'dine_in' && (
          <input value={floorNote} onChange={e => setFloorNote(e.target.value)} placeholder="Tầng / vị trí (bắt buộc)"
            className="w-full rounded-xl px-3 py-2.5 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />
        )}
        <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Tên khách (tuỳ chọn)"
          className="w-full rounded-xl px-3 py-2.5 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />
        <input value={orderNote} onChange={e => setOrderNote(e.target.value)} placeholder="Ghi chú đơn (tuỳ chọn) — vd: giao gấp, gói riêng…"
          className="w-full rounded-xl px-3 py-2.5 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />

        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground shrink-0">Giảm giá</span>
          <MoneyInput value={discount} onValueChange={(n) => setDiscount(n ? String(n) : '')} placeholder="0"
            className="w-28 rounded-lg px-2.5 py-2 text-sm text-foreground border border-white/10 text-right" style={{ background: '#162033' }} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground shrink-0">Mã giảm giá / quà</span>
          <input value={voucherCode} onChange={e => setVoucherCode(e.target.value.toUpperCase())} placeholder="Nhập mã (nếu có)"
            className="w-40 rounded-lg px-2.5 py-2 text-sm text-foreground border border-white/10 text-right uppercase" style={{ background: '#162033' }} />
        </div>

        {discountVal > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Tạm tính</span><span>{formatVND(subtotal)}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Tổng cộng</span>
          <span className="text-lg font-700 text-foreground">{formatVND(total)}</span>
        </div>

        {err && <p className="text-xs text-red-400">{err}</p>}

        <div className="grid grid-cols-2 gap-2">
          <button disabled={submitting || cart.length === 0} onClick={() => { setErr(''); if (validate()) setShowCash(true); }}
            className="rounded-xl px-3 py-3 text-sm font-600 bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">
            Tiền mặt
          </button>
          <button disabled={submitting || cart.length === 0} onClick={() => { setErr(''); if (validate()) setShowMember(true); }}
            className="rounded-xl px-3 py-3 text-sm font-600 bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50">
            Ví tín dụng
          </button>
          <button disabled={submitting || cart.length === 0} onClick={startVietqr}
            className="rounded-xl px-3 py-3 text-sm font-600 border border-sky-500/30 text-sky-400 hover:bg-sky-500/10 disabled:opacity-50">
            Chuyển khoản (VietQR)
          </button>
          <button disabled={submitting || cart.length === 0}
            onClick={async () => {
              setErr('');
              if (!validate()) return;
              if (await confirm({ title: 'Tạo đơn ghi nợ?', message: `Tạo đơn GHI NỢ ${formatVND(total)}${customerName ? ` cho ${customerName}` : ''}? Khách sẽ trả sau.`, confirmLabel: 'Ghi nợ', danger: true })) {
                if (submitLockRef.current) return;
                submitLockRef.current = true;
                setSubmitting(true);
                try {
                  const o = await createOrder(false, null, 'cash', 'debt');
                  if (o) await finish(o);
                } catch (e) {
                  setErr((e as Error).message);
                } finally {
                  setSubmitting(false);
                  submitLockRef.current = false;
                }
              }
            }}
            className="rounded-xl px-3 py-3 text-sm font-600 border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 disabled:opacity-50">
            Ghi nợ / thu sau
          </button>
        </div>
      </div>
    </>
  );

  const totalQty = cart.reduce((s, l) => s + l.qty, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
      {/* Menu */}
      <div className="space-y-3 pb-24 lg:pb-0">
        {/* Tìm món */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm món…" inputMode="search"
            className="w-full rounded-xl pl-9 pr-9 py-2.5 text-sm text-foreground border border-white/10 focus:border-indigo-500 outline-none" style={{ background: '#162033' }} />
          {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <CatChip active={activeCat === 'top'} onClick={() => setActiveCat('top')}>⭐ Bán chạy</CatChip>
          <CatChip active={activeCat === 'all'} onClick={() => setActiveCat('all')}>Tất cả</CatChip>
          {categories.map(c => <CatChip key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)}>{c.name}</CatChip>)}
        </div>
        {shown.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-muted-foreground"><span className="text-3xl opacity-30">{search ? '🔍' : '☕'}</span><p className="text-sm mt-3">{search ? `Không tìm thấy món “${search}”` : 'Chưa có món đang bán'}</p></div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
            {shown.map(p => {
              const out = p.available === false;
              const inCart = qtyByProduct[p.id] ?? 0;
              const hasOpts = p.optionGroups.length > 0;
              return (
                <div key={p.id}
                  className={`relative rounded-2xl border border-white/5 overflow-hidden transition-colors ${out ? 'opacity-50' : 'hover:border-indigo-500/40'}`} style={{ background: 'var(--card)' }}>
                  <button disabled={out} onClick={() => clickProduct(p)}
                    className="block w-full text-left disabled:cursor-not-allowed active:opacity-80">
                    <div className="aspect-square bg-white/5 flex items-center justify-center overflow-hidden">
                      {p.has_image
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={`/api/solace/products/${p.id}/image`} alt={p.name} className="w-full h-full object-cover" />
                        : <span className="text-3xl opacity-30">☕</span>}
                    </div>
                    <div className="p-2.5">
                      <p className="text-sm font-600 text-foreground line-clamp-1">{p.name}</p>
                      <p className="text-sm text-indigo-400 font-600">{formatVND(p.price)}</p>
                    </div>
                  </button>
                  {/* Món có tuỳ chọn → badge đếm (mỗi tuỳ chọn là 1 dòng riêng) */}
                  {hasOpts && inCart > 0 && <span className="absolute top-1.5 left-1.5 inline-flex items-center justify-center min-w-[1.4rem] h-6 px-1.5 rounded-full text-xs font-700 bg-indigo-600 text-white shadow">{inCart}</span>}
                  {out && <span className="absolute top-1.5 right-1.5 text-2xs font-700 px-2 py-0.5 rounded-full bg-red-500/90 text-white">Tạm hết</span>}
                  {/* Món không tuỳ chọn & đã có trong giỏ → stepper trực tiếp trên thẻ */}
                  {!out && !hasOpts && inCart > 0 && (
                    <div className="absolute bottom-2 right-2">
                      <QtyStepper qty={inCart} onDec={() => decProduct(p)} onInc={() => incProduct(p)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Giỏ hàng — giữ nguyên cột phải và bám tại vị trí đó khi cuộn menu */}
      <div
        className="hidden lg:flex rounded-2xl border border-white/5 p-4 flex-col h-fit lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)]"
        style={{ background: 'var(--card)' }}
      >
        {cartBody}
      </div>

      {/* Mobile: thanh giỏ hàng nổi → mở bottom-sheet */}
      {cart.length > 0 && !showCartSheet && (
        <button onClick={() => setShowCartSheet(true)}
          className="lg:hidden fixed inset-x-0 z-40 mx-3 flex items-center justify-between gap-3 rounded-2xl bg-indigo-600 px-4 py-3.5 text-white shadow-lg shadow-black/30 active:bg-indigo-500"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4.75rem)' }}>
          <span className="flex items-center gap-2 text-sm font-600"><ShoppingBag className="h-4 w-4" /> {totalQty} món trong giỏ</span>
          <span className="text-base font-700">{formatVND(total)}</span>
        </button>
      )}

      {/* Mobile: bottom-sheet giỏ hàng */}
      {showCartSheet && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowCartSheet(false)}>
          <div className="w-full rounded-t-3xl border-t border-white/10 max-h-[88vh] overflow-y-auto p-4"
            style={{ background: 'var(--card)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
            onClick={e => e.stopPropagation()}>
            <div className="relative mb-3">
              <div className="mx-auto h-1 w-10 rounded-full bg-white/15" />
              <button onClick={() => setShowCartSheet(false)} className="absolute -top-1 right-0 p-1 text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            {cartBody}
          </div>
        </div>
      )}

      {picking && <OptionPicker product={picking} onClose={() => setPicking(null)}
        onAdd={(opts, qty, note) => { addToCart(picking, opts, qty, note); setPicking(null); }} />}

      {showCash && (
        <CashPaymentModal total={total} busy={submitting}
          onConfirm={() => submit(true)} onClose={() => setShowCash(false)} />
      )}
      {showMember && (
        <MemberPicker title="Chọn thành viên trả bằng ví"
          onPick={(m) => payWallet(m)} onClose={() => setShowMember(false)} />
      )}
      {vietqrOrder && (
        <VietQrModal orderId={vietqrOrder.id} orderCode={vietqrOrder.code}
          onPaid={() => { const o = vietqrOrder; setVietqrOrder(null); finish(o); }}
          onClose={() => { setVietqrOrder(null); finish(vietqrOrder); }} />
      )}
    </div>
  );
}

function linePrice(l: CartLine): number {
  return Number(l.product.price) + l.options.reduce((s, o) => s + Number(o.extra_price), 0);
}

/** Bỏ dấu + thường hoá để tìm món không cần gõ dấu. */
function norm(s: string): string {
  // ̀-ͯ = dấu thanh tổ hợp (combining diacritics)
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

/** Stepper − N + nổi trên thẻ món. stopPropagation để không kích hoạt nút thẻ bên dưới. */
function QtyStepper({ qty, onDec, onInc }: { qty: number; onDec: () => void; onInc: () => void }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full bg-indigo-600 text-white p-0.5 shadow-lg shadow-black/30"
      onClick={e => e.stopPropagation()}>
      <button onClick={onDec} className="rounded-full p-1.5 hover:bg-white/20 active:bg-white/30"><Minus className="h-3.5 w-3.5" /></button>
      <span className="text-sm font-700 min-w-[1.25rem] text-center">{qty}</span>
      <button onClick={onInc} className="rounded-full p-1.5 hover:bg-white/20 active:bg-white/30"><Plus className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function CatChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-500 border ${active ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground hover:text-foreground'}`}>
      {children}
    </button>
  );
}
