'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Truck, X, Trash2, ScanLine, CheckCircle2, PackageOpen } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';

const INPUT = 'w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2.5 text-sm text-foreground outline-none';
const LABEL = 'text-xs font-600 text-muted-foreground uppercase tracking-wider';

/**
 * Xuất Hàng: đợt xuất kho + KIỂM ĐẾM bằng quét SKU/barcode (camera, quét liên tục).
 * draft → counting (quét từng thùng, tiến độ realtime) → shipped (trừ sổ kho theo số đã đếm).
 */
export default function ShipmentsTab({ warehouseId }: { warehouseId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/warehouse/admin/shipments?warehouseId=${warehouseId}`);
      const json = await res.json();
      setRows(json.data || []);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => { load(); }, [load]);

  const remove = async (r: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Xoá đợt xuất ${r.code}? Không khôi phục được.`)) return;
    const res = await fetch(`/api/warehouse/admin/shipments?warehouseId=${warehouseId}&id=${r.id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { alert(json.error || 'Không xoá được'); return; }
    load();
  };

  const STATUS: Record<string, { label: string; cls: string }> = {
    draft:     { label: 'Nháp',          cls: 'bg-white/10 text-muted-foreground' },
    counting:  { label: 'Đang kiểm đếm', cls: 'bg-amber-500/10 text-amber-400' },
    shipped:   { label: 'Đã xuất',       cls: 'bg-emerald-500/10 text-emerald-400' },
    cancelled: { label: 'Đã hủy',        cls: 'bg-red-500/10 text-red-400' },
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-700 text-foreground">Xuất Hàng</h2>
        <button onClick={() => setCreateOpen(true)}
          className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-600 text-white flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Tạo đợt xuất
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <Truck className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có đợt xuất nào</p>
          <p className="text-xs mt-1 opacity-60">Tạo đợt xuất, thêm hàng dự kiến rồi quét mã kiểm đếm khi lên xe</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5" style={{ background: 'var(--card)' }}>
          {rows.map((r) => {
            const st = STATUS[r.status] || STATUS.draft;
            return (
              <div key={r.id} role="button" tabIndex={0} onClick={() => setDetailId(r.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') setDetailId(r.id); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 cursor-pointer">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-600 text-foreground">
                    <span className="font-mono text-xs text-indigo-300 mr-2">{r.code}</span>
                    {r.customer || 'Chưa ghi khách'}
                    {r.order_code && (
                      <span className="ml-2 text-[10px] font-600 text-amber-400/80" title="Xuất theo đơn hàng">📋 {r.order_code}</span>
                    )}
                  </p>
                  <p className="text-2xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString('vi-VN')} · {r.line_count} mặt hàng
                    · đếm {formatNumber(Number(r.total_counted))}/{formatNumber(Number(r.total_planned))}
                  </p>
                </div>
                <span className={`text-2xs rounded-full px-2 py-0.5 shrink-0 ${st.cls}`}>{st.label}</span>
                {/* Đợt đã xuất không xoá được (sổ kho đã ghi) — ẩn nút cho gọn */}
                {r.status !== 'shipped' && (
                  <button onClick={(e) => remove(r, e)} className="btn-ghost rounded-lg p-1.5 shrink-0" title="Xoá đợt xuất">
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {createOpen && (
        <CreateShipmentModal warehouseId={warehouseId}
          onClose={() => setCreateOpen(false)} onSaved={(id) => { setCreateOpen(false); load(); setDetailId(id); }} />
      )}
      {detailId && (
        <ShipmentDetailModal warehouseId={warehouseId} shipmentId={detailId}
          onClose={() => { setDetailId(null); load(); }} />
      )}
    </div>
  );
}

/** Tạo đợt xuất: khách + danh sách hàng dự kiến (chỉ thành phẩm & hàng thô có tồn) */
function CreateShipmentModal({ warehouseId, onClose, onSaved }: {
  warehouseId: string; onClose: () => void; onSaved: (id: string) => void;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [customer, setCustomer] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<any[]>([{ itemId: '', qtyPlanned: '' }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch(`/api/warehouse/admin/inventory?warehouseId=${warehouseId}&view=overview`)
      .then((r) => r.json()).then((j) => setItems(j.data || []));
  }, [warehouseId]);

  const save = async () => {
    setErr('');
    setBusy(true);
    try {
      const res = await fetch('/api/warehouse/admin/shipments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId, customer: customer || null, note: note || null,
          lines: lines.filter((l) => l.itemId && Number(l.qtyPlanned) > 0)
            .map((l) => ({ itemId: l.itemId, qtyPlanned: Number(l.qtyPlanned) })),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Lỗi tạo đợt'); return; }
      onSaved(json.data.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-lg rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-base font-700 text-foreground">Tạo đợt xuất kho</h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Khách / nơi nhận</label>
              <input className={INPUT + ' mt-1.5'} value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="VD: Cty ABC — cont xuất Nhật" />
            </div>
            <div>
              <label className={LABEL}>Ghi chú</label>
              <input className={INPUT + ' mt-1.5'} value={note} onChange={(e) => setNote(e.target.value)} placeholder="số cont, ngày đóng…" />
            </div>
          </div>
          <div className="space-y-2">
            <label className={LABEL}>Hàng dự kiến xuất</label>
            {lines.map((l, idx) => {
              const it = items.find((x) => x.id === l.itemId);
              return (
                <div key={idx} className="grid grid-cols-[1fr_6rem_auto] gap-2 items-center">
                  <select value={l.itemId}
                    onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, itemId: e.target.value } : x))}
                    className="rounded-xl border border-white/10 bg-[#162033] px-2 py-2.5 text-xs text-foreground min-w-0">
                    <option value="">— Chọn mặt hàng —</option>
                    {items.map((o) => (
                      <option key={o.id} value={o.id}>{o.name} (tồn {formatNumber(Number(o.stock))} {o.unit})</option>
                    ))}
                  </select>
                  <input type="number" value={l.qtyPlanned} placeholder={it ? it.unit : 'SL'}
                    onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, qtyPlanned: e.target.value } : x))}
                    className="rounded-xl border border-white/10 bg-[#162033] px-2 py-2.5 text-xs text-foreground text-right" />
                  <button onClick={() => setLines(lines.filter((_, i) => i !== idx))} className="btn-ghost rounded-lg p-1.5">
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </button>
                </div>
              );
            })}
            <button onClick={() => setLines([...lines, { itemId: '', qtyPlanned: '' }])}
              className="w-full rounded-xl border border-dashed border-white/10 py-2 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Thêm mặt hàng
            </button>
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button onClick={save} disabled={busy} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white disabled:opacity-50">
            {busy ? 'Đang tạo…' : 'Tạo đợt'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Chi tiết đợt: tiến độ đếm từng dòng + quét mã + chốt xuất */
function ShipmentDetailModal({ warehouseId, shipmentId, onClose }: {
  warehouseId: string; shipmentId: string; onClose: () => void;
}) {
  const [sh, setSh] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [scanOpen, setScanOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/warehouse/admin/shipments?warehouseId=${warehouseId}&id=${shipmentId}`);
    const json = await res.json();
    setSh(json.data || null);
  }, [warehouseId, shipmentId]);

  useEffect(() => { load(); }, [load]);

  const act = async (body: Record<string, any>): Promise<{ ok: boolean; error?: string }> => {
    setErr('');
    setBusy(true);
    try {
      const res = await fetch('/api/warehouse/admin/shipments', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouseId, shipmentId, ...body }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Lỗi'); return { ok: false, error: json.error }; }
      await load();
      return { ok: true };
    } finally {
      setBusy(false);
    }
  };

  if (!sh) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
        <Loader2 className="h-6 w-6 animate-spin text-white/60" />
      </div>
    );
  }

  const allDone = sh.lines.every((l: any) => Number(l.qty_counted) >= Number(l.qty_planned));
  const anyShort = sh.lines.some((l: any) => Number(l.qty_counted) < Number(l.qty_planned));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div>
            <h2 className="text-base font-700 text-foreground">
              <span className="font-mono text-sm text-indigo-300 mr-2">{sh.code}</span>
              {sh.customer || 'Đợt xuất kho'}
            </h2>
            <p className="text-2xs text-muted-foreground mt-0.5">
              {sh.status === 'shipped' ? `Đã xuất ${new Date(sh.shipped_at).toLocaleString('vi-VN')}` : sh.note || ''}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-6 space-y-3 max-h-[55vh] overflow-y-auto">
          {sh.lines.map((l: any) => {
            const pct = Math.min(100, (Number(l.qty_counted) / Number(l.qty_planned)) * 100);
            const done = Number(l.qty_counted) >= Number(l.qty_planned);
            return (
              <div key={l.id} className="rounded-xl border border-white/5 p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-foreground min-w-0 truncate">
                    <span className="font-mono text-2xs text-indigo-300 mr-1.5">{l.sku}</span>{l.name}
                    {l.units_per_carton && <span className="text-2xs text-muted-foreground"> · {formatNumber(Number(l.units_per_carton))}/{'thùng'}</span>}
                  </p>
                  <p className={`text-sm font-700 shrink-0 ${done ? 'text-emerald-400' : 'text-foreground'}`}>
                    {formatNumber(Number(l.qty_counted))}/{formatNumber(Number(l.qty_planned))} {l.unit}
                    {done && <CheckCircle2 className="inline h-4 w-4 ml-1" />}
                  </p>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div className={`h-full rounded-full ${done ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
                </div>
                {sh.status === 'counting' && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="sửa tay số đếm"
                      className="w-32 rounded-lg border border-white/10 bg-[#162033] px-2 py-1 text-xs text-foreground text-right"
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          const v = Number((e.target as HTMLInputElement).value);
                          if (Number.isFinite(v)) await act({ action: 'set_counted', lineId: l.id, qtyCounted: v });
                          (e.target as HTMLInputElement).value = '';
                        }
                      }}
                    />
                    <span className="text-2xs text-muted-foreground">Enter để lưu (khi tem hỏng không quét được)</span>
                  </div>
                )}
              </div>
            );
          })}
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-white/5 px-6 py-4">
          {sh.status === 'draft' && (
            <>
              <button onClick={() => act({ action: 'cancel' })} disabled={busy} className="btn-ghost rounded-xl px-4 py-2 text-sm text-red-400">Hủy đợt</button>
              <button onClick={() => act({ action: 'start_counting' })} disabled={busy}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white disabled:opacity-50 flex items-center gap-2">
                <ScanLine className="h-4 w-4" /> Bắt đầu kiểm đếm
              </button>
            </>
          )}
          {sh.status === 'counting' && (
            <>
              <button onClick={() => setScanOpen(true)} disabled={busy}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white disabled:opacity-50 flex items-center gap-2">
                <ScanLine className="h-4 w-4" /> Quét mã
              </button>
              <button
                onClick={async () => {
                  if (anyShort && !confirm('Còn mặt hàng chưa đếm đủ. Xuất theo SỐ ĐÃ ĐẾM?')) return;
                  const r = await act({ action: 'finalize', allowShort: anyShort });
                  if (r.ok) onClose();
                }}
                disabled={busy || sh.lines.every((l: any) => Number(l.qty_counted) === 0)}
                className={`rounded-xl px-4 py-2 text-sm font-600 text-white disabled:opacity-50 flex items-center gap-2 ${allDone ? 'bg-emerald-600' : 'bg-amber-600'}`}>
                <PackageOpen className="h-4 w-4" /> Chốt &amp; xuất kho
              </button>
            </>
          )}
        </div>
      </div>

      {scanOpen && (
        <ContinuousScanModal
          onScan={async (code) => {
            const res = await fetch('/api/warehouse/admin/shipments', {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ warehouseId, shipmentId, action: 'scan', code }),
            });
            const json = await res.json();
            await load();
            if (!res.ok) return { ok: false, message: json.error || 'Lỗi quét' };
            return { ok: true, message: `+${formatNumber(json.added)} · ${json.line.name}: ${formatNumber(Number(json.line.qty_counted))}/${formatNumber(Number(json.line.qty_planned))}` };
          }}
          onClose={() => setScanOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Scanner QUÉT LIÊN TỤC (đọc cả barcode 1D lẫn QR): thùng cùng SKU in cùng mã nên
 * chống trùng theo THỜI GIAN (1.5s) chứ không theo mã — quét 40 thùng không phải mở lại camera.
 */
function ContinuousScanModal({ onScan, onClose }: {
  onScan: (code: string) => Promise<{ ok: boolean; message: string }>;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastAcceptRef = useRef(0);
  const processingRef = useRef(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [camError, setCamError] = useState('');
  const [manual, setManual] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 150,
          delayBetweenScanSuccess: 300,
        });
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current!,
          (result) => {
            if (!result || cancelled) return;
            void handleCode(result.getText());
          }
        );
        if (cancelled) { controls.stop(); return; }
        controlsRef.current = controls;
      } catch {
        setCamError('Không mở được camera — cấp quyền camera hoặc nhập mã tay bên dưới.');
      }
    })();
    return () => {
      cancelled = true;
      try { controlsRef.current?.stop(); } catch { /* noop */ }
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCode = async (code: string) => {
    const now = Date.now();
    if (processingRef.current || now - lastAcceptRef.current < 1500) return; // chống quét trùng liên tiếp
    processingRef.current = true;
    lastAcceptRef.current = now;
    try {
      const result = await onScan(code.trim());
      setFeedback(result);
      // Rung phản hồi trên điện thoại: 1 nhịp = OK, 3 nhịp = lỗi
      try { navigator.vibrate?.(result.ok ? 80 : [80, 60, 80, 60, 80]); } catch { /* noop */ }
    } finally {
      processingRef.current = false;
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.92)' }}>
      <div className="w-full max-w-sm">
        <div className="rounded-3xl overflow-hidden border border-white/10 aspect-square bg-black relative">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
          {camError && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <p className="text-sm text-red-300 text-center">{camError}</p>
            </div>
          )}
          <div className="absolute inset-x-8 top-1/2 h-0.5 bg-indigo-400/60" />
        </div>

        {feedback && (
          <div className={`mt-3 rounded-xl border p-3 text-sm text-center ${feedback.ok
            ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
            : 'border-red-500/30 bg-red-500/15 text-red-300'}`}>
            {feedback.message}
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && manual.trim()) { void handleCode(manual); setManual(''); } }}
            placeholder="Hoặc nhập SKU tay rồi Enter"
            className="flex-1 rounded-xl border border-white/20 bg-black/40 px-3 py-2.5 text-sm text-white outline-none"
          />
          <button onClick={onClose} className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-600 text-white">Xong</button>
        </div>
        <p className="text-2xs text-white/50 text-center mt-2">Đưa mã vào giữa khung — quét liên tục, mỗi thùng cách nhau ~2 giây</p>
      </div>
    </div>
  );
}
