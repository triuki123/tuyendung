'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Boxes, ArrowDownToLine, History, X, AlertTriangle, FileBarChart, Pencil, Trash2, EyeOff, Eye, Printer, Wand2 } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { formatVND, formatNumber } from '@/lib/format';
import { Ean13Svg, normalizeEan13 } from '@/lib/warehouse/ean13';

function vnToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

const INPUT = 'w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2.5 text-sm text-foreground outline-none';
const LABEL = 'text-xs font-600 text-muted-foreground uppercase tracking-wider';

/**
 * Tồn Kho sản xuất: hàng thô + thành phẩm, tồn & GIÁ VỐN bình quân tính từ sổ,
 * nhập hàng thô, kiểm kê điều chỉnh, sổ chi tiết, báo cáo Xuất-Nhập-Tồn theo kỳ.
 */
type TypeFilter = 'all' | 'raw' | 'semi' | 'finished';

const TYPE_META: Record<string, { label: string; cls: string }> = {
  raw:      { label: 'Hàng thô',       cls: 'bg-sky-500/10 text-sky-400' },
  semi:     { label: 'Bán thành phẩm', cls: 'bg-violet-500/10 text-violet-400' },
  finished: { label: 'Thành phẩm',     cls: 'bg-emerald-500/10 text-emerald-400' },
};

