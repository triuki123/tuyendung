'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, MapPin, Clock, Package, Mail, QrCode, Users, Trash2, Save, LocateFixed, X } from 'lucide-react';

/**
 * Modal cấu hình 1 kho — mở từ thẻ kho ở trang /kho-xuong.
 * Quyền: RBAC Sửa module 'warehouse' + là quản lý của kho đó (API enforce lại).
 * Gồm: GPS + bán kính, ca, sản phẩm, email báo cáo, giữ ảnh, quản lý kho,
 * cờ ứng lương, QR cổng.
 */
export default function WarehouseConfigModal({ warehouse, onClose, onChanged }: { warehouse: any; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingWh, setSavingWh] = useState(false);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState<any>({});
  // Thêm ca / sản phẩm / quản lý
  const [newShift, setNewShift] = useState({ name: '', start_time: '', end_time: '' });
  const [newProduct, setNewProduct] = useState({ name: '', unit: '' });
  const [newManagerEmail, setNewManagerEmail] = useState('');
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch('/api/companies').then((r) => r.json()).then((j) => setCompanies(j.data || []));
  }, []);

  const load = useCallback(async () => {
    if (!warehouse) { setDetail(null); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/warehouse/admin/warehouses/${warehouse.id}`);
      const json = await res.json();
      setDetail(json.data || null);
      const w = json.data?.warehouse;
      if (w) {
        setForm({
          name: w.name, code: w.code, address: w.address || '',
          lat: w.lat ?? '', lng: w.lng ?? '', radius_m: w.radius_m,
          photo_retention_days: w.photo_retention_days,
          report_emails: (w.report_emails || []).join(', '),
          advance_enabled: !!w.advance_enabled,
          company_id: w.company_id || '',
          attendance_mode: w.attendance_mode === 'flex' ? 'flex' : 'shift',
        });
      }
    } finally {
      setLoading(false);
    }
  }, [warehouse]);

  useEffect(() => { load(); }, [load]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  const saveWarehouse = async () => {
    if (!warehouse) return;
    setSavingWh(true);
    try {
      const res = await fetch(`/api/warehouse/admin/warehouses/${warehouse.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, address: form.address || null,
          lat: form.lat === '' ? null : Number(form.lat),
          lng: form.lng === '' ? null : Number(form.lng),
          radius_m: Number(form.radius_m) || 200,
          photo_retention_days: Number(form.photo_retention_days) || 40,
          report_emails: String(form.report_emails).split(',').map((s: string) => s.trim()).filter(Boolean),
          advance_enabled: !!form.advance_enabled,
          company_id: form.company_id || null,
          attendance_mode: form.attendance_mode === 'flex' ? 'flex' : 'shift',
        }),
      });
      if (res.ok) { flash('✅ Đã lưu cấu hình kho'); onChanged(); }
      else flash('❌ Lỗi lưu');
    } finally {
      setSavingWh(false);
    }
  };

  const useMyLocation = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setForm({ ...form, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) }),
      () => flash('❌ Không lấy được vị trí — bật định vị và thử lại')
    );
  };

  const addShift = async () => {
    if (!warehouse || !newShift.name || !newShift.start_time || !newShift.end_time) return;
    await fetch('/api/warehouse/admin/shifts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warehouseId: warehouse.id, ...newShift }),
    });
    setNewShift({ name: '', start_time: '', end_time: '' });
    load();
  };

  const toggleShift = async (s: any) => {
    await fetch('/api/warehouse/admin/shifts', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warehouseId: warehouse.id, id: s.id, active: !s.active }),
    });
    load();
  };

  const addProduct = async () => {
    if (!warehouse || !newProduct.name) return;
    await fetch('/api/warehouse/admin/products', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warehouseId: warehouse.id, name: newProduct.name, unit: newProduct.unit || 'cái' }),
    });
    setNewProduct({ name: '', unit: '' });
    load();
  };

  const toggleProduct = async (p: any) => {
    await fetch('/api/warehouse/admin/products', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warehouseId: warehouse.id, id: p.id, active: !p.active }),
    });
    load();
  };

  const addManager = async () => {
    if (!warehouse || !newManagerEmail) return;
    const res = await fetch(`/api/warehouse/admin/warehouses/${warehouse.id}/managers`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newManagerEmail }),
    });
    const json = await res.json();
    if (!res.ok) flash(`❌ ${json.error}`);
    else { setNewManagerEmail(''); flash('✅ Đã thêm quản lý'); }
    load();
  };

  const removeManager = async (userId: string) => {
    await fetch(`/api/warehouse/admin/warehouses/${warehouse.id}/managers?userId=${userId}`, { method: 'DELETE' });
    load();
  };

  const input = 'w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50';
  const label = 'text-xs font-600 text-muted-foreground uppercase tracking-wider';
  const card = 'rounded-2xl border border-white/5 p-5 space-y-4';
  const sectionTitle = 'text-sm font-700 text-foreground flex items-center gap-2';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-4xl rounded-3xl border border-white/10 my-4" style={{ background: 'var(--background)' }}>
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-3xl border-b border-white/5 px-6 py-4" style={{ background: 'var(--card)' }}>
          <div>
            <h2 className="text-base font-700 text-foreground">Cấu hình kho — {warehouse.name}</h2>
            {msg && <p className="text-xs mt-0.5">{msg}</p>}
          </div>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 sm:p-6">
      {loading || !detail ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* GPS + thông tin chung */}
          <div className={card} style={{ background: 'var(--card)' }}>
            <p className={sectionTitle}><MapPin className="h-4 w-4 text-indigo-400" /> Vị trí & chấm công GPS</p>
            <div>
              <label className={label}>Tên kho</label>
              <input className={input + ' mt-1.5'} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className={label}>Địa chỉ</label>
              <input className={input + ' mt-1.5'} value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <label className={label}>Công ty chủ quản</label>
              <select className={input + ' mt-1.5'} value={form.company_id || ''} onChange={(e) => setForm({ ...form, company_id: e.target.value })}>
                <option value="">— Không gán (chỉ quản lý đích danh thấy) —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">Người được gán quản lý kho (và có quyền Kho / Xưởng) sẽ thấy kho này; super admin có quyền thấy tất cả.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Vĩ độ (lat)</label>
                <input className={input + ' mt-1.5'} value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="10.762622" />
              </div>
              <div>
                <label className={label}>Kinh độ (lng)</label>
                <input className={input + ' mt-1.5'} value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="106.660172" />
              </div>
            </div>
            <button onClick={useMyLocation} className="text-xs text-indigo-400 font-600 flex items-center gap-1.5">
              <LocateFixed className="h-3.5 w-3.5" /> Lấy vị trí hiện tại của tôi (đứng tại kho)
            </button>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Bán kính (m)</label>
                <input className={input + ' mt-1.5'} inputMode="numeric" value={form.radius_m}
                  onChange={(e) => setForm({ ...form, radius_m: e.target.value.replace(/\D/g, '') })} />
              </div>
              <div>
                <label className={label}>Giữ ảnh (ngày)</label>
                <input className={input + ' mt-1.5'} inputMode="numeric" value={form.photo_retention_days}
                  onChange={(e) => setForm({ ...form, photo_retention_days: e.target.value.replace(/\D/g, '') })} />
              </div>
            </div>
            <div>
              <label className={label}><Mail className="h-3 w-3 inline mr-1" />Email nhận báo cáo tháng (phẩy cách)</label>
              <input className={input + ' mt-1.5'} value={form.report_emails}
                onChange={(e) => setForm({ ...form, report_emails: e.target.value })} placeholder="hr@fado.vn, ketoan@fado.vn" />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={!!form.advance_enabled}
                onChange={(e) => setForm({ ...form, advance_enabled: e.target.checked })} className="rounded" />
              Bật tính năng Ứng lương (mặc định tắt — chỉ bật khi có chỉ đạo)
            </label>
            <button onClick={saveWarehouse} disabled={savingWh}
              className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-600 text-white disabled:opacity-50 flex items-center justify-center gap-2">
              {savingWh ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu cấu hình
            </button>
            <button
              onClick={async () => {
                setSavingWh(true);
                try {
                  const res = await fetch('/api/warehouse/admin/test-report', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ warehouseId: warehouse.id }),
                  });
                  const json = await res.json();
                  flash(res.ok ? `✅ Đã gửi thử tới ${(json.sent_to || []).join(', ')}` : `❌ ${json.error}`);
                } finally {
                  setSavingWh(false);
                }
              }}
              disabled={savingWh}
              className="w-full rounded-xl border border-white/10 py-2.5 text-xs font-600 text-muted-foreground hover:text-foreground disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Mail className="h-3.5 w-3.5" /> Gửi thử báo cáo tháng này ngay (kiểm tra email)
            </button>
          </div>

          <div className="space-y-4">
            {/* Ca làm việc */}
            <div className={card} style={{ background: 'var(--card)' }}>
              <p className={sectionTitle}><Clock className="h-4 w-4 text-indigo-400" /> Ca làm việc</p>

              {/* Chế độ chấm công của kho */}
              <div className="space-y-2 rounded-xl border border-white/5 bg-white/[0.03] p-3">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio" name="attendance_mode" className="mt-0.5"
                    checked={form.attendance_mode !== 'flex'}
                    onChange={() => setForm({ ...form, attendance_mode: 'shift' })}
                  />
                  <span className="text-xs">
                    <b className="text-foreground">Theo ca</b>
                    <span className="text-muted-foreground"> — mỗi ngày 1 lần vào/ra theo ca bên dưới (mặc định).</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio" name="attendance_mode" className="mt-0.5"
                    checked={form.attendance_mode === 'flex'}
                    onChange={() => setForm({ ...form, attendance_mode: 'flex' })}
                  />
                  <span className="text-xs">
                    <b className="text-foreground">Tự do nhiều đợt</b>
                    <span className="text-muted-foreground"> — công nhân vào/ra nhiều lần trong ngày, tổng giờ cộng dồn các đợt;
                    ngày chốt lúc 23:59. Quên check-out → tự khai giờ ra (quản lý duyệt).
                    Lúc check-out công nhân có thể tự khai sản lượng của đợt (quản lý duyệt).
                    Nhớ bấm <b className="text-foreground">Lưu cấu hình</b> để áp dụng.</span>
                  </span>
                </label>
              </div>

              {detail.shifts.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <span className={s.active ? 'text-foreground' : 'text-muted-foreground line-through'}>
                    {s.name} · {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}
                  </span>
                  <button onClick={() => toggleShift(s)} className="text-xs text-indigo-400 font-600">{s.active ? 'Tắt' : 'Bật'}</button>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2">
                <input className={input} placeholder="Tên ca" value={newShift.name} onChange={(e) => setNewShift({ ...newShift, name: e.target.value })} />
                <input type="time" className={input + ' w-28'} value={newShift.start_time} onChange={(e) => setNewShift({ ...newShift, start_time: e.target.value })} />
                <input type="time" className={input + ' w-28'} value={newShift.end_time} onChange={(e) => setNewShift({ ...newShift, end_time: e.target.value })} />
                <button onClick={addShift} className="rounded-xl bg-white/5 px-3 text-sm text-foreground"><Plus className="h-4 w-4" /></button>
              </div>
            </div>

            {/* Sản phẩm */}
            <div className={card} style={{ background: 'var(--card)' }}>
              <p className={sectionTitle}><Package className="h-4 w-4 text-indigo-400" /> Sản phẩm / công đoạn</p>
              {detail.products.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <span className={p.active ? 'text-foreground' : 'text-muted-foreground line-through'}>{p.name} ({p.unit})</span>
                  <button onClick={() => toggleProduct(p)} className="text-xs text-indigo-400 font-600">{p.active ? 'Ẩn' : 'Hiện'}</button>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                <input className={input} placeholder="Tên sản phẩm" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} />
                <input className={input + ' w-24'} placeholder="Đơn vị" value={newProduct.unit} onChange={(e) => setNewProduct({ ...newProduct, unit: e.target.value })} />
                <button onClick={addProduct} className="rounded-xl bg-white/5 px-3 text-sm text-foreground"><Plus className="h-4 w-4" /></button>
              </div>
            </div>

            {/* Quản lý kho */}
            <div className={card} style={{ background: 'var(--card)' }}>
              <p className={sectionTitle}><Users className="h-4 w-4 text-indigo-400" /> Quản lý kho</p>
              {detail.managers.map((m: any) => (
                <div key={m.user_id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{m.name} <span className="text-muted-foreground text-xs">({m.email})</span></span>
                  <button onClick={() => removeManager(m.user_id)} className="btn-ghost rounded p-1"><Trash2 className="h-3.5 w-3.5 text-red-400" /></button>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input className={input} placeholder="Email user AssetFlow" value={newManagerEmail} onChange={(e) => setNewManagerEmail(e.target.value)} />
                <button onClick={addManager} className="rounded-xl bg-white/5 px-3 text-sm text-foreground"><Plus className="h-4 w-4" /></button>
              </div>
            </div>

            {/* QR cổng */}
            <div className={card} style={{ background: 'var(--card)' }}>
              <p className={sectionTitle}><QrCode className="h-4 w-4 text-indigo-400" /> QR cổng kho (dự phòng GPS)</p>
              <p className="text-xs text-muted-foreground">
                Mở trang này trên tablet/màn hình treo ở cổng — QR tự đổi mỗi 10 phút, công nhân GPS lỗi
                quét mã này để chấm công (vẫn phải chụp ảnh mặt):
              </p>
              <a href={`/warehouse/gate?wh=${detail.warehouse.code}`} target="_blank"
                className="block rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-4 py-3 text-sm text-indigo-300 font-600 text-center">
                Mở màn hình QR cổng → /warehouse/gate?wh={detail.warehouse.code}
              </a>
              <p className="text-xs text-muted-foreground">
                Link app công nhân: <b className="text-foreground">{typeof window !== 'undefined' ? window.location.origin : ''}/warehouse</b> — công nhân mở bằng điện thoại, đăng nhập CCCD + PIN, có thể &quot;Thêm vào màn hình chính&quot; như 1 app.
              </p>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
