'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Loader2, X, AlertTriangle, PackagePlus, Pencil, History } from 'lucide-react';
import { formatVND, formatNumber, parseVND } from '@/lib/format';
import MoneyInput from '@/components/ui/MoneyInput';
import { api } from '../lib/solaceApi';
import type { SolaceIngredient } from '@/lib/services/solaceInventoryService';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

export default function InventoryTab() {
  const [items, setItems] = useState<SolaceIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<SolaceIngredient | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [stockFor, setStockFor] = useState<SolaceIngredient | null>(null);
  const [historyFor, setHistoryFor] = useState<SolaceIngredient | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get<{ data: SolaceIngredient[] }>('/api/solace/ingredients?all=1');
      setItems(r.data);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const lowStock = items.filter(i => i.is_active && i.min_qty > 0 && Number(i.stock_qty) <= Number(i.min_qty));
  const totalValue = items.reduce((s, i) => s + Number(i.stock_qty) * Number(i.avg_cost), 0);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="hidden sm:block text-xs text-muted-foreground">Bảng tổng nguyên liệu — tồn kho, giá vốn TB, nhập/điều chỉnh.</p>
        <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-600 bg-indigo-600 text-white hover:bg-indigo-500 shrink-0 whitespace-nowrap">
          <Plus className="h-4 w-4" /> Thêm nguyên liệu
        </button>
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}

      {/* Tổng quan nhanh — mobile */}
      {items.length > 0 && (
        <div className="sm:hidden grid grid-cols-3 gap-2">
          <StatBox label="Mặt hàng" value={String(items.length)} />
          <StatBox label="Sắp hết" value={String(lowStock.length)} warn={lowStock.length > 0} />
          <StatBox label="Giá trị tồn" value={formatVND(totalValue)} />
        </div>
      )}

      {lowStock.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300">{lowStock.length} nguyên liệu dưới ngưỡng tồn tối thiểu: {lowStock.map(i => i.name).join(', ')}</p>
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground">
          <span className="text-3xl opacity-30">📦</span><p className="text-sm mt-3">Chưa có nguyên liệu</p>
        </div>
      ) : (
        <>
          {/* Mobile: danh sách thẻ (giống phần mềm quản lý bán hàng) */}
          <div className="lg:hidden space-y-2.5">
            {items.map(i => {
              const low = i.is_active && i.min_qty > 0 && Number(i.stock_qty) <= Number(i.min_qty);
              return (
                <div key={i.id} className="rounded-2xl border border-white/5 p-3.5" style={{ background: 'var(--card)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-600 text-foreground">{i.name}</span>
                        {!i.is_active && <span className="text-2xs px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">Tắt</span>}
                      </div>
                      {i.code && <span className="text-2xs text-muted-foreground">{i.code}</span>}
                    </div>
                    {low && <span className="shrink-0 inline-flex items-center gap-1 text-2xs font-600 px-2 py-0.5 rounded-full text-amber-300 bg-amber-500/10 border border-amber-500/20"><AlertTriangle className="h-3 w-3" /> Sắp hết</span>}
                  </div>
                  <div className="flex items-end justify-between gap-2 mt-2.5">
                    <div>
                      <p className={`text-2xl font-700 leading-none ${low ? 'text-amber-400' : 'text-foreground'}`}>{formatNumber(i.stock_qty)} <span className="text-xs font-500 text-muted-foreground">{i.unit}</span></p>
                      <p className="text-2xs text-muted-foreground mt-1">Tồn tối thiểu {formatNumber(i.min_qty)} {i.unit}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xs text-muted-foreground">Giá vốn TB</p>
                      <p className="text-sm font-600 text-foreground">{formatVND(i.avg_cost)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <button onClick={() => setStockFor(i)} className="inline-flex items-center justify-center gap-1 rounded-xl py-2 text-xs font-600 bg-emerald-500/15 text-emerald-400 active:bg-emerald-500/25">
                      <PackagePlus className="h-3.5 w-3.5" /> Nhập kho
                    </button>
                    <button onClick={() => setHistoryFor(i)} className="inline-flex items-center justify-center gap-1 rounded-xl py-2 text-xs font-600 border border-white/10 text-muted-foreground active:bg-white/5">
                      <History className="h-3.5 w-3.5" /> Lịch sử
                    </button>
                    <button onClick={() => setEditing(i)} className="inline-flex items-center justify-center gap-1 rounded-xl py-2 text-xs font-600 border border-white/10 text-muted-foreground active:bg-white/5">
                      <Pencil className="h-3.5 w-3.5" /> Sửa
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: bảng */}
          <div className="hidden lg:block rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-2xs uppercase tracking-wider text-muted-foreground border-b border-white/5">
                <th className="px-4 py-2.5 font-600">Nguyên liệu</th>
                <th className="px-4 py-2.5 font-600 text-right">Tồn</th>
                <th className="px-4 py-2.5 font-600 text-right">Tồn tối thiểu</th>
                <th className="px-4 py-2.5 font-600 text-right">Giá vốn TB</th>
                <th className="px-4 py-2.5 font-600 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => {
                const low = i.is_active && i.min_qty > 0 && Number(i.stock_qty) <= Number(i.min_qty);
                return (
                  <tr key={i.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground">{i.name}</span>
                        {!i.is_active && <span className="text-2xs px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">Tắt</span>}
                      </div>
                      {i.code && <span className="text-2xs text-muted-foreground">{i.code}</span>}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-600 ${low ? 'text-amber-400' : 'text-foreground'}`}>
                      {formatNumber(i.stock_qty)} <span className="text-2xs text-muted-foreground">{i.unit}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{formatNumber(i.min_qty)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{formatVND(i.avg_cost)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => setStockFor(i)} title="Nhập / điều chỉnh kho"
                          className="btn-ghost rounded-lg px-2 py-1 text-2xs text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1">
                          <PackagePlus className="h-3.5 w-3.5" /> Kho
                        </button>
                        <button onClick={() => setHistoryFor(i)} title="Lịch sử biến động" className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-foreground"><History className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setEditing(i)} title="Sửa" className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </>
      )}

      {(showNew || editing) && (
        <IngredientModal ingredient={editing} onClose={() => { setShowNew(false); setEditing(null); }}
          onSaved={() => { setShowNew(false); setEditing(null); load(); }} />
      )}
      {stockFor && <StockModal ingredient={stockFor} onClose={() => setStockFor(null)} onSaved={() => { setStockFor(null); load(); }} />}
      {historyFor && <StockHistoryModal ingredient={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}

function StatBox({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-white/5 px-3 py-2.5" style={{ background: 'var(--card)' }}>
      <p className="text-2xs text-muted-foreground">{label}</p>
      <p className={`text-base font-700 leading-tight truncate ${warn ? 'text-amber-400' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}

const MOVE_LABEL: Record<string, string> = { in: 'Nhập', out: 'Xuất bán', adjust: 'Điều chỉnh', waste: 'Hao hụt' };

function StockHistoryModal({ ingredient, onClose }: { ingredient: SolaceIngredient; onClose: () => void }) {
  const [rows, setRows] = useState<Array<{ id: string; type: string; qty: number; balance_after: number; reason: string | null; note: string | null; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  useEscapeKey(onClose);
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<{ data: typeof rows }>(`/api/solace/ingredients/${ingredient.id}/stock?limit=100`);
        setRows(r.data);
      } finally { setLoading(false); }
    })();
  }, [ingredient.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl border border-white/10 overflow-hidden max-h-[85vh] flex flex-col" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4 shrink-0">
          <h2 className="text-base font-700 text-foreground">Lịch sử kho: {ingredient.name}</h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Chưa có biến động</p>
          ) : (
            <div className="space-y-1.5">
              {rows.map(m => {
                const q = Number(m.qty);
                return (
                  <div key={m.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                    <div className="min-w-0">
                      <span className="text-sm text-foreground">{MOVE_LABEL[m.type] ?? m.type}</span>
                      {m.note && <span className="text-2xs text-muted-foreground ml-2">{m.note}</span>}
                      <p className="text-2xs text-muted-foreground">{new Date(m.created_at).toLocaleString('vi-VN')}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-sm font-600 ${q >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{q >= 0 ? '+' : ''}{formatNumber(q)} {ingredient.unit}</span>
                      <p className="text-2xs text-muted-foreground">Còn {formatNumber(m.balance_after)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IngredientModal({ ingredient, onClose, onSaved }: { ingredient: SolaceIngredient | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(ingredient?.name ?? '');
  const [code, setCode] = useState(ingredient?.code ?? '');
  const [unit, setUnit] = useState(ingredient?.unit ?? 'g');
  const [minQty, setMinQty] = useState(String(ingredient?.min_qty ?? ''));
  const [avgCost, setAvgCost] = useState(String(ingredient?.avg_cost ?? ''));
  const [isActive, setIsActive] = useState(ingredient?.is_active ?? true);
  const [purchaseUnit, setPurchaseUnit] = useState(ingredient?.purchase_unit ?? '');
  const [purchaseFactor, setPurchaseFactor] = useState(String(ingredient?.purchase_factor ?? '1'));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const editMode = !!ingredient;

  const save = async () => {
    if (!name.trim()) { setErr('Nhập tên nguyên liệu'); return; }
    setBusy(true); setErr('');
    const body = {
      name, code, unit, min_qty: Number(minQty) || 0, avg_cost: parseVND(avgCost), is_active: isActive,
      purchase_unit: purchaseUnit.trim() || null, purchase_factor: Number(purchaseFactor) || 1,
    };
    try {
      if (editMode) await api.put(`/api/solace/ingredients/${ingredient!.id}`, body);
      else await api.post('/api/solace/ingredients', body);
      onSaved();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <Modal title={editMode ? 'Sửa nguyên liệu' : 'Thêm nguyên liệu'} onClose={onClose} onSave={save} busy={busy}>
      <Field label="Tên"><input autoFocus value={name} onChange={e => setName(e.target.value)} className={INP} style={{ background: '#162033' }} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mã (tuỳ chọn)"><input value={code} onChange={e => setCode(e.target.value)} className={INP} style={{ background: '#162033' }} /></Field>
        <Field label="Đơn vị"><input value={unit} onChange={e => setUnit(e.target.value)} placeholder="g, ml, cái" className={INP} style={{ background: '#162033' }} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tồn tối thiểu"><input value={minQty} onChange={e => setMinQty(e.target.value)} className={INP} style={{ background: '#162033' }} /></Field>
        <Field label="Giá vốn TB (đ)"><MoneyInput value={avgCost} onValueChange={(n) => setAvgCost(n ? String(n) : '')} className={INP} style={{ background: '#162033' }} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Đơn vị mua (tuỳ chọn)"><input value={purchaseUnit} onChange={e => setPurchaseUnit(e.target.value)} placeholder="kg, lít, thùng" className={INP} style={{ background: '#162033' }} /></Field>
        <Field label={`Quy đổi (1 ${purchaseUnit || 'đv mua'} = ? ${unit})`}><input value={purchaseFactor} onChange={e => setPurchaseFactor(e.target.value)} className={INP} style={{ background: '#162033' }} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="accent-indigo-500" /> Đang sử dụng
      </label>
      {err && <p className="text-xs text-red-400">{err}</p>}
    </Modal>
  );
}

function StockModal({ ingredient, onClose, onSaved }: { ingredient: SolaceIngredient; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<'in' | 'adjust' | 'waste'>('in');
  const [qty, setQty] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [payAccount, setPayAccount] = useState<'none' | 'cash' | 'bank'>('none'); // chi tiền từ quỹ khi nhập kho
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const factor = Number(ingredient.purchase_factor) || 1;
  const hasPU = !!ingredient.purchase_unit && factor > 1;
  const useP = type === 'in' && hasPU;          // nhập theo đơn vị mua → quy đổi sang đơn vị gốc
  const qtyUnit = useP ? ingredient.purchase_unit! : ingredient.unit;
  const qtyBase = (Number(qty) || 0) * (useP ? factor : 1);

  const save = async () => {
    const q = Number(qty);
    if (!Number.isFinite(q) || q === 0) { setErr('Nhập số lượng'); return; }
    setBusy(true); setErr('');
    try {
      // Quy đổi đơn vị mua → đơn vị gốc (lưu kho luôn theo đơn vị gốc).
      const baseQty = useP ? q * factor : q;
      const baseCost = type === 'in'
        ? (useP ? Math.round(parseVND(unitCost) / factor) : parseVND(unitCost))
        : undefined;
      await api.post(`/api/solace/ingredients/${ingredient.id}/stock`, {
        type, qty: baseQty, unit_cost: baseCost, note,
        pay_account: type === 'in' && payAccount !== 'none' ? payAccount : undefined,
      });
      onSaved();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <Modal title={`Kho: ${ingredient.name}`} onClose={onClose} onSave={save} busy={busy} saveLabel="Ghi nhận">
      <p className="text-xs text-muted-foreground">Tồn hiện tại: <span className="text-foreground font-600">{formatNumber(ingredient.stock_qty)} {ingredient.unit}</span></p>
      <Field label="Loại">
        <div className="flex gap-2">
          {([['in', 'Nhập kho'], ['adjust', 'Điều chỉnh'], ['waste', 'Hao hụt']] as const).map(([t, l]) => (
            <button key={t} onClick={() => setType(t)}
              className={`flex-1 rounded-xl px-2 py-2 text-xs border ${type === t ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground'}`}>{l}</button>
          ))}
        </div>
      </Field>
      <Field label={type === 'adjust' ? `Số lượng (+/-) (${qtyUnit})` : `Số lượng (${qtyUnit})`}>
        <input autoFocus value={qty} onChange={e => setQty(e.target.value)} className={INP} style={{ background: '#162033' }} />
      </Field>
      {useP && Number(qty) > 0 && (
        <p className="text-2xs text-indigo-400">≈ {formatNumber(qtyBase)} {ingredient.unit} (quy đổi)</p>
      )}
      {type === 'in' && (
        <Field label={`Giá vốn / 1 ${qtyUnit} (đ)`}><MoneyInput value={unitCost} onValueChange={(n) => setUnitCost(n ? String(n) : '')} className={INP} style={{ background: '#162033' }} /></Field>
      )}
      {type === 'in' && (
        <Field label="Trừ tiền quỹ (chi mua nguyên liệu)">
          <div className="flex gap-2">
            {([['none', 'Không'], ['cash', 'Tiền mặt'], ['bank', 'Ngân hàng']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setPayAccount(k)}
                className={`flex-1 rounded-xl px-2 py-2 text-xs border ${payAccount === k ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground'}`}>{l}</button>
            ))}
          </div>
          {payAccount !== 'none' && Number(qty) > 0 && parseVND(unitCost) > 0 && (
            <p className="text-2xs text-amber-400 mt-1">Sẽ ghi chi {formatVND(qtyBase * (useP ? Math.round(parseVND(unitCost) / factor) : parseVND(unitCost)))} từ {payAccount === 'cash' ? 'két tiền mặt' : 'ngân hàng'}</p>
          )}
        </Field>
      )}
      <Field label="Ghi chú"><input value={note} onChange={e => setNote(e.target.value)} className={INP} style={{ background: '#162033' }} /></Field>
      {err && <p className="text-xs text-red-400">{err}</p>}
    </Modal>
  );
}

export const INP = 'w-full rounded-xl px-3 py-2 text-sm text-foreground border border-white/10 focus:border-indigo-500 outline-none';

// ─── Modal & Field tái dùng ──────────────────────────────────────────────────
export function Modal({ title, onClose, onSave, busy, saveLabel = 'Lưu', children }: {
  title: string; onClose: () => void; onSave: () => void; busy: boolean; saveLabel?: string; children: React.ReactNode;
}) {
  // Form modal dùng chung: ESC + backdrop + cảnh báo thay đổi chưa lưu.
  // markDirty bắt qua onChange bubble ở thân modal; lưu thành công → caller unmount modal.
  const { markDirty, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose, !busy);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={() => { if (!busy) guardedClose(); }}>
      <div className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden max-h-[90vh] flex flex-col" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4 shrink-0">
          <h2 className="text-base font-700 text-foreground">{title}</h2>
          <button onClick={guardedClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto" onChange={markDirty}>{children}</div>
        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4 shrink-0">
          <button onClick={guardedClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button disabled={busy} onClick={onSave} className="rounded-xl px-4 py-2 text-sm font-600 bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">
            {busy ? 'Đang lưu…' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}