export default function InventoryTab({ warehouseId }: { warehouseId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemModal, setItemModal] = useState<null | { editing?: any }>(null);
  const [moveModal, setMoveModal] = useState<null | { item: any }>(null);
  const [historyItem, setHistoryItem] = useState<any | null>(null);
  const [showXnt, setShowXnt] = useState(false);
  const [printItem, setPrintItem] = useState<any | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [showHidden, setShowHidden] = useState(false);
  const [rowErr, setRowErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/warehouse/admin/inventory?warehouseId=${warehouseId}&view=overview${showHidden ? '&all=1' : ''}`);
      const json = await res.json();
      setRows(json.data || []);
    } finally {
      setLoading(false);
    }
  }, [warehouseId, showHidden]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => rows.filter((r) => typeFilter === 'all' || r.item_type === typeFilter),
    [rows, typeFilter]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, raw: 0, semi: 0, finished: 0 };
    for (const r of rows) c[r.item_type] = (c[r.item_type] || 0) + 1;
    return c;
  }, [rows]);

  const toggleActive = async (r: any) => {
    setRowErr('');
    await fetch('/api/warehouse/admin/inventory', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warehouseId, itemId: r.id, active: !r.active }),
    });
    load();
  };

  const remove = async (r: any) => {
    setRowErr('');
    if (!confirm(`Xoá mặt hàng "${r.name}"? Chỉ xoá được khi chưa có sổ sách.`)) return;
    const res = await fetch(`/api/warehouse/admin/inventory?warehouseId=${warehouseId}&itemId=${r.id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setRowErr(json.error || 'Không xoá được'); return; }
    load();
  };

  const TABS: { v: TypeFilter; label: string }[] = [
    { v: 'all', label: 'Tất cả' },
    { v: 'raw', label: 'Hàng Thô' },
    { v: 'semi', label: 'Bán Thành Phẩm' },
    { v: 'finished', label: 'Thành Phẩm' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-700 text-foreground">Tồn Kho Sản Xuất</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowXnt(true)}
            className="rounded-xl border border-white/10 px-3 py-2 text-xs font-600 text-muted-foreground hover:text-foreground flex items-center gap-1.5">
            <FileBarChart className="h-3.5 w-3.5" /> Báo cáo XNT
          </button>
          <button onClick={() => setItemModal({})}
            className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-600 text-white flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Mặt hàng
          </button>
        </div>
      </div>

      {/* Tab lọc theo loại + hiện hàng đã ẩn */}
      <div className="flex items-center gap-2 border-b border-white/10 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.v} onClick={() => setTypeFilter(t.v)}
            className={`whitespace-nowrap px-3 py-2 text-sm font-600 border-b-2 transition-colors ${
              typeFilter === t.v ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {t.label}{counts[t.v] > 0 && <span className="ml-1.5 text-2xs opacity-70">{counts[t.v]}</span>}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-2xs text-muted-foreground cursor-pointer whitespace-nowrap pb-1">
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
          Hiện hàng đã ẩn
        </label>
      </div>

      {rowErr && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300 flex items-center justify-between">
          {rowErr}
          <button onClick={() => setRowErr('')}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <Boxes className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">{rows.length === 0 ? 'Chưa có mặt hàng nào' : 'Không có mặt hàng loại này'}</p>
          <p className="text-xs mt-1 opacity-60">Tạo mặt hàng (hàng thô / bán TP / thành phẩm) với SKU để quản lý tồn</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-600">SKU</th>
                  <th className="px-3 py-3 font-600">Mặt hàng</th>
                  <th className="px-3 py-3 font-600">Loại</th>
                  <th className="px-3 py-3 font-600 text-right">Tồn</th>
                  <th className="px-3 py-3 font-600 text-right">Giá vốn BQ</th>
                  <th className="px-3 py-3 font-600 text-right">Giá trị tồn</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((r) => {
                  const tm = TYPE_META[r.item_type] || TYPE_META.raw;
                  return (
                    <tr key={r.id} className={r.active ? '' : 'opacity-50'}>
                      <td className="px-4 py-3 font-mono text-xs text-indigo-300">{r.sku}</td>
                      <td className="px-3 py-3 text-foreground">
                        {r.name}
                        {r.units_per_carton && <span className="text-2xs text-muted-foreground"> · {formatNumber(r.units_per_carton)}/{'thùng'}</span>}
                        {!r.active && <span className="text-2xs text-amber-400 ml-1.5">(đã ẩn)</span>}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-2xs rounded-full px-2 py-0.5 ${tm.cls}`}>{tm.label}</span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className={Number(r.stock) < 0 ? 'text-red-400' : 'text-foreground'}>{formatNumber(Number(r.stock))}</span>
                        <span className="text-2xs text-muted-foreground"> {r.unit}</span>
                        {r.low_stock && <AlertTriangle className="inline h-3.5 w-3.5 text-amber-400 ml-1" />}
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground">{r.avg_cost != null ? formatVND(Math.round(Number(r.avg_cost))) : '—'}</td>
                      <td className="px-3 py-3 text-right text-foreground">{r.avg_cost != null ? formatVND(Number(r.stock_value)) : '—'}</td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => setMoveModal({ item: r })} className="btn-ghost rounded-lg p-1.5" title="Nhập kho / kiểm kê">
                            <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-400" />
                          </button>
                          <button onClick={() => setHistoryItem(r)} className="btn-ghost rounded-lg p-1.5" title="Sổ chi tiết">
                            <History className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                          <button onClick={() => setPrintItem(r)} className="btn-ghost rounded-lg p-1.5" title="In tem barcode">
                            <Printer className="h-3.5 w-3.5 text-indigo-400" />
                          </button>
                          <button onClick={() => setItemModal({ editing: r })} className="btn-ghost rounded-lg p-1.5" title="Sửa mặt hàng">
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                          <button onClick={() => toggleActive(r)} className="btn-ghost rounded-lg p-1.5" title={r.active ? 'Ẩn (giữ sổ sách)' : 'Hiện lại'}>
                            {r.active ? <EyeOff className="h-3.5 w-3.5 text-amber-400" /> : <Eye className="h-3.5 w-3.5 text-emerald-400" />}
                          </button>
                          <button onClick={() => remove(r)} className="btn-ghost rounded-lg p-1.5" title="Xoá (chỉ khi chưa có sổ sách)">
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                          </button>
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

      {itemModal && <ItemModal warehouseId={warehouseId} editing={itemModal.editing} onClose={() => setItemModal(null)} onSaved={() => { setItemModal(null); load(); }} />}
      {moveModal && <StockMoveModal warehouseId={warehouseId} item={moveModal.item} onClose={() => setMoveModal(null)} onSaved={() => { setMoveModal(null); load(); }} />}
      {historyItem && <MovesModal warehouseId={warehouseId} item={historyItem} onClose={() => setHistoryItem(null)} onChanged={load} />}
      {showXnt && <XntModal warehouseId={warehouseId} onClose={() => setShowXnt(false)} />}
      {printItem && (
        <PrintLabelsModal warehouseId={warehouseId} item={printItem}
          onClose={() => setPrintItem(null)} onBarcodeSaved={load} />
      )}
    </div>
  );
}

