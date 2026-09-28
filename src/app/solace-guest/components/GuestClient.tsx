'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Coffee, Loader2, Plus, Minus, Trash2, X, Search, ShoppingBag, CheckCircle2, Clock, RotateCcw } from 'lucide-react';
import { formatVND } from '@/lib/format';
import OptionPicker, { type MenuProduct } from '../../solace/components/OptionPicker';
import type { SolaceCategory, SolaceOptionValue } from '@/lib/services/solaceCatalogService';
import { useEscapeKey } from '@/hooks/useEscapeKey';

const QRCodeCanvas = dynamic(() => import('qrcode.react').then(m => m.QRCodeCanvas), { ssr: false });

interface CartLine { key: string; product: MenuProduct; qty: number; options: SolaceOptionValue[]; note: string; }
interface GuestStatus {
  id: string; code: string | null; status: string; payment_method: string | null; payment_status: string;
  total: number; paid_amount: number; fulfillment_type: string; floor_note: string | null; created_at: string;
  items: { name: string; qty: number; options: string[] }[];
  vietqr: { payload: string; accountNo: string; accountName: string; addInfo: string | null } | null;
}

const STATUS_VN: Record<string, string> = { pending: 'Chờ pha chế', preparing: 'Đang pha chế', ready: 'Sẵn sàng — mời nhận', delivering: 'Đang mang ra', done: 'Hoàn tất', cancelled: 'Đã huỷ' };
function norm(s: string): string { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd'); }
function linePrice(l: CartLine): number { return Number(l.product.price) + l.options.reduce((s, o) => s + Number(o.extra_price), 0); }

export default function GuestClient() {
  const [categories, setCategories] = useState<SolaceCategory[]>([]);
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [identified, setIdentified] = useState(false);

  const [activeCat, setActiveCat] = useState('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [picking, setPicking] = useState<MenuProduct | null>(null);
  const [fulfillment, setFulfillment] = useState<'counter' | 'dine_in'>('counter');
  const [floorNote, setFloorNote] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'bankqr'>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [statusId, setStatusId] = useState<string | null>(null);

  // Khôi phục tên + tham số bàn từ URL/localStorage.
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const loc = sp.get('loc') || sp.get('ban');
      if (loc) { setFulfillment('dine_in'); setFloorNote(loc.slice(0, 60)); }
      const n = localStorage.getItem('solace_guest_name'); if (n) { setName(n); setIdentified(true); }
      const p = localStorage.getItem('solace_guest_phone'); if (p) setPhone(p);
    } catch { /* ignore */ }
  }, []);

  const loadMenu = useCallback(async () => {
    try {
      setLoading(true);
      setLoadErr('');
      const r = await fetch('/api/solace/guest/menu');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Không tải được thực đơn');
      setCategories(d.data.categories); setProducts(d.data.products);
    } catch (e) { setLoadErr((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadMenu(); }, [loadMenu]);

  const q = norm(search.trim());
  const shown = useMemo(() => products.filter(p => (activeCat === 'all' || p.category_id === activeCat) && (!q || norm(p.name).includes(q))), [products, activeCat, q]);
  const subtotal = useMemo(() => cart.reduce((s, l) => s + linePrice(l) * l.qty, 0), [cart]);

  const newKey = () => `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const incProduct = (p: MenuProduct) => setCart(prev => {
    const i = prev.findIndex(l => l.product.id === p.id && l.options.length === 0 && !l.note);
    if (i < 0) return [...prev, { key: newKey(), product: p, options: [], qty: 1, note: '' }];
    const next = [...prev]; next[i] = { ...next[i], qty: next[i].qty + 1 }; return next;
  });
  const clickProduct = (p: MenuProduct) => {
    if (p.available === false) return;
    if (p.optionGroups.length > 0) setPicking(p); else incProduct(p);
  };
  const setQty = (key: string, d: number) => setCart(prev => prev.flatMap(l => l.key !== key ? [l] : (l.qty + d < 1 ? [] : [{ ...l, qty: l.qty + d }])));
  const removeLine = (key: string) => setCart(prev => prev.filter(l => l.key !== key));

  const saveIdentity = () => {
    if (!name.trim()) { setErr('Vui lòng nhập tên của bạn'); return; }
    try { localStorage.setItem('solace_guest_name', name.trim()); if (phone.trim()) localStorage.setItem('solace_guest_phone', phone.trim()); } catch { /* ignore */ }
    setErr(''); setIdentified(true);
  };

  const submit = async () => {
    setErr('');
    if (cart.length === 0) { setErr('Giỏ hàng trống'); return; }
    if (fulfillment === 'dine_in' && !floorNote.trim()) { setErr('Nhập bàn / vị trí khi nhận tại chỗ'); return; }
    setSubmitting(true);
    try {
      const r = await fetch('/api/solace/guest/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), phone: phone.trim() || null, fulfillment_type: fulfillment,
          floor_note: floorNote.trim() || null, payment_method: payMethod,
          items: cart.map(l => ({ product_id: l.product.id, qty: l.qty, option_value_ids: l.options.map(o => o.id), note: l.note || null })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Không đặt được đơn');
      setCart([]); setStatusId(d.data.id);
    } catch (e) { setErr((e as Error).message); }
    finally { setSubmitting(false); }
  };

  if (statusId) return <StatusView id={statusId} onNew={() => { setStatusId(null); setErr(''); }} />;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl shrink-0" style={{ background: 'linear-gradient(135deg, #8B4513, #C77B3B)' }}>
          <Coffee className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-700 text-foreground">Quán Cà Phê Solace</h1>
          <p className="text-xs text-muted-foreground">Đặt món nhanh — nhận tại quầy hoặc tại chỗ</p>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : loadErr ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex flex-col items-start gap-3">
          <p className="text-sm text-red-400">{loadErr}</p>
          <button onClick={loadMenu} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white hover:bg-indigo-500">
            <RotateCcw className="h-3.5 w-3.5" /> Thử lại
          </button>
        </div>
      ) : !identified ? (
        <div className="rounded-2xl border border-white/5 p-5 space-y-3 max-w-md" style={{ background: 'var(--card)' }}>
          <p className="text-sm text-foreground font-600">Cho quán biết bạn là ai nhé</p>
          <div>
            <label className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Tên của bạn *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="VD: Anh Minh"
              className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />
          </div>
          <div>
            <label className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Số điện thoại (tuỳ chọn)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="Để quán gọi khi xong"
              className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
          <button onClick={saveIdentity} className="w-full rounded-xl py-2.5 text-sm font-600 bg-indigo-600 text-white hover:bg-indigo-500">Bắt đầu đặt món</button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Xin chào, <span className="text-foreground font-600">{name}</span></span>
            <button onClick={() => setIdentified(false)} className="text-indigo-400 hover:text-indigo-300">Đổi tên</button>
          </div>

          {/* Tìm + danh mục */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm món…" inputMode="search"
              className="w-full rounded-xl pl-9 pr-9 py-2.5 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />
            {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground"><X className="h-4 w-4" /></button>}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Chip active={activeCat === 'all'} onClick={() => setActiveCat('all')}>Tất cả</Chip>
            {categories.map(c => <Chip key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)}>{c.name}</Chip>)}
          </div>

          {/* Lưới món */}
          {shown.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground"><span className="text-3xl opacity-30">☕</span><p className="text-sm mt-2">Không có món phù hợp</p></div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {shown.map(p => {
                const out = p.available === false;
                return (
                  <div key={p.id} className={`relative rounded-2xl border border-white/5 overflow-hidden ${out ? 'opacity-50' : ''}`} style={{ background: 'var(--card)' }}>
                    <button disabled={out} onClick={() => clickProduct(p)} className="block w-full text-left active:opacity-80 disabled:cursor-not-allowed">
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
                    {out && <span className="absolute top-1.5 right-1.5 text-2xs font-700 px-2 py-0.5 rounded-full bg-red-500/90 text-white">Tạm hết</span>}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Giỏ hàng nổi + sheet */}
      {identified && cart.length > 0 && (
        <CartBar count={cart.reduce((s, l) => s + l.qty, 0)} total={subtotal}
          cart={cart} setQty={setQty} removeLine={removeLine}
          fulfillment={fulfillment} setFulfillment={setFulfillment} floorNote={floorNote} setFloorNote={setFloorNote}
          payMethod={payMethod} setPayMethod={setPayMethod} err={err} submitting={submitting} onSubmit={submit} />
      )}

      {picking && <OptionPicker product={picking} onClose={() => setPicking(null)}
        onAdd={(opts, qty, note) => { setCart(prev => [...prev, { key: newKey(), product: picking, options: opts, qty, note }]); setPicking(null); }} />}
    </div>
  );
}

function CartBar(props: {
  count: number; total: number; cart: CartLine[]; setQty: (k: string, d: number) => void; removeLine: (k: string) => void;
  fulfillment: 'counter' | 'dine_in'; setFulfillment: (f: 'counter' | 'dine_in') => void; floorNote: string; setFloorNote: (s: string) => void;
  payMethod: 'cash' | 'bankqr'; setPayMethod: (m: 'cash' | 'bankqr') => void; err: string; submitting: boolean; onSubmit: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEscapeKey(() => setOpen(false), open);
  return (
    <>
      <button onClick={() => setOpen(true)} className="fixed inset-x-0 z-40 mx-4 flex items-center justify-between gap-3 rounded-2xl bg-indigo-600 px-4 py-3.5 text-white shadow-lg active:bg-indigo-500"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 1rem)', maxWidth: '40rem', marginLeft: 'auto', marginRight: 'auto' }}>
        <span className="flex items-center gap-2 text-sm font-600"><ShoppingBag className="h-4 w-4" /> {props.count} món</span>
        <span className="text-base font-700">{formatVND(props.total)}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={() => setOpen(false)}>
          <div className="w-full sm:max-w-md sm:mx-auto rounded-t-3xl border-t border-white/10 max-h-[88vh] overflow-y-auto p-4"
            style={{ background: 'var(--card)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }} onClick={e => e.stopPropagation()}>
            <div className="relative mb-3"><div className="mx-auto h-1 w-10 rounded-full bg-white/15" />
              <button onClick={() => setOpen(false)} className="absolute -top-1 right-0 p-1 text-muted-foreground"><X className="h-5 w-5" /></button>
            </div>
            <h3 className="text-base font-600 text-foreground mb-2">Giỏ hàng</h3>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {props.cart.map(l => (
                <div key={l.key} className="rounded-xl bg-white/5 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">{l.product.name}</p>
                      {l.options.length > 0 && <p className="text-2xs text-muted-foreground">{l.options.map(o => o.name).join(', ')}</p>}
                      {l.note && <p className="text-2xs text-muted-foreground italic">“{l.note}”</p>}
                    </div>
                    <button onClick={() => props.removeLine(l.key)} className="text-muted-foreground hover:text-red-400 p-1 -m-1"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-2">
                      <button onClick={() => props.setQty(l.key, -1)} className="rounded-lg p-2 bg-white/5 text-foreground"><Minus className="h-3.5 w-3.5" /></button>
                      <span className="text-sm text-foreground w-6 text-center">{l.qty}</span>
                      <button onClick={() => props.setQty(l.key, 1)} className="rounded-lg p-2 bg-white/5 text-foreground"><Plus className="h-3.5 w-3.5" /></button>
                    </div>
                    <span className="text-sm font-600 text-foreground">{formatVND(linePrice(l) * l.qty)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-white/5 mt-3 pt-3 space-y-3">
              <div className="flex gap-2">
                {([['counter', 'Tại quầy'], ['dine_in', 'Tại chỗ']] as const).map(([t, l]) => (
                  <button key={t} onClick={() => props.setFulfillment(t)}
                    className={`flex-1 rounded-xl px-2 py-2.5 text-sm border ${props.fulfillment === t ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground'}`}>{l}</button>
                ))}
              </div>
              {props.fulfillment === 'dine_in' && (
                <input value={props.floorNote} onChange={e => props.setFloorNote(e.target.value)} placeholder="Bàn / vị trí (bắt buộc)"
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />
              )}
              <div className="flex gap-2">
                {([['cash', '💵 Tiền mặt'], ['bankqr', '🏦 Chuyển khoản']] as const).map(([t, l]) => (
                  <button key={t} onClick={() => props.setPayMethod(t)}
                    className={`flex-1 rounded-xl px-2 py-2.5 text-sm border ${props.payMethod === t ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground'}`}>{l}</button>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Tổng cộng</span>
                <span className="text-lg font-700 text-foreground">{formatVND(props.total)}</span>
              </div>
              {props.err && <p className="text-xs text-red-400">{props.err}</p>}
              <button onClick={props.onSubmit} disabled={props.submitting}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-700 bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">
                {props.submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Đặt món'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatusView({ id, onNew }: { id: string; onNew: () => void }) {
  const [s, setS] = useState<GuestStatus | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/solace/guest/orders/${id}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Không tải được đơn');
      setS(d.data);
    } catch (e) { setErr((e as Error).message); }
  }, [id]);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  const due = s ? Number(s.total) - Number(s.paid_amount) : 0;
  const done = s?.status === 'done' || s?.status === 'cancelled';

  return (
    <div className="max-w-md mx-auto p-4 sm:p-6 space-y-4">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl shrink-0" style={{ background: 'linear-gradient(135deg, #8B4513, #C77B3B)' }}>
          <Coffee className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-lg font-700 text-foreground">Theo dõi đơn</h1>
      </header>

      {err && <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400">{err}</div>}
      {!s ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="rounded-2xl border border-white/5 p-5 text-center" style={{ background: 'var(--card)' }}>
            <p className="text-2xs text-muted-foreground uppercase tracking-wider">Mã đơn</p>
            <p className="text-2xl font-800 text-foreground tracking-wide">{s.code}</p>
            <div className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-600 border ${s.status === 'ready' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : s.status === 'cancelled' ? 'text-red-400 border-red-500/30 bg-red-500/10' : 'text-amber-400 border-amber-500/30 bg-amber-500/10'}`}>
              {s.status === 'ready' || s.status === 'done' ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
              {STATUS_VN[s.status] ?? s.status}
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 p-4 space-y-1.5" style={{ background: 'var(--card)' }}>
            {s.items.map((it, i) => (
              <div key={i} className="flex justify-between gap-2 text-sm">
                <span className="text-foreground">{it.qty}× {it.name}{it.options.length ? <span className="text-2xs text-muted-foreground"> ({it.options.join(', ')})</span> : null}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-white/5 pt-2 mt-1">
              <span className="text-sm text-muted-foreground">Tổng cộng</span>
              <span className="text-base font-700 text-foreground">{formatVND(s.total)}</span>
            </div>
            <p className="text-2xs text-muted-foreground">{s.payment_status === 'paid' ? 'Đã thanh toán' : s.payment_method === 'bankqr' ? 'Chờ chuyển khoản' : 'Trả tiền mặt khi nhận'}</p>
          </div>

          {/* VietQR nếu còn phải trả */}
          {s.vietqr && due > 0 && (
            <div className="rounded-2xl border border-white/5 p-4 text-center space-y-2" style={{ background: 'var(--card)' }}>
              <p className="text-sm font-600 text-foreground">Quét VietQR để chuyển khoản</p>
              <div className="flex justify-center"><div className="rounded-2xl bg-white p-3"><QRCodeCanvas value={s.vietqr.payload} size={200} level="M" /></div></div>
              <p className="text-2xs text-muted-foreground">{s.vietqr.accountName} · {s.vietqr.accountNo}</p>
              <p className="text-2xs text-muted-foreground">Nội dung: <b className="text-foreground">{s.code}</b></p>
              <p className="text-sm font-700 text-foreground">Cần trả: {formatVND(due)}</p>
            </div>
          )}

          {!done && <p className="text-2xs text-muted-foreground text-center">Trang tự cập nhật trạng thái. Bạn có thể giữ màn hình này.</p>}
          <button onClick={onNew} className="w-full rounded-xl py-2.5 text-sm font-600 border border-white/10 text-foreground hover:bg-white/5">Đặt đơn mới</button>
        </>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-500 border ${active ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground'}`}>{children}</button>
  );
}
