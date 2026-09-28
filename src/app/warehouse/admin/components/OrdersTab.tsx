'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, ClipboardList, Plus, X, Factory, Truck, ChevronRight,
  AlertTriangle, CheckCircle2, ArrowLeft, Trash2,
} from 'lucide-react';

/**
 * Tab ĐƠN HÀNG — trục A-Z của xưởng: đơn khách → nổ lệnh sản xuất nhiều cấp
 * (cây đề xuất theo BOM) → theo dõi tồn/thiếu từng dòng → tạo đợt xuất theo đơn.
 */

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft:         { label: 'Nháp',           cls: 'bg-slate-500/15 text-muted-foreground' },
  confirmed:     { label: 'Đã chốt',        cls: 'bg-sky-500/15 text-sky-400' },
  in_production: { label: 'Đang sản xuất',  cls: 'bg-amber-500/15 text-amber-400' },
  ready:         { label: 'Đủ hàng',        cls: 'bg-emerald-500/15 text-emerald-400' },
  shipped:       { label: 'Đã xuất',        cls: 'bg-indigo-500/15 text-indigo-400' },
  cancelled:     { label: 'Đã hủy',         cls: 'bg-red-500/15 text-red-400' },
};

const PO_STATUS: Record<string, string> = {
  draft: 'Nháp', in_progress: 'Đang chạy', completed: 'Hoàn thành', cancelled: 'Đã hủy',
};