/** Tạo / SỬA mặt hàng (SKU/barcode/loại/đơn vị/quy cách thùng/ngưỡng cảnh báo) */
function ItemModal({ warehouseId, editing, onClose, onSaved }: {
  warehouseId: string; editing?: any; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState<any>(
    editing
      ? {
          sku: editing.sku, barcode: editing.barcode || '', name: editing.name,
          itemType: editing.item_type, unit: editing.unit,
          unitsPerCarton: editing.units_per_carton ?? '', minQuantity: editing.min_quantity ?? '',
        }
      : { itemType: 'raw', unit: 'cái' }
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setErr('');
    if (!f.sku?.trim() || !f.name?.trim()) { setErr('Nhập SKU và tên mặt hàng'); return; }
    setBusy(true);
    try {
      const res = editing
        ? await fetch('/api/warehouse/admin/inventory', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              warehouseId, itemId: editing.id,
              sku: f.sku, barcode: f.barcode?.trim() || null, name: f.name.trim(), unit: f.unit || 'cái',
              units_per_carton: f.unitsPerCarton === '' || f.unitsPerCarton == null ? null : Number(f.unitsPerCarton),
              min_quantity: f.minQuantity === '' || f.minQuantity == null ? null : Number(f.minQuantity),
            }),
          })
        : await fetch('/api/warehouse/admin/inventory', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ warehouseId, action: 'create_item', ...f }),
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
      <div className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-base font-700 text-foreground">{editing ? `Sửa — ${editing.name}` : 'Mặt hàng mới'}</h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>SKU *</label>
              <input className={INPUT + ' mt-1.5 font-mono'} value={f.sku || ''} onChange={(e) => setF({ ...f, sku: e.target.value })} placeholder="DUA-TP-01" />
            </div>
            <div>
              <label className={LABEL}>Barcode (nếu khác SKU)</label>
              <div className="mt-1.5 flex gap-1.5">
                <input className={INPUT + ' font-mono'} value={f.barcode || ''} onChange={(e) => setF({ ...f, barcode: e.target.value })} placeholder="EAN-13 / tự sinh" />
                <button
                  type="button"
                  title="Tự sinh mã EAN-13 nội bộ (dải 20x của GS1)"
                  onClick={async () => {
                    const res = await fetch('/api/warehouse/admin/inventory', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ warehouseId, action: 'generate_barcode' }),
                    });
                    const json = await res.json();
                    if (res.ok && json.barcode) setF((prev: any) => ({ ...prev, barcode: json.barcode }));
                    else setErr(json.error || 'Không sinh được mã');
                  }}
                  className="shrink-0 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-2.5 text-indigo-300 hover:bg-indigo-500/20"
                >
                  <Wand2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          <div>
            <label className={LABEL}>Tên mặt hàng *</label>
            <input className={INPUT + ' mt-1.5'} value={f.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Dừa trọc đóng hộp" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Loại</label>
              {/* Đổi loại khi đã có sổ/BOM sẽ làm lệch báo cáo & kế hoạch SX → khoá khi sửa */}
              <select className={INPUT + ' mt-1.5 disabled:opacity-50'} value={f.itemType} disabled={!!editing}
                onChange={(e) => setF({ ...f, itemType: e.target.value })}>
                <option value="raw">Hàng thô (nguyên liệu)</option>
                <option value="semi">Bán thành phẩm</option>
                <option value="finished">Thành phẩm</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>Đơn vị</label>
              <input className={INPUT + ' mt-1.5'} value={f.unit || ''} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="trái / hộp / kg" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Số đơn vị / thùng</label>
              <input type="number" className={INPUT + ' mt-1.5'} value={f.unitsPerCarton ?? ''} onChange={(e) => setF({ ...f, unitsPerCarton: e.target.value })} placeholder="12 (trống = quét lẻ)" />
            </div>
            <div>
              <label className={LABEL}>Ngưỡng cảnh báo tồn</label>
              <input type="number" className={INPUT + ' mt-1.5'} value={f.minQuantity ?? ''} onChange={(e) => setF({ ...f, minQuantity: e.target.value })} placeholder="trống = không cảnh báo" />
            </div>
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button onClick={save} disabled={busy} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white disabled:opacity-50">
            {busy ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo mặt hàng'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Nhập hàng thô (có đơn giá) / kiểm kê điều chỉnh ± */
function StockMoveModal({ warehouseId, item, onClose, onSaved }: { warehouseId: string; item: any; onClose: () => void; onSaved: () => void }) {
  const [moveType, setMoveType] = useState<'purchase_in' | 'adjust_in' | 'adjust_out'>('purchase_in');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setErr('');
    setBusy(true);
    try {
      const res = await fetch('/api/warehouse/admin/inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouseId, action: 'stock_move', itemId: item.id, moveType, quantity: Number(quantity), unitCost: unitCost || null, note: note || null }),
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
      <div className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-base font-700 text-foreground">Ghi sổ — {item.name}</h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className={LABEL}>Loại biến động</label>
            <select className={INPUT + ' mt-1.5'} value={moveType} onChange={(e) => setMoveType(e.target.value as any)}>
              <option value="purchase_in">Nhập kho (mua hàng thô / nhập thêm)</option>
              <option value="adjust_in">Kiểm kê: điều chỉnh TĂNG</option>
              <option value="adjust_out">Kiểm kê: điều chỉnh GIẢM</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Số lượng ({item.unit})</label>
              <input type="number" className={INPUT + ' mt-1.5'} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
            </div>
            {moveType !== 'adjust_out' && (
              <div>
                <label className={LABEL}>Đơn giá (đ/{item.unit})</label>
                <input type="number" className={INPUT + ' mt-1.5'} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="cho giá vốn BQ" />
              </div>
            )}
          </div>
          <div>
            <label className={LABEL}>Ghi chú</label>
            <input className={INPUT + ' mt-1.5'} value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: nhập từ vườn Bến Tre, xe 51C-123" />
          </div>
          {moveType !== 'adjust_out' && !unitCost && (
            <p className="text-2xs text-amber-400">⚠ Không nhập đơn giá → lượt nhập này không tham gia tính giá vốn bình quân.</p>
          )}
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button onClick={save} disabled={busy || !quantity} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white disabled:opacity-50">
            {busy ? 'Đang ghi…' : 'Ghi sổ'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Sổ chi tiết biến động 1 mặt hàng — sửa được ĐƠN GIÁ lượt nhập sai (giá vốn tự tính lại) */
function MovesModal({ warehouseId, item, onClose, onChanged }: {
  warehouseId: string; item: any; onClose: () => void; onChanged?: () => void;
}) {
  const [moves, setMoves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMove, setEditMove] = useState<any | null>(null);
  const [editCost, setEditCost] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState('');

  const loadMoves = useCallback(() => {
    fetch(`/api/warehouse/admin/inventory?warehouseId=${warehouseId}&view=moves&itemId=${item.id}`)
      .then((r) => r.json()).then((j) => setMoves(j.data || [])).finally(() => setLoading(false));
  }, [warehouseId, item.id]);

  useEffect(() => { loadMoves(); }, [loadMoves]);

  const saveCost = async () => {
    if (!editMove) return;
    setEditErr('');
    setEditBusy(true);
    try {
      const res = await fetch('/api/warehouse/admin/inventory', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouseId, action: 'update_move_cost', moveId: editMove.id, unitCost: editCost }),
      });
      const json = await res.json();
      if (!res.ok) { setEditErr(json.error || 'Không sửa được'); return; }
      setEditMove(null);
      loadMoves();
      onChanged?.(); // giá vốn BQ + giá trị tồn ở bảng ngoài tính lại
    } finally {
      setEditBusy(false);
    }
  };

  const TYPE_LABEL: Record<string, { label: string; cls: string }> = {
    purchase_in:    { label: 'Nhập mua',      cls: 'text-emerald-400' },
    production_in:  { label: 'Nhập từ lô SX', cls: 'text-emerald-400' },
    production_out: { label: 'Xuất cho SX',   cls: 'text-orange-400' },
    ship_out:       { label: 'Xuất bán',      cls: 'text-orange-400' },
    adjust_in:      { label: 'Kiểm kê +',     cls: 'text-sky-400' },
    adjust_out:     { label: 'Kiểm kê −',     cls: 'text-red-400' },
  };
  const IN_TYPES = ['purchase_in', 'production_in', 'adjust_in'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-base font-700 text-foreground">Sổ kho — {item.name} <span className="font-mono text-xs text-indigo-300">{item.sku}</span></h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : moves.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">Chưa có biến động nào</p>
          ) : (
            <div className="divide-y divide-white/5">
              {moves.map((m) => {
                const t = TYPE_LABEL[m.move_type] || { label: m.move_type, cls: 'text-foreground' };
                return (
                  <div key={m.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
                    <div className="min-w-0">
                      <p className={`text-xs font-600 ${t.cls}`}>
                        {t.label}
                        {m.production_code && <span className="text-muted-foreground font-400"> · {m.production_code}</span>}
                        {m.shipment_code && <span className="text-muted-foreground font-400"> · {m.shipment_code}</span>}
                      </p>
                      <p className="text-2xs text-muted-foreground truncate">
                        {new Date(m.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                        {m.created_by_name && ` · ${m.created_by_name}`}
                        {m.note && ` · ${m.note}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-1.5">
                      <div>
                        <p className={`font-600 ${IN_TYPES.includes(m.move_type) ? 'text-emerald-400' : 'text-orange-400'}`}>
                          {IN_TYPES.includes(m.move_type) ? '+' : '−'}{formatNumber(Number(m.quantity))} {item.unit}
                        </p>
                        {m.unit_cost != null && <p className="text-2xs text-muted-foreground">{formatVND(Math.round(Number(m.unit_cost)))}/{item.unit}</p>}
                      </div>
                      {/* Sửa giá lượt nhập sai — chỉ nhập mua / kiểm kê tăng (giá lô SX do hệ tính) */}
                      {['purchase_in', 'adjust_in'].includes(m.move_type) && (
                        <button
                          onClick={() => { setEditMove(m); setEditCost(m.unit_cost != null ? String(Math.round(Number(m.unit_cost))) : ''); setEditErr(''); }}
                          className="btn-ghost rounded-lg p-1" title="Sửa đơn giá lượt nhập này">
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Popup sửa đơn giá */}
        {editMove && (
          <div className="border-t border-white/5 px-6 py-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <p className="text-xs text-muted-foreground mb-2">
              Sửa đơn giá lượt nhập <b className="text-foreground">+{formatNumber(Number(editMove.quantity))} {item.unit}</b>
              {' '}({new Date(editMove.created_at).toLocaleDateString('vi-VN')}) — giá vốn bình quân sẽ tự tính lại, có ghi vết người sửa.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number" min={0} autoFocus
                value={editCost}
                onChange={(e) => setEditCost(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void saveCost(); }}
                placeholder={`đ/${item.unit}`}
                className="w-40 rounded-xl border border-white/10 bg-[#162033] px-3 py-2 text-sm text-foreground text-right"
              />
              <span className="text-xs text-muted-foreground">đ/{item.unit}</span>
              <button onClick={saveCost} disabled={editBusy}
                className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-600 text-white disabled:opacity-50">
                {editBusy ? 'Đang lưu…' : 'Lưu giá'}
              </button>
              <button onClick={() => setEditMove(null)} className="btn-ghost rounded-xl px-3 py-2 text-xs">Hủy</button>
            </div>
            {editErr && <p className="mt-2 text-xs text-red-400">{editErr}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * In tem barcode cho mặt hàng: EAN-13 vạch thật nếu mã là 12–13 số hợp lệ,
 * QR fallback cho mã tự do/SKU (scanner của app đọc được cả hai).
 * In qua window.print — CSS chỉ hiện vùng tem, mỗi tem 1 ô lưới để cắt/dán.
 */
function PrintLabelsModal({ warehouseId, item, onClose, onBarcodeSaved }: {
  warehouseId: string; item: any; onClose: () => void; onBarcodeSaved: () => void;
}) {
  const [barcode, setBarcode] = useState<string>(item.barcode || '');
  const [count, setCount] = useState('12');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const code = barcode || item.sku;
  const ean = normalizeEan13(code);
  const n = Math.min(Math.max(Number(count) || 1, 1), 200);

  const generate = async () => {
    setErr('');
    setBusy(true);
    try {
      const res = await fetch('/api/warehouse/admin/inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouseId, action: 'generate_barcode', itemId: item.id }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Không sinh được mã'); return; }
      setBarcode(json.barcode);
      onBarcodeSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 wh-print-root" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      {/* Khi in: ẩn mọi thứ, chỉ hiện vùng tem */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .wh-label-print-area, .wh-label-print-area * { visibility: visible !important; }
          .wh-label-print-area {
            position: fixed !important; inset: 0 !important; overflow: visible !important;
            max-height: none !important; background: #fff !important; padding: 4mm !important;
          }
        }
      `}</style>
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-base font-700 text-foreground flex items-center gap-2">
            <Printer className="h-4 w-4 text-indigo-400" /> In tem — {item.name}
          </h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-6 py-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs text-muted-foreground">
              Mã in: <span className="font-mono text-indigo-300">{code}</span>
              {ean ? <span className="ml-1.5 text-emerald-400">· EAN-13</span> : <span className="ml-1.5 text-amber-400">· QR (mã tự do)</span>}
            </div>
            {!item.barcode && !barcode && (
              <button onClick={generate} disabled={busy}
                className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-600 text-indigo-300 disabled:opacity-50 flex items-center gap-1">
                <Wand2 className="h-3 w-3" /> Tự sinh EAN-13 &amp; lưu vào mặt hàng
              </button>
            )}
            <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              Số tem
              <input type="number" min={1} max={200} value={count} onChange={(e) => setCount(e.target.value)}
                className="w-20 rounded-lg border border-white/10 bg-[#162033] px-2 py-1.5 text-xs text-foreground text-right" />
            </label>
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>

        {/* Vùng tem — đây là phần duy nhất hiện ra khi in */}
        <div className="wh-label-print-area mx-6 mb-4 max-h-[45vh] overflow-y-auto rounded-xl bg-white p-3">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(58mm, 1fr))', gap: '3mm' }}>
            {Array.from({ length: n }).map((_, i) => (
              <div key={i} style={{
                border: '1px dashed #cbd5e1', borderRadius: 4, padding: '2mm',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                pageBreakInside: 'avoid', background: '#fff',
              }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#000', margin: 0, textAlign: 'center', lineHeight: 1.2 }}>
                  {item.name}
                </p>
                <p style={{ fontSize: 9, fontFamily: 'monospace', color: '#334155', margin: 0 }}>
                  {item.sku}{item.units_per_carton ? ` · ${Number(item.units_per_carton)}/thùng` : ''}
                </p>
                {ean ? (
                  <Ean13Svg value={ean} height={40} moduleWidth={1.6} />
                ) : (
                  <div style={{ background: '#fff', padding: 2 }}>
                    <QRCodeCanvas value={code} size={72} level="M" fgColor="#000000" bgColor="#FFFFFF" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Đóng</button>
          <button onClick={() => window.print()}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white flex items-center gap-2">
            <Printer className="h-4 w-4" /> In {n} tem
          </button>
        </div>
      </div>
    </div>
  );
}

/** Báo cáo Xuất-Nhập-Tồn theo kỳ */
function XntModal({ warehouseId, onClose }: { warehouseId: string; onClose: () => void }) {
  const today = vnToday();
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/warehouse/admin/inventory?warehouseId=${warehouseId}&view=xnt&from=${from}&to=${to}`);
      const json = await res.json();
      setRows(json.data || []);
    } finally {
      setLoading(false);
    }
  }, [warehouseId, from, to]);

  useEffect(() => { load(); }, [load]);

  const totalValue = rows.reduce((s, r) => s + Number(r.closing_value || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-4xl rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 px-6 py-4">
          <h2 className="text-base font-700 text-foreground">Báo cáo Xuất - Nhập - Tồn</h2>
          <div className="flex items-center gap-2">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-white/10 bg-[#162033] px-2.5 py-1.5 text-xs text-foreground" />
            <span className="text-muted-foreground text-xs">→</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-white/10 bg-[#162033] px-2.5 py-1.5 text-xs text-foreground" />
            <button onClick={onClose} className="btn-ghost rounded-lg p-1.5 ml-2"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="p-4 max-h-[65vh] overflow-auto">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-600">Mặt hàng</th>
                  <th className="px-3 py-2 font-600 text-right">Tồn đầu</th>
                  <th className="px-3 py-2 font-600 text-right">Nhập</th>
                  <th className="px-3 py-2 font-600 text-right">Xuất</th>
                  <th className="px-3 py-2 font-600 text-right">Tồn cuối</th>
                  <th className="px-3 py-2 font-600 text-right">Giá trị tồn cuối</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-foreground">
                      <span className="font-mono text-2xs text-indigo-300 mr-1.5">{r.sku}</span>{r.name}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{formatNumber(Number(r.opening))}</td>
                    <td className="px-3 py-2 text-right text-emerald-400">{Number(r.in_qty) > 0 ? `+${formatNumber(Number(r.in_qty))}` : '0'}</td>
                    <td className="px-3 py-2 text-right text-orange-400">{Number(r.out_qty) > 0 ? `−${formatNumber(Number(r.out_qty))}` : '0'}</td>
                    <td className="px-3 py-2 text-right font-600 text-foreground">{formatNumber(Number(r.closing))} {r.unit}</td>
                    <td className="px-3 py-2 text-right text-foreground">{r.avg_cost != null ? formatVND(Number(r.closing_value)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/10">
                  <td colSpan={5} className="px-3 py-2.5 text-right text-xs font-600 text-muted-foreground">TỔNG GIÁ TRỊ TỒN CUỐI KỲ</td>
                  <td className="px-3 py-2.5 text-right font-700 text-indigo-400">{formatVND(totalValue)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
