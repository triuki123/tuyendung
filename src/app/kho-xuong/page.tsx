'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Warehouse, Users, Fingerprint, AlertTriangle, CheckSquare, ArrowRight, Lock, Plus, X, Settings } from 'lucide-react';
import WarehouseConfigModal from './components/WarehouseConfigModal';
import AppLayout from '@/components/AppLayout';
import { getCurrentUser } from '@/lib/authStore';
import { canAccess } from '@/lib/permissions';

/**
 * Kho / Xưởng — tổng quan mini-site /warehouse ngay trong app chính.
 * RBAC NGHIÊM NGẶT module 'warehouse': không tick quyền Xem (kể cả super_admin)
 * là không thấy dữ liệu; server cũng chặn tương tự.
 */
export default function KhoXuongPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [canConfigure, setCanConfigure] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [configWh, setConfigWh] = useState<any | null>(null);

  const load = useCallback(() => {
    const user = getCurrentUser();
    const perms = (user as any)?.module_permissions;
    if (!canAccess(perms, 'warehouse', 'view')) {
      setDenied(true);
      setLoading(false);
      return;
    }
    // Quyền do RBAC quyết định (đã bỏ rào super_admin). Server enforce lần nữa.
    // Tạo kho cần Thêm; cấu hình kho cần Sửa — hai quyền TÁCH BIỆT, đừng gộp.
    setCanCreate(canAccess(perms, 'warehouse', 'create'));
    setCanConfigure(canAccess(perms, 'warehouse', 'edit'));
    fetch('/api/warehouse/admin/overview')
      .then((r) => {
        if (r.status === 403) { setDenied(true); return { data: [] }; }
        return r.json();
      })
      .then((j) => setRows(j.data || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <AppLayout activePath="/kho-xuong">
      <div className="space-y-5 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-700">Kho / Xưởng</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Tổng quan công nhân, chấm công & sản lượng các kho</p>
          </div>
          {!denied && (
            <div className="flex flex-col sm:flex-row gap-2">
              {canCreate && (
                <button onClick={() => setShowCreate(true)}
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-600 text-foreground flex items-center gap-2 justify-center">
                  <Plus className="h-4 w-4" /> Tạo kho mới
                </button>
              )}
              <a href="/warehouse/admin" className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-600 text-white flex items-center gap-2 justify-center">
                Mở Warehouse Admin <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : denied ? (
          <div className="flex flex-col items-center py-20 text-muted-foreground">
            <Lock className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">Bạn chưa được cấp quyền Kho / Xưởng</p>
            <p className="text-xs mt-1 opacity-60">Cần được tick quyền &quot;Xem&quot; module Kho / Xưởng trong ma trận phân quyền</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-muted-foreground">
            <Warehouse className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">Chưa có kho nào (hoặc bạn chưa được gán quản lý kho)</p>
            <p className="text-xs mt-1 opacity-60">
              {canCreate ? 'Bấm "Tạo kho mới" để tạo kho đầu tiên' : 'Liên hệ quản trị để tạo kho & gán bạn làm quản lý kho'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {rows.map((w) => (
              <div key={w.id}
                onClick={() => { window.location.href = `/warehouse/admin?wh=${w.id}`; }}
                className="rounded-2xl border border-white/5 overflow-hidden cursor-pointer transition-colors hover:border-indigo-500/40"
                style={{ background: 'var(--card)' }}
                title={`Mở Warehouse Admin — ${w.name}`}
              >
                <div className="flex items-center gap-3 border-b border-white/5 px-5 py-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
                    <Warehouse className="h-5 w-5 text-amber-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-600 text-foreground truncate">{w.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      Mã {w.code}{w.company_name ? ` · ${w.company_name}` : ''} · bấm để mở kho <ArrowRight className="h-3 w-3 inline" />
                    </p>
                  </div>
                  {canConfigure && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfigWh(w); }}
                      className="btn-ghost rounded-lg p-2 shrink-0" title="Cấu hình kho"
                    >
                      <Settings className="h-4 w-4 text-muted-foreground" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2.5 p-4">
                  <Stat icon={<Users className="h-3.5 w-3.5 text-indigo-400" />} label="Đang làm" value={w.active_workers} />
                  <Stat icon={<Fingerprint className="h-3.5 w-3.5 text-emerald-400" />} label="Check-in hôm nay" value={`${w.checked_in_today}/${w.active_workers}`} />
                  <Stat icon={<AlertTriangle className="h-3.5 w-3.5 text-orange-400" />} label="Quên check-out (hôm qua)" value={w.missing_checkout_yesterday} warn={w.missing_checkout_yesterday > 0} />
                  <Stat icon={<CheckSquare className="h-3.5 w-3.5 text-purple-400" />} label="Đơn chờ duyệt" value={w.pending_requests} warn={w.pending_requests > 0} />
                </div>
                <div className="border-t border-white/5 px-5 py-3">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-600 mb-1">Sản lượng hôm qua</p>
                  {w.output_yesterday.length === 0 ? (
                    <p className="text-xs text-muted-foreground/60">Chưa nhập</p>
                  ) : (
                    <p className="text-xs text-foreground">
                      {w.output_yesterday.map((o: any) => `${o.name}: ${o.qty.toLocaleString('vi-VN')} ${o.unit}`).join(' · ')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {showCreate && (
          <CreateWarehouseModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />
        )}
        {configWh && (
          <WarehouseConfigModal warehouse={configWh} onClose={() => setConfigWh(null)} onChanged={load} />
        )}
      </div>
    </AppLayout>
  );
}

/** Tạo kho mới + gán quản lý đầu tiên (email) ngay tại app chính — cần quyền RBAC Thêm */
function CreateWarehouseModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', code: '', address: '', managerEmail: '', companyId: '' });
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/companies').then((r) => r.json()).then((j) => setCompanies(j.data || []));
  }, []);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/warehouse/admin/warehouses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(), code: form.code.trim(), address: form.address.trim() || null,
          company_id: form.companyId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Tạo kho thất bại'); return; }
      // Gán quản lý đầu tiên theo email (tùy chọn)
      if (form.managerEmail.trim()) {
        const mres = await fetch(`/api/warehouse/admin/warehouses/${json.data.id}/managers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.managerEmail.trim() }),
        });
        const mjson = await mres.json();
        if (!mres.ok) {
          setError(`Đã tạo kho nhưng gán quản lý lỗi: ${mjson.error} — gán lại trong Warehouse Admin → Cấu hình.`);
          onCreated();
          return;
        }
      }
      onCreated();
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
          <h2 className="text-base font-700 text-foreground">Tạo kho mới</h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className={label}>Tên kho *</label>
            <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="VD: Xưởng Bình Dương" />
          </div>
          <div>
            <label className={label}>Mã kho * (chữ + số, in trên QR)</label>
            <input className={input} value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') })} placeholder="VD: BD1" />
          </div>
          <div>
            <label className={label}>Địa chỉ</label>
            <input className={input} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div>
            <label className={label}>Công ty chủ quản</label>
            <select className={input} value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
              <option value="">— Không gán (chỉ quản lý được gán đích danh thấy) —</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">Người thuộc công ty này (có quyền Kho / Xưởng) sẽ thấy và quản lý được kho.</p>
          </div>
          <div>
            <label className={label}>Email quản lý kho (tùy chọn)</label>
            <input className={input} value={form.managerEmail} onChange={(e) => setForm({ ...form, managerEmail: e.target.value })} placeholder="nhanvien@fado.vn" />
            <p className="text-[11px] text-muted-foreground mt-1">Là user AssetFlow thường — người này sẽ vận hành kho trong Warehouse Admin. GPS, ca, sản phẩm cấu hình sau ở đó.</p>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button onClick={submit} disabled={busy || !form.name.trim() || !form.code.trim()}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white disabled:opacity-50 flex items-center gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Tạo kho
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, warn }: { icon: React.ReactNode; label: string; value: any; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">{icon} {label}</p>
      <p className={`text-lg font-700 mt-0.5 ${warn ? 'text-orange-400' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}
