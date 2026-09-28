'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, BarChart3, Save, PackageCheck } from 'lucide-react';

function vnToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

/**
 * Sản lượng: bảng nhập nhanh mức NGÀY của quản lý (1 hàng/công nhân)
 * + khối duyệt sản lượng công nhân TỰ KHAI theo ĐỢT (chế độ nhiều đợt).
 */
export default function OutputTab({ warehouseId }: { warehouseId: string }) {
  const [products, setProducts] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [productId, setProductId] = useState('');
  const [date, setDate] = useState(vnToday());
  const [qty, setQty] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  // Sản lượng tự khai chờ duyệt
  const [pending, setPending] = useState<any[]>([]);
  const [pendingEdit, setPendingEdit] = useState<Record<string, string>>({});
  const [pendingBusy, setPendingBusy] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    const res = await fetch(`/api/warehouse/admin/output?warehouseId=${warehouseId}&pending=1`);
    const json = await res.json();
    setPending(json.data || []);
  }, [warehouseId]);

  useEffect(() => { loadPending(); }, [loadPending]);

  const reviewPending = async (row: any, action: 'approved' | 'deleted') => {
    setPendingBusy(row.id);
    try {
      const edited = pendingEdit[row.id];
      await fetch('/api/warehouse/admin/output', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId, outputId: row.id, action,
          quantity: action === 'approved' && edited !== undefined && edited !== '' ? Number(edited) : undefined,
        }),
      });
      await loadPending();
    } finally {
      setPendingBusy(null);
    }
  };

  // Gắn sản lượng vào LÔ SẢN XUẤT đang chạy (optional, mig 296) — đối chiếu "khai vs kho nhận".
  const [productionOrders, setProductionOrders] = useState<any[]>([]);
  const [productionOrderId, setProductionOrderId] = useState('');

  useEffect(() => {
    (async () => {
      const [p, w, po] = await Promise.all([
        fetch(`/api/warehouse/admin/products?warehouseId=${warehouseId}`).then((r) => r.json()),
        fetch(`/api/warehouse/admin/workers?warehouseId=${warehouseId}&status=active`).then((r) => r.json()),
        fetch(`/api/warehouse/admin/production?warehouseId=${warehouseId}&status=in_progress`).then((r) => r.json()).catch(() => ({ data: [] })),
      ]);
      setProducts(p.data || []);
      setWorkers(w.data || []);
      setProductionOrders(po.data || []);
      if ((p.data || []).length > 0) setProductId((prev) => prev || p.data[0].id);
      setLoading(false);
    })();
  }, [warehouseId]);

  const loadDay = useCallback(async () => {
    if (!productId) return;
    const res = await fetch(`/api/warehouse/admin/output?warehouseId=${warehouseId}&productId=${productId}&date=${date}`);
    const json = await res.json();
    const map: Record<string, string> = {};
    for (const r of json.data || []) map[r.worker_id] = String(Number(r.quantity));
    setQty(map);
    setSavedMsg('');
  }, [warehouseId, productId, date]);

  useEffect(() => { loadDay(); }, [loadDay]);

  const save = async () => {
    setSaving(true);
    setSavedMsg('');
    try {
      const rows = workers
        .filter((w) => qty[w.id] !== undefined && qty[w.id] !== '')
        .map((w) => ({ workerId: w.id, quantity: Number(qty[w.id]) }));
      const res = await fetch('/api/warehouse/admin/output', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouseId, productId, workDate: date, rows, productionOrderId: productionOrderId || null }),
      });
      const json = await res.json();
      if (res.ok) setSavedMsg(`✅ Đã lưu ${json.saved} dòng sản lượng`);
      else setSavedMsg(`❌ ${json.error || 'Lỗi lưu'}`);
    } finally {
      setSaving(false);
    }
  };

  const product = products.find((p) => p.id === productId);
  const total = workers.reduce((s, w) => s + (Number(qty[w.id]) || 0), 0);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center py-20 text-muted-foreground">
        <BarChart3 className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm">Chưa có sản phẩm/công đoạn nào</p>
        <p className="text-xs mt-1 opacity-60">Vào tab Cấu hình để thêm sản phẩm trước</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sản lượng công nhân TỰ KHAI lúc check-out — chờ duyệt (theo đợt) */}
      {pending.length > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
          <p className="text-sm font-600 text-amber-300 flex items-center gap-2 mb-2">
            <PackageCheck className="h-4 w-4" /> {pending.length} sản lượng công nhân tự khai chờ duyệt
          </p>
          <div className="space-y-2">
            {pending.map((r) => (
              <div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between rounded-xl bg-white/5 px-3 py-2">
                <span className="text-xs text-foreground min-w-0">
                  <b>{r.full_name}</b> · {r.work_date}
                  {r.session_no ? ` · đợt ${r.session_no}` : ''} · {r.product_name}:
                  <b className="text-amber-300"> {Number(r.quantity)} {r.unit}</b>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <input
                    inputMode="decimal"
                    value={pendingEdit[r.id] ?? ''}
                    onChange={(e) => setPendingEdit((m) => ({ ...m, [r.id]: e.target.value.replace(/[^\d.]/g, '') }))}
                    placeholder={String(Number(r.quantity))}
                    title="Sửa lại con số đúng (bỏ trống = giữ số công nhân khai)"
                    className="w-20 rounded-lg border border-white/10 bg-[#162033] px-2 py-1 text-xs text-foreground text-right"
                  />
                  <button
                    onClick={() => reviewPending(r, 'approved')}
                    disabled={pendingBusy === r.id}
                    className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-600 text-white disabled:opacity-50"
                  >Duyệt</button>
                  <button
                    onClick={() => reviewPending(r, 'deleted')}
                    disabled={pendingBusy === r.id}
                    className="rounded-lg bg-red-600/80 px-2.5 py-1 text-[11px] font-600 text-white disabled:opacity-50"
                  >Loại bỏ</button>
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-amber-300/70 mt-2">Sản lượng chưa duyệt KHÔNG tính vào xếp hạng/báo cáo. Sửa số vào ô rồi bấm Duyệt để cập nhật con số đúng.</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-700 text-foreground">Nhập sản lượng</h2>
        <div className="flex flex-wrap gap-2">
          <select value={productId} onChange={(e) => setProductId(e.target.value)}
            className="rounded-xl border border-white/10 bg-[#162033] px-3 py-2 text-sm text-foreground">
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
          </select>
          {productionOrders.length > 0 && (
            <select value={productionOrderId} onChange={(e) => setProductionOrderId(e.target.value)}
              title="Gắn sản lượng vào lô sản xuất — để đối chiếu công nhân khai vs kho nhận"
              className="rounded-xl border border-white/10 bg-[#162033] px-3 py-2 text-sm text-foreground">
              <option value="">— Không gắn lô SX —</option>
              {productionOrders.map((po) => (
                <option key={po.id} value={po.id}>🏭 {po.code} · {po.finished_name}</option>
              ))}
            </select>
          )}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border border-white/10 bg-[#162033] px-3 py-2 text-sm text-foreground" />
        </div>
      </div>

      <div className="rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5" style={{ background: 'var(--card)' }}>
        {workers.map((w, i) => (
          <div key={w.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-xs text-muted-foreground w-6">{i + 1}</span>
            <span className="flex-1 text-sm text-foreground truncate">{w.full_name}</span>
            <input
              inputMode="decimal"
              value={qty[w.id] ?? ''}
              onChange={(e) => setQty({ ...qty, [w.id]: e.target.value.replace(/[^\d.]/g, '') })}
              placeholder="0"
              className="w-24 rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-sm text-foreground text-right"
            />
            <span className="text-xs text-muted-foreground w-10">{product?.unit}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 sticky bottom-4">
        <p className="text-sm text-muted-foreground">
          Tổng: <b className="text-foreground">{total.toLocaleString('vi-VN')}</b> {product?.unit}
          {savedMsg && <span className="ml-3 text-xs">{savedMsg}</span>}
        </p>
        <button onClick={save} disabled={saving}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-600 text-white disabled:opacity-50 flex items-center gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu sản lượng
        </button>
      </div>
    </div>
  );
}