const fmt = (n: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(n);

export default function OrdersTab({ warehouseId, onGoTab }: {
  warehouseId: string;
  /** Nhảy sang tab khác (production/shipments) — AdminWorkspace truyền xuống. */
  onGoTab?: (tab: string) => void;
}) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch(`/api/warehouse/admin/orders?warehouseId=${warehouseId}`).then((r) => r.json());
      setOrders(j.data || []);
    } finally { setLoading(false); }
  }, [warehouseId]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (detailId) {
    return <OrderDetail orderId={detailId} onBack={() => { setDetailId(null); load(); }} onGoTab={onGoTab} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-700 text-foreground">Đơn hàng</h2>
          <p className="text-xs text-muted-foreground">Trục A–Z: đơn khách → nổ lệnh sản xuất → xuất kho theo đơn</p>
        </div>
        <button onClick={() => setCreateOpen(true)}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white flex items-center gap-2 justify-center">
          <Plus className="h-4 w-4" /> Tạo đơn hàng
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <ClipboardList className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có đơn hàng nào</p>
          <p className="text-xs mt-1 opacity-60">Tạo đơn → hệ thống tự tính cần sản xuất gì, thiếu nguyên liệu nào</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5" style={{ background: 'var(--card)' }}>
          {orders.map((o) => {
            const st = STATUS_META[o.status] ?? STATUS_META.draft;
            return (
              <button key={o.id} onClick={() => setDetailId(o.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-700 text-foreground">{o.code}</span>
                    <span className={`px-1.5 py-0.5 rounded text-2xs font-600 ${st.cls}`}>{st.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {o.customer_name} · {o.line_count} mặt hàng · tổng {fmt(Number(o.total_qty))}
                    {o.expected_date && <> · giao {String(o.expected_date).slice(0, 10).split('-').reverse().join('/')}</>}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {createOpen && (
        <CreateOrderModal warehouseId={warehouseId}
          onClose={() => setCreateOpen(false)}
          onDone={(id) => { setCreateOpen(false); setDetailId(id); }} />
      )}
    </div>
  );
}

// ===== Chi tiết đơn — trung tâm điều phối A-Z =====

function OrderDetail({ orderId, onBack, onGoTab }: {
  orderId: string; onBack: () => void; onGoTab?: (tab: string) => void;
}) {
  const [order, setOrder] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [plan, setPlan] = useState<any | null>(null);   // cây đề xuất đang xem

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch(`/api/warehouse/admin/orders/${orderId}`).then((r) => r.json());
      setOrder(j.data || null);
    } finally { setLoading(false); }
  }, [orderId]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<Response>, key: string) => {
    setBusy(key); setErr('');
    try {
      const res = await fn();
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Lỗi'); return null; }
      return json;
    } finally { setBusy(''); }
  };

  const confirm = () => act(() => fetch(`/api/warehouse/admin/orders/${orderId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'confirmed' }),
  }), 'confirm').then((r) => r && load());

  const cancel = () => act(() => fetch(`/api/warehouse/admin/orders/${orderId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }),
  }), 'cancel').then((r) => r && load());

  const remove = () => act(() => fetch(`/api/warehouse/admin/orders/${orderId}`, { method: 'DELETE' }), 'delete')
    .then((r) => r && onBack());

  const loadPlan = () => act(() => fetch(`/api/warehouse/admin/orders/${orderId}/plan`), 'plan')
    .then((r) => r && setPlan(r.data));

  const createChain = () => {
    if (!plan?.nodes?.length) return;
    act(() => fetch(`/api/warehouse/admin/orders/${orderId}/plan`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes: plan.nodes.map((n: any) => ({ itemId: n.itemId, qty: n.toProduce, level: n.level })) }),
    }), 'chain').then((r) => { if (r) { setPlan(null); load(); } });
  };

  const createShipment = () => act(() => fetch(`/api/warehouse/admin/orders/${orderId}/shipment`, { method: 'POST' }), 'ship')
    .then((r) => r && load());

  if (loading || !order) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const st = STATUS_META[order.status] ?? STATUS_META.draft;
  const canPlan = ['draft', 'confirmed'].includes(order.status);
  const canShip = ['in_production', 'ready', 'confirmed'].includes(order.status);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Danh sách đơn hàng
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-700 text-foreground">{order.code}</h2>
            <span className={`px-1.5 py-0.5 rounded text-2xs font-600 ${st.cls}`}>{st.label}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {order.customer_name}{order.customer_contact && ` · ${order.customer_contact}`}
            {order.note && ` · ${order.note}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {order.status === 'draft' && (
            <>
              <button onClick={confirm} disabled={!!busy}
                className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-600 text-white disabled:opacity-50">
                {busy === 'confirm' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Chốt đơn'}
              </button>
              <button onClick={remove} disabled={!!busy}
                className="rounded-xl border border-white/10 px-3 py-2 text-xs font-600 text-red-400 disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {canPlan && (
            <button onClick={loadPlan} disabled={!!busy}
              className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-600 text-white flex items-center gap-1.5 disabled:opacity-50">
              {busy === 'plan' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Factory className="h-3.5 w-3.5" />}
              Nổ lệnh sản xuất
            </button>
          )}
          {canShip && (
            <button onClick={createShipment} disabled={!!busy}
              className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-600 text-white flex items-center gap-1.5 disabled:opacity-50">
              {busy === 'ship' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />}
              Tạo đợt xuất
            </button>
          )}
          {!['shipped', 'cancelled', 'draft'].includes(order.status) && (
            <button onClick={cancel} disabled={!!busy}
              className="rounded-xl border border-white/10 px-3 py-2 text-xs font-600 text-red-400/80 disabled:opacity-50">
              Hủy đơn
            </button>
          )}
        </div>
      </div>

      {err && <p className="text-xs text-red-400">{err}</p>}

      {/* Dòng hàng: đặt / tồn / đã xuất */}
      <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-600">Mặt hàng</th>
                <th className="px-3 py-3 font-600 text-right">Đặt</th>
                <th className="px-3 py-3 font-600 text-right">Tồn kho</th>
                <th className="px-3 py-3 font-600 text-right">Đã xuất</th>
                <th className="px-3 py-3 font-600">Tình trạng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(order.lines || []).map((l: any) => {
                const remaining = l.quantity - (l.shipped ?? 0);
                const enough = (l.in_stock ?? 0) >= remaining;
                const done = remaining <= 0;
                return (
                  <tr key={l.id}>
                    <td className="px-4 py-2.5 text-foreground">{l.item_name} <span className="text-2xs text-muted-foreground">({l.sku})</span></td>
                    <td className="px-3 py-2.5 text-right text-foreground font-600">{fmt(l.quantity)} {l.unit}</td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">{fmt(l.in_stock ?? 0)}</td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">{fmt(l.shipped ?? 0)}</td>
                    <td className="px-3 py-2.5">
                      {done ? (
                        <span className="inline-flex items-center gap-1 text-2xs font-600 text-indigo-400"><CheckCircle2 className="h-3 w-3" /> Xuất đủ</span>
                      ) : enough ? (
                        <span className="inline-flex items-center gap-1 text-2xs font-600 text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Đủ tồn</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-2xs font-600 text-red-400"><AlertTriangle className="h-3 w-3" /> Thiếu {fmt(remaining - (l.in_stock ?? 0))}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lệnh SX + đợt xuất đã gắn */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/5 p-4 space-y-2" style={{ background: 'var(--card)' }}>
          <p className="text-sm font-600 text-foreground flex items-center gap-2">
            <Factory className="h-4 w-4 text-amber-400" /> Lệnh sản xuất ({(order.production_orders || []).length})
            {onGoTab && (order.production_orders || []).length > 0 && (
              <button onClick={() => onGoTab('production')} className="ml-auto text-2xs text-indigo-400 hover:underline">Mở tab Sản xuất →</button>
            )}
          </p>
          {(order.production_orders || []).length === 0 ? (
            <p className="text-xs text-muted-foreground">Chưa nổ lệnh — bấm "Nổ lệnh sản xuất" để hệ thống tính cây cần làm.</p>
          ) : (order.production_orders || []).map((po: any) => (
            <div key={po.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs">
              <span className="text-foreground"><b>{po.code}</b> · {po.item_name} · KH {fmt(Number(po.planned_qty))}{po.actual_qty != null && <> → đạt <b>{fmt(Number(po.actual_qty))}</b></>}</span>
              <span className="text-muted-foreground">{PO_STATUS[po.status] ?? po.status}</span>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-white/5 p-4 space-y-2" style={{ background: 'var(--card)' }}>
          <p className="text-sm font-600 text-foreground flex items-center gap-2">
            <Truck className="h-4 w-4 text-emerald-400" /> Đợt xuất ({(order.shipments || []).length})
            {onGoTab && (order.shipments || []).length > 0 && (
              <button onClick={() => onGoTab('shipments')} className="ml-auto text-2xs text-indigo-400 hover:underline">Mở tab Xuất hàng →</button>
            )}
          </p>
          {(order.shipments || []).length === 0 ? (
            <p className="text-xs text-muted-foreground">Chưa có đợt xuất — bấm "Tạo đợt xuất" khi đủ hàng.</p>
          ) : (order.shipments || []).map((sh: any) => (
            <div key={sh.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs">
              <span className="text-foreground font-600">{sh.code}</span>
              <span className="text-muted-foreground">{sh.status === 'shipped' ? `Đã xuất ${new Date(sh.shipped_at).toLocaleDateString('vi-VN')}` : sh.status === 'counting' ? 'Đang kiểm đếm' : sh.status === 'cancelled' ? 'Đã hủy' : 'Nháp'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Modal cây đề xuất sản xuất */}
      {plan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={() => setPlan(null)}>
          <div className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-3xl border border-white/10 overflow-hidden"
            style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4 shrink-0">
              <h3 className="text-base font-700 text-foreground">Cây sản xuất đề xuất</h3>
              <button onClick={() => setPlan(null)} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              {plan.nodes.length === 0 ? (
                <p className="text-sm text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Tồn kho đã đủ mọi mặt hàng — không cần sản xuất, tạo đợt xuất luôn.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Chạy từ <b className="text-foreground">cấp sâu nhất</b> lên (cấp dưới xong mới đủ nguyên liệu cho cấp trên):
                  </p>
                  {plan.nodes.map((n: any, i: number) => (
                    <div key={n.itemId} className="flex items-center gap-2 rounded-xl border border-white/5 px-3 py-2.5"
                      style={{ background: 'var(--background)', marginLeft: `${Math.min(n.level, 3) * 16}px` }}>
                      <span className="text-2xs font-700 text-amber-400 shrink-0">#{i + 1} · cấp {n.level}</span>
                      <span className="text-sm text-foreground flex-1">{n.itemName}</span>
                      <span className="text-xs text-muted-foreground">cần <b className="text-foreground">{fmt(n.toProduce)}</b> {n.unit} (tồn {fmt(n.inStock)})</span>
                    </div>
                  ))}
                </div>
              )}

              {plan.shortages.length > 0 && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 space-y-1.5">
                  <p className="text-xs font-600 text-red-300 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> Nguyên liệu / vật tư THIẾU — mua thêm trước khi chạy:
                  </p>
                  {plan.shortages.map((s: any) => (
                    <p key={`${s.kind}:${s.id}`} className="text-2xs text-red-200/90">
                      • {s.name}: cần {fmt(s.required)} {s.unit}, tồn {fmt(s.inStock)} → <b>thiếu {fmt(s.missing)}</b>
                      <span className="opacity-60"> ({s.kind === 'supply' ? 'vật tư' : 'nguyên liệu'})</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4 shrink-0">
              <button onClick={() => setPlan(null)} className="rounded-xl px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Đóng</button>
              {plan.nodes.length > 0 && (
                <button onClick={createChain} disabled={busy === 'chain'}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white disabled:opacity-50 flex items-center gap-2">
                  {busy === 'chain' && <Loader2 className="h-4 w-4 animate-spin" />}
                  Tạo {plan.nodes.length} lệnh sản xuất
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Modal tạo đơn =====

function CreateOrderModal({ warehouseId, onClose, onDone }: {
  warehouseId: string; onClose: () => void; onDone: (orderId: string) => void;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({ customerName: '', customerContact: '', expectedDate: '', note: '' });
  const [lines, setLines] = useState<{ itemId: string; quantity: string }[]>([{ itemId: '', quantity: '' }]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch(`/api/warehouse/admin/inventory?warehouseId=${warehouseId}&view=items`)
      .then((r) => r.json())
      // Khách đặt THÀNH PHẨM hoặc BÁN THÀNH PHẨM (semi) — không đặt hàng thô.
      .then((j) => setItems((j.data || []).filter((i: any) => i.active && i.item_type !== 'raw')))
      .catch(() => {});
  }, [warehouseId]);

  const submit = async () => {
    setSaving(true); setErr('');
    try {
      const res = await fetch('/api/warehouse/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId, ...form,
          lines: lines.filter((l) => l.itemId && Number(l.quantity) > 0)
            .map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity) })),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Lỗi tạo đơn'); return; }
      onDone(json.data.id);
    } finally { setSaving(false); }
  };

  const input = 'w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2.5 text-sm text-foreground';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-3xl border border-white/10 overflow-hidden"
        style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4 shrink-0">
          <h3 className="text-base font-700 text-foreground">Tạo đơn hàng</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Khách hàng / nơi nhận *</label>
              <input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} className={input} autoFocus />
            </div>
            <div>
              <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Liên hệ</label>
              <input value={form.customerContact} onChange={(e) => setForm({ ...form, customerContact: e.target.value })} className={input} />
            </div>
            <div>
              <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Ngày giao dự kiến</label>
              <input type="date" value={form.expectedDate} onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} className={input} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Hàng đặt *</label>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <select value={l.itemId} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, itemId: e.target.value } : x))}
                    className={`${input} flex-1`}>
                    <option value="">— Chọn mặt hàng —</option>
                    {items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.sku})</option>)}
                  </select>
                  <input inputMode="decimal" placeholder="SL" value={l.quantity}
                    onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, quantity: e.target.value.replace(/[^\d.]/g, '') } : x))}
                    className={`${input} w-24 text-right`} />
                  {lines.length > 1 && (
                    <button onClick={() => setLines(lines.filter((_, j) => j !== i))}
                      className="p-2 text-red-400/60 hover:text-red-400 shrink-0"><X className="h-4 w-4" /></button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => setLines([...lines, { itemId: '', quantity: '' }])}
              className="mt-2 text-xs text-indigo-400 hover:underline">+ Thêm dòng</button>
          </div>

          <div>
            <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Ghi chú</label>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={input} />
          </div>

          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4 shrink-0">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Hủy</button>
          <button onClick={submit} disabled={saving}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Tạo đơn
          </button>
        </div>
      </div>
    </div>
  );
}
