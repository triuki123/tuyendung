'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Package, Plus, X, Search, AlertTriangle, History,
  ArrowDownToLine, ArrowUpFromLine, UserPlus, Undo2, Trash2,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { canAccess } from '@/lib/permissions';

type Kind = 'material' | 'tool';
type MoveType = 'in' | 'out' | 'assign' | 'return';

interface Supply {
  id: string; name: string; kind: Kind; unit: string;
  min_quantity: number | null; note: string | null;
  in_stock: number; assigned: number; low: boolean;
}
interface Worker { id: string; full_name: string }

const KIND_LABEL: Record<Kind, string> = {
  material: 'Nguyên vật liệu',
  tool: 'Công cụ dụng cụ',
};

const MOVE_META: Record<MoveType, { label: string; icon: any; cls: string }> = {
  in:     { label: 'Nhập kho',   icon: ArrowDownToLine, cls: 'text-emerald-400' },
  out:    { label: 'Xuất kho',   icon: ArrowUpFromLine, cls: 'text-amber-400' },
  assign: { label: 'Cấp phát',   icon: UserPlus,        cls: 'text-blue-400' },
  return: { label: 'Thu hồi',    icon: Undo2,           cls: 'text-purple-400' },
};

/** Số lượng có thể lẻ (12,5 kg) → hiện theo vi-VN, bỏ số 0 thừa. */
function fmtQty(n: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(n);
}

/**
 * Tab Vật Tư — nguyên vật liệu + công cụ dụng cụ của kho.
 * Tách biệt với module Tài Sản: sổ nội bộ, mỗi kho tự quản, quản lý kho nhập liệu.
 * Tồn kho do server tính từ sổ biến động (không lưu sẵn) ⇒ luôn khớp lịch sử.
 */
