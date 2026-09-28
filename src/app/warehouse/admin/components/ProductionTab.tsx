'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Factory, X, ClipboardList, Trash2, CheckCircle2 } from 'lucide-react';
import { formatVND, formatNumber } from '@/lib/format';

const INPUT = 'w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2.5 text-sm text-foreground outline-none';
const LABEL = 'text-xs font-600 text-muted-foreground uppercase tracking-wider';

/**
 * Sản Xuất: định mức (BOM) cho từng thành phẩm + lệnh sản xuất theo LÔ.
 * Hoàn thành lô = trừ nguyên liệu/vật tư theo định mức × (đạt + phế phẩm),
 * nhập thành phẩm với giá vốn cuộn từ nguyên liệu.
 */
export default function ProductionTab({ warehouseId }: { warehouseId: string }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [supplies, setSupplies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [bomFor, setBomFor] = useState<any | null>(null);       // item thành phẩm đang sửa BOM
  const [createOpen, setCreateOpen] = useState(false);
  const [completeOrder, setCompleteOrder] = useState<any | null>(null);

  const finishedItems = useMemo(() => items.filter((i) => i.item_type === 'finished' && i.active), [items]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, it, sp] = await Promise.all([
        fetch(`/api/warehouse/admin/production?warehouseId=${warehouseId}`).then((r) => r.json()),
        fetch(`/api/warehouse/admin/inventory?warehouseId=${warehouseId}&view=items`).then((r) => r.json()),
        fetch(`/api/warehouse/admin/supplies?warehouseId=${warehouseId}`).then((r) => r.json()),
      ]);
      setOrders(o.data || []);
      setItems(it.data || []);
      setSupplies((sp.data?.supplies ?? sp.data) || []);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => { load(); }, [load]);

  const STATUS: Record<string, { label: string; cls: string }> = {
    draft:       { label: 'Nháp',        cls: 'bg-white/10 text-muted-foreground' },
    in_progress: { label: 'Đang SX',     cls: 'bg-sky-500/10 text-sky-400' },
    completed:   { label: 'Hoàn thành',  cls: 'bg-emerald-500/10 text-emerald-400' },
    cancelled:   { label: 'Đã hủy',      cls: 'bg-red-500/10 text-red-400' },
  };

  const cancel = async (o: any) => {
    await fetch('/api/warehouse/admin/production', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warehouseId, orderId: o.id, action: 'cancel' }),
    });
    load();
  };

  const remove = async (o: any) => {
    if (!confirm(`Xoá lô ${o.code}? Không khôi phục được.`)) return;
    const res = await fetch(`/api/warehouse/admin/production?warehouseId=${warehouseId}&orderId=${o.id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { alert(json.error || 'Không xoá được'); return; }
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-700 text-foreground">Sản Xuất</h2>
        <div className="flex gap-2">
          <select
            onChange={(e) => {
              const it = finishedItems.find((x) => x.id === e.target.value);
              if (it) setBomFor(it);
              e.target.value = '';
            }}
            defaultValue=""
            className="rounded-xl border border-white/10 bg-[#162033] px-3 py-2 text-xs text-foreground"
          >
            <option value="" disabled>Định mức (BOM)…</option>
            {finishedItems.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <button onClick={() => setCreateOpen(true)}
            className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-600 text-white flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Tạo lô
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <Factory className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có lô sản xuất nào</p>
          <p className="text-xs mt-1 opacity-60">Khai định mức cho thành phẩm rồi bấm Tạo lô</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-600">Mã lô</th>
                  <th className="px-3 py-3 font-600">Thành phẩm</th>
                  <th className="px-3 py-3 font-600 text-right">KH / Đạt / Phế</th>
                  <th className="px-3 py-3 font-600 text-right">Chi phí NVL</th>
                  <th className="px-3 py-3 font-600 text-right">Giá vốn/1 TP</th>
                  <th className="px-3 py-3 font-600">Trạng thái</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {orders.map((o) => {
                  const st = STATUS[o.status] || STATUS.draft;
                  return (
                    <tr key={o.id}>
                      <td className="px-4 py-3 font-mono text-xs text-indigo-300">
                        {o.code}
                        {o.order_code && (
                          <span className="block text-[10px] text-amber-400/80" title="Thuộc đơn hàng">📋 {o.order_code}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-foreground">{o.finished_name}</td>
                      <td className="px-3 py-3 text-right text-foreground">
                        {formatNumber(Number(o.planned_qty))}
                        {o.actual_qty != null && <span className="text-emerald-400"> / {formatNumber(Number(o.actual_qty))}</span>}
                        {Number(o.waste_qty) > 0 && <span className="text-red-400"> / {formatNumber(Number(o.waste_qty))}</span>}
                        {/* Đối chiếu sản lượng CÔNG NHÂN KHAI vs KHO NHẬN — lệch là có chuyện */}
                        {Number(o.declared_total) > 0 && (
                          <span className={`block text-[10px] ${o.actual_qty != null && Number(o.declared_total) !== Number(o.actual_qty) ? 'text-red-400' : 'text-muted-foreground/70'}`}
                            title="Tổng sản lượng công nhân khai cho lô này">
                            CN khai: {formatNumber(Number(o.declared_total))}
                            {o.actual_qty != null && Number(o.declared_total) !== Number(o.actual_qty) && ' ⚠ lệch'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground">{o.material_cost != null ? formatVND(Number(o.material_cost)) : '—'}</td>
                      <td className="px-3 py-3 text-right text-foreground">{o.unit_cost != null ? formatVND(Math.round(Number(o.unit_cost))) : '—'}</td>
                      <td className="px-3 py-3"><span className={`text-2xs rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span></td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1 justify-end items-center">
                          {(o.status === 'in_progress' || o.status === 'draft') && (
                            <>
                              <button onClick={() => setCompleteOrder(o)} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-600 text-white">
                                Hoàn thành
                              </button>
                              <button onClick={() => cancel(o)} className="rounded-lg border border-white/10 px-2 py-1 text-[11px] font-600 text-muted-foreground" title="Hủy lô (giữ lại để tham chiếu)">
                                Hủy
                              </button>
                            </>
                          )}
                          {/* Lô đã hoàn thành đã ghi sổ kho → không xoá; các trạng thái khác xoá được */}
                          {o.status !== 'completed' && (
                            <button onClick={() => remove(o)} className="btn-ghost rounded-lg p-1.5" title="Xoá lô">
                              <Trash2 className="h-3.5 w-3.5 text-red-400" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {bomFor && (
        <BomModal warehouseId={warehouseId} finishedItem={bomFor} rawItems={items.filter((i) => i.item_type === 'raw' && i.active)}
          supplies={supplies} onClose={() => setBomFor(null)} onSaved={() => setBomFor(null)} />
      )}
      {createOpen && (
        <CreateOrderModal warehouseId={warehouseId} finishedItems={finishedItems}
          onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); load(); }} />
      )}
      {completeOrder && (
        <CompleteOrderModal warehouseId={warehouseId} order={completeOrder}
          onClose={() => setCompleteOrder(null)} onSaved={() => { setCompleteOrder(null); load(); }} />
      )}
    </div>
  );
}

