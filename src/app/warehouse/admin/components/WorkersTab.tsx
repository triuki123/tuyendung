'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Users, KeyRound, UserX, UserCheck, X, Download, Trash2 } from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { canAccess } from '@/lib/permissions';

/** Quản lý công nhân: tạo nhanh, cấp PIN, ngưng/tái kích hoạt, xuất hồ sơ, xóa cứng */
export default function WorkersTab({ warehouseId }: { warehouseId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [pinShown, setPinShown] = useState<{ name: string; pin: string } | null>(null);
  const [busyId, setBusyId] = useState('');
  const [deleteWorker, setDeleteWorker] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Xóa cứng: quyền RBAC Xóa module Kho/Xưởng (đã bỏ rào super_admin)
  const [canHardDelete, setCanHardDelete] = useState(false);
  useEffect(() => {
    const u = getCurrentUser();
    setCanHardDelete(canAccess((u as any)?.module_permissions, 'warehouse', 'delete'));
  }, []);

  const confirmHardDelete = async () => {
    if (!deleteWorker) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/warehouse/admin/workers/${deleteWorker.id}`, { method: 'DELETE' });
      if (res.ok) { setDeleteWorker(null); load(); }
    } finally {
      setDeleting(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, s] = await Promise.all([
        fetch(`/api/warehouse/admin/workers?warehouseId=${warehouseId}`).then((r) => r.json()),
        fetch(`/api/warehouse/admin/shifts?warehouseId=${warehouseId}`).then((r) => r.json()),
      ]);
      setRows(w.data || []);
      setShifts((s.data || []).filter((x: any) => x.active));
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, action: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/warehouse/admin/workers/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (action === 'reset-pin' && json.data?.pin) {
        const w = rows.find((r) => r.id === id);
        setPinShown({ name: w?.full_name || '', pin: json.data.pin });
      }
      load();
    } finally {
      setBusyId('');
    }
  };

  const exportWorker = async (id: string, name: string) => {
    // Xuất toàn bộ công + sản lượng của công nhân (đối chiếu khi nghỉ việc)
    const XLSX = await import('xlsx-js-style');
    const months: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const att: any[] = [];
    const out: any[] = [];
    for (const m of months) {
      const res = await fetch(`/api/warehouse/admin/workers/${id}?month=${m}`).then((r) => r.json());
      att.push(...(res.data?.attendance || []));
      out.push(...(res.data?.output || []));
    }
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(att.map((r) => ({
      'Ngày': r.work_date, 'Giờ vào': r.check_in_at, 'Giờ ra': r.check_out_at, 'Ca': r.shift_name || '', 'Ghi chú': r.note || '',
    })));
    XLSX.utils.book_append_sheet(wb, ws1, 'Bảng Công');
    const ws2 = XLSX.utils.json_to_sheet(out.map((r) => ({
      'Ngày': r.work_date, 'Sản phẩm': r.product_name, 'Số lượng': Number(r.quantity), 'Đơn vị': r.unit,
    })));
    XLSX.utils.book_append_sheet(wb, ws2, 'Sản Lượng');
    XLSX.writeFile(wb, `ho-so-${name.replace(/\s+/g, '-')}.xlsx`);
  };

  const filtered = rows.filter((r) =>
    !search || r.full_name.toLowerCase().includes(search.toLowerCase()) || r.cccd.includes(search)
  );
  const activeCount = rows.filter((r) => r.status === 'active').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-700 text-foreground">Công nhân</h2>
          <p className="text-xs text-muted-foreground">{activeCount} đang làm · {rows.length - activeCount} đã nghỉ</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-600 text-white flex items-center gap-2 justify-center">
          <Plus className="h-4 w-4" /> Thêm công nhân
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Tìm theo tên hoặc CCCD..."
        className="w-full rounded-xl border border-white/10 bg-[#162033] px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50"
      />

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <Users className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có công nhân</p>
          <p className="text-xs mt-1 opacity-60">Bấm &quot;Thêm công nhân&quot; để tạo tài khoản đầu tiên</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5" style={{ background: 'var(--card)' }}>
          {filtered.map((r) => (
            <div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-600 ${r.status === 'active' ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                  {r.full_name}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  CCCD {r.cccd}{r.contact ? ` · ${r.contact}` : ''}{r.shift_name ? ` · Ca ${r.shift_name}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {busyId === r.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <button onClick={() => act(r.id, 'reset-pin')} title="Cấp lại PIN" className="btn-ghost rounded-lg p-2">
                      <KeyRound className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <button onClick={() => exportWorker(r.id, r.full_name)} title="Xuất hồ sơ Excel (12 tháng)" className="btn-ghost rounded-lg p-2">
                      <Download className="h-4 w-4 text-muted-foreground" />
                    </button>
                    {r.status === 'active' ? (
                      <button onClick={() => act(r.id, 'deactivate')} title="Ngưng làm việc (giữ lịch sử)" className="btn-ghost rounded-lg p-2">
                        <UserX className="h-4 w-4 text-orange-400" />
                      </button>
                    ) : (
                      <button onClick={() => act(r.id, 'reactivate')} title="Tái kích hoạt" className="btn-ghost rounded-lg p-2">
                        <UserCheck className="h-4 w-4 text-emerald-400" />
                      </button>
                    )}
                    {canHardDelete && (
                      <button onClick={() => setDeleteWorker(r)} title="Xóa cứng (xóa hẳn + toàn bộ dữ liệu)" className="btn-ghost rounded-lg p-2">
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-sm rounded-3xl border border-white/10 p-6" style={{ background: 'var(--card)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Trash2 className="h-5 w-5 text-red-400" />
              <h3 className="text-base font-700 text-foreground">Xóa cứng công nhân?</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Xóa hẳn <b className="text-foreground">{deleteWorker.full_name}</b> (CCCD {deleteWorker.cccd}) cùng
              <b className="text-foreground"> toàn bộ chấm công, ảnh, sản lượng, đơn từ</b> tại kho này.
              Không khôi phục được — chỉ dùng để dọn dữ liệu test.
            </p>
            <p className="text-[11px] text-muted-foreground/70 mt-2">Muốn giữ lịch sử thì dùng &quot;Ngưng làm việc&quot; thay vì xóa cứng.</p>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setDeleteWorker(null)} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
              <button onClick={confirmHardDelete} disabled={deleting}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-600 text-white disabled:opacity-50 flex items-center gap-2">
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />} Xóa cứng
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateWorkerModal
          warehouseId={warehouseId}
          shifts={shifts}
          onClose={() => setShowCreate(false)}
          onCreated={(name, pin) => { setShowCreate(false); setPinShown({ name, pin }); load(); }}
        />
      )}

      {pinShown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-sm rounded-3xl border border-white/10 p-6 text-center" style={{ background: 'var(--card)' }}>
            <h3 className="text-base font-700 text-foreground">Mã PIN của {pinShown.name}</h3>
            <p className="text-4xl font-700 text-indigo-400 tracking-[0.3em] my-5">{pinShown.pin}</p>
            <p className="text-xs text-muted-foreground">Ghi lại và đưa cho công nhân — mã này chỉ hiện 1 lần.<br />Đây là <b className="text-foreground">PIN tạm</b>: lần đầu đăng nhập tại <b className="text-foreground">/warehouse</b> (CCCD + PIN) hệ thống sẽ bắt tự đặt PIN mới.</p>
            <button onClick={() => setPinShown(null)} className="mt-5 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-600 text-white">Đã ghi xong</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateWorkerModal({ warehouseId, shifts, onClose, onCreated }: {
  warehouseId: string; shifts: any[]; onClose: () => void; onCreated: (name: string, pin: string) => void;
}) {
  const [form, setForm] = useState({ fullName: '', dob: '', contact: '', cccd: '', shiftId: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/warehouse/admin/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouseId, ...form, dob: form.dob || null, shiftId: form.shiftId || null }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Tạo thất bại'); return; }
      onCreated(json.data.worker.full_name, json.data.pin);
    } catch {
      setError('Lỗi kết nối');
    } finally {
      setBusy(false);
    }
  };

  const input = 'mt-1.5 w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50';
  const label = 'text-xs font-600 text-muted-foreground uppercase tracking-wider';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-base font-700 text-foreground">Thêm công nhân</h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className={label}>Họ tên *</label>
            <input className={input} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Nguyễn Văn A" />
          </div>
          <div>
            <label className={label}>Số CCCD *</label>
            <input className={input} inputMode="numeric" value={form.cccd}
              onChange={(e) => setForm({ ...form, cccd: e.target.value.replace(/\D/g, '').slice(0, 12) })} placeholder="12 chữ số" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Ngày sinh</label>
              <input type="date" className={input} value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
            </div>
            <div>
              <label className={label}>SĐT liên hệ</label>
              <input className={input} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="09xx..." />
            </div>
          </div>
          {shifts.length > 0 && (
            <div>
              <label className={label}>Ca mặc định</label>
              <select className={input} value={form.shiftId} onChange={(e) => setForm({ ...form, shiftId: e.target.value })}>
                <option value="">— Không gán ca —</option>
                {shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)})</option>)}
              </select>
            </div>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button onClick={submit} disabled={busy || !form.fullName || form.cccd.length < 9}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white disabled:opacity-50 flex items-center gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Tạo & cấp PIN
          </button>
        </div>
      </div>
    </div>
  );
}