export default function SuppliesTab({ warehouseId }: { warehouseId: string }) {
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | Kind>('all');

  const [showCreate, setShowCreate] = useState(false);
  const [moveFor, setMoveFor] = useState<{ supply: Supply; type: MoveType } | null>(null);
  const [historyFor, setHistoryFor] = useState<Supply | null>(null);
  const [deleteFor, setDeleteFor] = useState<Supply | null>(null);

  const [perms, setPerms] = useState({ create: false, edit: false, remove: false });
  useEffect(() => {
    const p = (getCurrentUser() as any)?.module_permissions;
    setPerms({
      create: canAccess(p, 'warehouse', 'create'),
      edit: canAccess(p, 'warehouse', 'edit'),
      remove: canAccess(p, 'warehouse', 'delete'),
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, w] = await Promise.all([
        fetch(`/api/warehouse/admin/supplies?warehouseId=${warehouseId}`).then((r) => r.json()),
        fetch(`/api/warehouse/admin/workers?warehouseId=${warehouseId}&status=active`).then((r) => r.json()),
      ]);
      setSupplies(s.data || []);
      setWorkers(w.data || []);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return supplies.filter((s) => {
      if (kindFilter !== 'all' && s.kind !== kindFilter) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [supplies, search, kindFilter]);

  const lowCount = supplies.filter((s) => s.low).length;

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-700 text-foreground">Vật tư</h2>
          <p className="text-xs text-muted-foreground">
            {supplies.length} mục
            {lowCount > 0 && <span className="text-red-400"> · {lowCount} sắp hết</span>}
          </p>
        </div>
        {perms.create && (
          <button onClick={() => setShowCreate(true)}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white flex items-center gap-2 justify-center">
            <Plus className="h-4 w-4" /> Thêm vật tư
          </button>
        )}
      </div>

      {/* Lọc */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên vật tư..."
            className="w-full rounded-xl border border-white/10 bg-[#162033] pl-9 pr-3 py-2 text-sm text-foreground" />
        </div>
        <div className="flex gap-1 rounded-xl border border-white/10 p-1" style={{ background: 'var(--card)' }}>
          {([['all', 'Tất cả'], ['material', 'NVL'], ['tool', 'CCDC']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setKindFilter(k as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-600 whitespace-nowrap ${
                kindFilter === k ? 'bg-indigo-500/20 text-indigo-400' : 'text-muted-foreground hover:text-foreground'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Danh sách */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <Package className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">{supplies.length === 0 ? 'Chưa có vật tư nào' : 'Không tìm thấy vật tư phù hợp'}</p>
          <p className="text-xs mt-1 opacity-60">
            {supplies.length === 0 ? 'Bấm "Thêm vật tư" để khai báo nguyên vật liệu / công cụ dụng cụ' : 'Thử đổi từ khóa hoặc bộ lọc'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5" style={{ background: 'var(--card)' }}>
          {filtered.map((s) => (
            <div key={s.id} className="p-4 space-y-3">
              {/* Dòng thông tin */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-600 text-foreground truncate">{s.name}</p>
                    <span className={`px-1.5 py-0.5 rounded text-2xs font-600 ${
                      s.kind === 'tool' ? 'bg-purple-500/15 text-purple-400' : 'bg-sky-500/15 text-sky-400'
                    }`}>
                      {s.kind === 'tool' ? 'CCDC' : 'NVL'}
                    </span>
                    {s.low && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-600 bg-red-500/15 text-red-400">
                        <AlertTriangle className="h-3 w-3" /> Sắp hết
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tồn: <b className={s.low ? 'text-red-400' : 'text-foreground'}>{fmtQty(s.in_stock)}</b> {s.unit}
                    {s.assigned > 0 && <> · Đang cấp phát: <b className="text-blue-400">{fmtQty(s.assigned)}</b> {s.unit}</>}
                    {s.min_quantity != null && <span className="opacity-60"> · ngưỡng {fmtQty(s.min_quantity)}</span>}
                  </p>
                  {s.note && <p className="text-2xs text-muted-foreground/70 mt-0.5 truncate">{s.note}</p>}
                </div>
              </div>

              {/* Thao tác */}
              <div className="flex flex-wrap items-center gap-1.5">
                {perms.edit && (['in', 'out', 'assign', 'return'] as MoveType[]).map((t) => {
                  const m = MOVE_META[t];
                  const Icon = m.icon;
                  return (
                    <button key={t} onClick={() => setMoveFor({ supply: s, type: t })}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-2xs font-600 text-muted-foreground hover:text-foreground hover:bg-white/5">
                      <Icon className={`h-3.5 w-3.5 ${m.cls}`} /> {m.label}
                    </button>
                  );
                })}
                <button onClick={() => setHistoryFor(s)}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-2xs font-600 text-muted-foreground hover:text-foreground hover:bg-white/5">
                  <History className="h-3.5 w-3.5" /> Lịch sử
                </button>
                {perms.remove && (
                  <button onClick={() => setDeleteFor(s)}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-2xs font-600 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 ml-auto">
                    <Trash2 className="h-3.5 w-3.5" /> Xóa
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateSupplyModal warehouseId={warehouseId}
          onClose={() => setShowCreate(false)}
          onDone={() => { setShowCreate(false); load(); }} />
      )}
      {moveFor && (
        <MoveModal warehouseId={warehouseId} supply={moveFor.supply} moveType={moveFor.type} workers={workers}
          onClose={() => setMoveFor(null)}
          onDone={() => { setMoveFor(null); load(); }} />
      )}
      {historyFor && (
        <HistoryModal warehouseId={warehouseId} supply={historyFor} onClose={() => setHistoryFor(null)} />
      )}
      {deleteFor && (
        <DeleteModal warehouseId={warehouseId} supply={deleteFor}
          onClose={() => setDeleteFor(null)}
          onDone={() => { setDeleteFor(null); load(); }} />
      )}
    </div>
  );
}

// ===== Modal: thêm vật tư =====

function CreateSupplyModal({ warehouseId, onClose, onDone }: {
  warehouseId: string; onClose: () => void; onDone: () => void;
}) {
  const [form, setForm] = useState({ name: '', kind: 'material' as Kind, unit: 'cái', minQuantity: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!form.name.trim()) { setErr('Nhập tên vật tư'); return; }
    setSaving(true); setErr('');
    try {
      const res = await fetch('/api/warehouse/admin/supplies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouseId, ...form }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Lỗi lưu'); return; }
      onDone();
    } finally { setSaving(false); }
  };

  return (
    <Modal title="Thêm vật tư" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Tên vật tư *">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="VD: Băng dính, Kéo cắt vải..." className={inputCls} autoFocus />
        </Field>

        <Field label="Loại">
          <div className="grid grid-cols-2 gap-2">
            {(['material', 'tool'] as Kind[]).map((k) => (
              <button key={k} onClick={() => setForm({ ...form, kind: k, unit: k === 'tool' ? 'cái' : form.unit })}
                className={`rounded-xl border px-3 py-2.5 text-xs font-600 ${
                  form.kind === k ? 'border-indigo-500 bg-indigo-500/15 text-indigo-400' : 'border-white/10 text-muted-foreground hover:text-foreground'
                }`}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <p className="text-2xs text-muted-foreground/60 mt-1">
            {form.kind === 'material' ? 'Dùng là hết — theo dõi nhập/xuất/tồn (vải, keo, thùng...)' : 'Dùng nhiều lần — cấp phát cho công nhân rồi thu hồi (kéo, xe đẩy...)'}
          </p>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Đơn vị">
            <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="cái / kg / mét" className={inputCls} />
          </Field>
          <Field label="Ngưỡng cảnh báo">
            <input inputMode="decimal" value={form.minQuantity}
              onChange={(e) => setForm({ ...form, minQuantity: e.target.value.replace(/[^\d.]/g, '') })}
              placeholder="để trống = không nhắc" className={inputCls} />
          </Field>
        </div>

        <Field label="Ghi chú">
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Không bắt buộc" className={inputCls} />
        </Field>

        {err && <p className="text-xs text-red-400">{err}</p>}
      </div>

      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label="Thêm" />
    </Modal>
  );
}

// ===== Modal: ghi phiếu nhập/xuất/cấp phát/thu hồi =====

function MoveModal({ warehouseId, supply, moveType, workers, onClose, onDone }: {
  warehouseId: string; supply: Supply; moveType: MoveType; workers: Worker[];
  onClose: () => void; onDone: () => void;
}) {
  const [quantity, setQuantity] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [holders, setHolders] = useState<{ worker_id: string; worker_name: string; quantity: number }[]>([]);

  const needsWorker = moveType === 'assign' || moveType === 'return';
  const meta = MOVE_META[moveType];

  // Khi THU HỒI: chỉ cho chọn người đang thực giữ, và hiện họ giữ bao nhiêu —
  // tránh chọn nhầm người rồi bị server từ chối.
  useEffect(() => {
    if (moveType !== 'return') return;
    fetch(`/api/warehouse/admin/supplies/moves?warehouseId=${warehouseId}&supplyId=${supply.id}`)
      .then((r) => r.json())
      .then((j) => setHolders(j.data?.holders || []))
      .catch(() => {});
  }, [moveType, warehouseId, supply.id]);

  const submit = async () => {
    const q = Number(quantity);
    if (!Number.isFinite(q) || q <= 0) { setErr('Nhập số lượng lớn hơn 0'); return; }
    if (needsWorker && !workerId) { setErr('Chọn công nhân'); return; }
    setSaving(true); setErr('');
    try {
      const res = await fetch('/api/warehouse/admin/supplies/moves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouseId, supplyId: supply.id, moveType, quantity: q, workerId: workerId || null, note }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Lỗi lưu'); return; }
      onDone();
    } finally { setSaving(false); }
  };

  const selectable = moveType === 'return' ? holders : workers;
  const holding = holders.find((h) => h.worker_id === workerId)?.quantity;

  return (
    <Modal title={`${meta.label} — ${supply.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl border border-white/5 px-3 py-2 text-xs text-muted-foreground" style={{ background: 'var(--background)' }}>
          Tồn hiện tại: <b className="text-foreground">{fmtQty(supply.in_stock)}</b> {supply.unit}
          {supply.assigned > 0 && <> · đang cấp phát <b className="text-blue-400">{fmtQty(supply.assigned)}</b> {supply.unit}</>}
        </div>

        {needsWorker && (
          <Field label={moveType === 'assign' ? 'Cấp cho công nhân *' : 'Thu hồi từ công nhân *'}>
            {moveType === 'return' && holders.length === 0 ? (
              <p className="text-xs text-amber-400">Chưa có ai đang giữ vật tư này.</p>
            ) : (
              <select value={workerId} onChange={(e) => setWorkerId(e.target.value)} className={inputCls}>
                <option value="">— Chọn công nhân —</option>
                {selectable.map((w: any) => (
                  <option key={w.id || w.worker_id} value={w.id || w.worker_id}>
                    {w.full_name || w.worker_name}
                    {w.quantity != null ? ` (đang giữ ${fmtQty(w.quantity)} ${supply.unit})` : ''}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}

        <Field label={`Số lượng * (${supply.unit})`}>
          <input inputMode="decimal" value={quantity} autoFocus
            onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="0" className={inputCls} />
          {moveType === 'return' && holding != null && (
            <p className="text-2xs text-muted-foreground/60 mt-1">Người này đang giữ {fmtQty(holding)} {supply.unit}</p>
          )}
        </Field>

        <Field label="Ghi chú">
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={moveType === 'out' ? 'VD: hỏng, mất, dùng hết...' : 'Không bắt buộc'} className={inputCls} />
        </Field>

        {err && <p className="text-xs text-red-400">{err}</p>}
      </div>

      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label={meta.label}
        disabled={moveType === 'return' && holders.length === 0} />
    </Modal>
  );
}

// ===== Modal: lịch sử biến động =====

function HistoryModal({ warehouseId, supply, onClose }: {
  warehouseId: string; supply: Supply; onClose: () => void;
}) {
  const [moves, setMoves] = useState<any[]>([]);
  const [holders, setHolders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/warehouse/admin/supplies/moves?warehouseId=${warehouseId}&supplyId=${supply.id}`)
      .then((r) => r.json())
      .then((j) => { setMoves(j.data?.moves || []); setHolders(j.data?.holders || []); })
      .finally(() => setLoading(false));
  }, [warehouseId, supply.id]);

  return (
    <Modal title={`Lịch sử — ${supply.name}`} onClose={onClose}>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-4">
          {holders.length > 0 && (
            <div>
              <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider mb-2">Đang giữ</p>
              <div className="rounded-xl border border-white/5 divide-y divide-white/5" style={{ background: 'var(--background)' }}>
                {holders.map((h) => (
                  <div key={h.worker_id} className="flex justify-between px-3 py-2 text-xs">
                    <span className="text-foreground">{h.worker_name}</span>
                    <span className="text-blue-400 font-600">{fmtQty(h.quantity)} {supply.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider mb-2">Biến động</p>
            {moves.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">Chưa có biến động nào</p>
            ) : (
              <div className="space-y-2 max-h-[45vh] overflow-y-auto">
                {moves.map((m) => {
                  const meta = MOVE_META[m.move_type as MoveType];
                  const Icon = meta.icon;
                  const plus = m.move_type === 'in' || m.move_type === 'return';
                  return (
                    <div key={m.id} className="flex items-start gap-2.5 rounded-xl border border-white/5 px-3 py-2"
                      style={{ background: 'var(--background)' }}>
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.cls}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-foreground">
                          <b className={meta.cls}>{meta.label}</b>
                          <span className="ml-1.5 font-600">{plus ? '+' : '−'}{fmtQty(m.quantity)} {m.unit}</span>
                          {m.worker_name && <span className="text-muted-foreground"> · {m.worker_name}</span>}
                        </p>
                        {m.note && <p className="text-2xs text-muted-foreground/70 mt-0.5">{m.note}</p>}
                        <p className="text-2xs text-muted-foreground/50 mt-0.5">
                          {new Date(m.created_at).toLocaleString('vi-VN')}
                          {m.performed_by_name && ` · ${m.performed_by_name}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4 -mx-6 -mb-6 mt-6">
        <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Đóng</button>
      </div>
    </Modal>
  );
}

// ===== Modal: xóa =====

function DeleteModal({ warehouseId, supply, onClose, onDone }: {
  warehouseId: string; supply: Supply; onClose: () => void; onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setSaving(true); setErr('');
    try {
      const res = await fetch(`/api/warehouse/admin/supplies?warehouseId=${warehouseId}&id=${supply.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Lỗi xóa'); return; }
      onDone();
    } finally { setSaving(false); }
  };

  return (
    <Modal title="Xóa vật tư" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-foreground">
          Xóa <b>{supply.name}</b> và <b className="text-red-400">toàn bộ lịch sử biến động</b> của nó?
        </p>
        <p className="text-xs text-muted-foreground">
          Không khôi phục được. Nếu chỉ muốn ngừng dùng mà giữ lịch sử, hãy xuất hết tồn thay vì xóa.
        </p>
        {supply.assigned > 0 && (
          <p className="text-xs text-amber-400">
            ⚠️ Còn {fmtQty(supply.assigned)} {supply.unit} đang ở tay công nhân — nên thu hồi trước khi xóa.
          </p>
        )}
        {err && <p className="text-xs text-red-400">{err}</p>}
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label="Xóa" danger />
    </Modal>
  );
}

// ===== Mảnh dùng chung =====

const inputCls = 'w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2.5 text-sm text-foreground';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-base font-700 text-foreground truncate pr-2">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ onClose, onSubmit, saving, label, danger, disabled }: {
  onClose: () => void; onSubmit: () => void; saving: boolean; label: string; danger?: boolean; disabled?: boolean;
}) {
  return (
    <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4 -mx-6 -mb-6 mt-6">
      <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Hủy</button>
      <button onClick={onSubmit} disabled={saving || disabled}
        className={`rounded-xl px-4 py-2 text-sm font-600 text-white disabled:opacity-50 flex items-center gap-2 ${
          danger ? 'bg-red-600' : 'bg-indigo-600'
        }`}>
        {saving && <Loader2 className="h-4 w-4 animate-spin" />} {label}
      </button>
    </div>
  );
}