/** Soạn định mức: 1 thành phẩm = N dòng nguyên liệu (hàng thô) / vật tư */
function BomModal({ warehouseId, finishedItem, rawItems, supplies, onClose, onSaved }: {
  warehouseId: string; finishedItem: any; rawItems: any[]; supplies: any[];
  onClose: () => void; onSaved: () => void;
}) {
  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch(`/api/warehouse/admin/production?warehouseId=${warehouseId}&bomFor=${finishedItem.id}`)
      .then((r) => r.json())
      .then((j) => {
        const bl = j.data?.lines || [];
        setLines(bl.length > 0
          ? bl.map((l: any) => ({ kind: l.item_id ? 'item' : 'supply', refId: l.item_id || l.supply_id, quantity: String(Number(l.quantity)) }))
          : [{ kind: 'item', refId: '', quantity: '' }]);
      })
      .finally(() => setLoading(false));
  }, [warehouseId, finishedItem.id]);

  const save = async () => {
    setErr('');
    setBusy(true);
    try {
      const res = await fetch('/api/warehouse/admin/production', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId, action: 'save_bom', finishedItemId: finishedItem.id,
          lines: lines.filter((l) => l.refId && Number(l.quantity) > 0).map((l) => ({
            itemId: l.kind === 'item' ? l.refId : null,
            supplyId: l.kind === 'supply' ? l.refId : null,
            quantity: Number(l.quantity),
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Lỗi lưu'); return; }
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-lg rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div>
            <h2 className="text-base font-700 text-foreground flex items-center gap-2"><ClipboardList className="h-4 w-4 text-indigo-400" /> Định mức — {finishedItem.name}</h2>
            <p className="text-2xs text-muted-foreground mt-0.5">Nguyên liệu/vật tư tiêu cho MỖI 1 {finishedItem.unit} thành phẩm</p>
          </div>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-3 max-h-[55vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {lines.map((l, idx) => (
                <div key={idx} className="grid grid-cols-[auto_1fr_5.5rem_auto] gap-2 items-center">
                  <select value={l.kind}
                    onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, kind: e.target.value, refId: '' } : x))}
                    className="rounded-xl border border-white/10 bg-[#162033] px-2 py-2.5 text-xs text-foreground">
                    <option value="item">Hàng thô</option>
                    <option value="supply">Vật tư</option>
                  </select>
                  <select value={l.refId}
                    onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, refId: e.target.value } : x))}
                    className="rounded-xl border border-white/10 bg-[#162033] px-2 py-2.5 text-xs text-foreground min-w-0">
                    <option value="">— Chọn —</option>
                    {(l.kind === 'item' ? rawItems : supplies).map((o: any) => (
                      <option key={o.id} value={o.id}>{o.name} ({o.unit})</option>
                    ))}
                  </select>
                  <input type="number" step="any" value={l.quantity} placeholder="SL/1TP"
                    onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))}
                    className="rounded-xl border border-white/10 bg-[#162033] px-2 py-2.5 text-xs text-foreground text-right" />
                  <button onClick={() => setLines(lines.filter((_, i) => i !== idx))} className="btn-ghost rounded-lg p-1.5">
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </button>
                </div>
              ))}
              <button onClick={() => setLines([...lines, { kind: 'item', refId: '', quantity: '' }])}
                className="w-full rounded-xl border border-dashed border-white/10 py-2 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Thêm thành phần
              </button>
              <p className="text-2xs text-muted-foreground">VD: 1 thùng 12 trái → thùng carton nhập <b className="text-foreground">0.0833</b> (=1/12) cho mỗi trái.</p>
              {err && <p className="text-xs text-red-400">{err}</p>}
            </>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button onClick={save} disabled={busy || loading} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white disabled:opacity-50">
            {busy ? 'Đang lưu…' : 'Lưu định mức'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Tạo lô sản xuất */
function CreateOrderModal({ warehouseId, finishedItems, onClose, onSaved }: {
  warehouseId: string; finishedItems: any[]; onClose: () => void; onSaved: () => void;
}) {
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setErr('');
    setBusy(true);
    try {
      const res = await fetch('/api/warehouse/admin/production', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouseId, action: 'create_order', finishedItemId: itemId, plannedQty: Number(qty), note: note || null }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Lỗi tạo lô'); return; }
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-base font-700 text-foreground">Tạo lô sản xuất</h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className={LABEL}>Thành phẩm *</label>
            <select className={INPUT + ' mt-1.5'} value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">— Chọn thành phẩm —</option>
              {finishedItems.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Số lượng kế hoạch *</label>
            <input type="number" className={INPUT + ' mt-1.5'} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="1000" />
          </div>
          <div>
            <label className={LABEL}>Ghi chú</label>
            <input className={INPUT + ' mt-1.5'} value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: đơn hàng xuất Nhật đợt 3" />
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button onClick={save} disabled={busy || !itemId || !qty} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white disabled:opacity-50">
            {busy ? 'Đang tạo…' : 'Tạo lô'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Hoàn thành lô: nhập số đạt + phế phẩm → backflush + cuộn giá vốn */
function CompleteOrderModal({ warehouseId, order, onClose, onSaved }: {
  warehouseId: string; order: any; onClose: () => void; onSaved: () => void;
}) {
  const [actual, setActual] = useState(String(Number(order.planned_qty)));
  const [waste, setWaste] = useState('0');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<null | { materialCost: number; unitCost: number }>(null);

  const save = async () => {
    setErr('');
    setBusy(true);
    try {
      const res = await fetch('/api/warehouse/admin/production', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouseId, orderId: order.id, action: 'complete', actualQty: Number(actual), wasteQty: Number(waste) || 0 }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Lỗi hoàn thành lô'); return; }
      setDone({ materialCost: json.materialCost, unitCost: json.unitCost });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-base font-700 text-foreground">Hoàn thành lô {order.code}</h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        {done ? (
          <div className="p-6 space-y-3 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
            <p className="text-sm text-foreground">Đã nhập kho <b>{formatNumber(Number(actual))}</b> {order.finished_unit} thành phẩm</p>
            <p className="text-xs text-muted-foreground">
              Chi phí nguyên liệu: <b className="text-foreground">{formatVND(done.materialCost)}</b> ·
              Giá vốn: <b className="text-indigo-400">{formatVND(Math.round(done.unitCost))}/{order.finished_unit}</b>
            </p>
            <button onClick={onSaved} className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-600 text-white">Xong</button>
          </div>
        ) : (
          <>
            <div className="p-6 space-y-4">
              <p className="text-xs text-muted-foreground">
                Thành phẩm: <b className="text-foreground">{order.finished_name}</b> · Kế hoạch: <b className="text-foreground">{formatNumber(Number(order.planned_qty))}</b>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Số đạt (nhập kho) *</label>
                  <input type="number" className={INPUT + ' mt-1.5'} value={actual} onChange={(e) => setActual(e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Phế phẩm</label>
                  <input type="number" className={INPUT + ' mt-1.5'} value={waste} onChange={(e) => setWaste(e.target.value)} />
                </div>
              </div>
              <p className="text-2xs text-muted-foreground">
                Hệ thống sẽ TRỪ nguyên liệu/vật tư theo định mức × (đạt + phế phẩm) và NHẬP thành phẩm
                với giá vốn = chi phí nguyên liệu / số đạt. Thiếu tồn thành phần nào sẽ báo và không trừ gì cả.
              </p>
              {err && <p className="text-xs text-red-400">{err}</p>}
            </div>
            <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
              <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
              <button onClick={save} disabled={busy || !actual} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-600 text-white disabled:opacity-50 flex items-center gap-2">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Hoàn thành & nhập kho
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
