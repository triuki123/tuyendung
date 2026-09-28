'use client';

import React, { useEffect, useState } from 'react';
import { ShieldCheck, Plus, Trash2, Loader2, Save } from 'lucide-react';
import {
  AssetWarrantyConfig, DEFAULT_ASSET_WARRANTY_CONFIG, MAX_WARRANTY_MONTHS, WARRANTY_LIFETIME_MONTHS,
} from '@/lib/config/systemConfig';

function authHeaders(json = false): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const h: Record<string, string> = json ? { 'Content-Type': 'application/json' } : {};
  try {
    const u = JSON.parse(localStorage.getItem('assetflow_auth') || '{}');
    if (u.id) h['x-current-user-id'] = u.id;
    if (u.role) h['x-current-user-role'] = u.role;
  } catch { /* noop */ }
  return h;
}

/**
 * Danh sách thời hạn bảo hành — hiện trong dropdown khi thêm/sửa tài sản, hệ thống tự tính
 * ngày hết hạn = ngày mua + số tháng. months = 0 nghĩa là bảo hành TRỌN ĐỜI (không hết hạn).
 * Lưu qua system_settings (key `asset.warrantyPeriods`) — chỉ Super Admin sửa được.
 */
export default function AssetWarrantyPeriodsManager({ canEdit }: { canEdit: boolean }) {
  const [config, setConfig] = useState<AssetWarrantyConfig>(DEFAULT_ASSET_WARRANTY_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/system-config', { headers: authHeaders(), cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (j?.success && j.data?.assetWarranty) setConfig(j.data.assetWarranty); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const addPeriod = () => setConfig((prev) => ({
    periods: [...prev.periods, { id: `p_${Date.now()}`, label: '', months: 1 }],
  }));
  const removePeriod = (id: string) => setConfig((prev) => ({ periods: prev.periods.filter((p) => p.id !== id) }));
  const editPeriod = (id: string, field: 'label' | 'months', value: string) => setConfig((prev) => ({
    periods: prev.periods.map((p) => p.id === id
      ? { ...p, [field]: field === 'months' ? Math.max(0, Number(value) || 0) : value }
      : p),
  }));

  const save = async () => {
    if (config.periods.some((p) => !p.label.trim())) { setMsg({ type: 'err', text: 'Tên thời hạn không được để trống' }); return; }
    setSaving(true); setMsg(null);
    try {
      const res = await fetch('/api/system-config', {
        method: 'PUT', headers: authHeaders(true),
        body: JSON.stringify({ assetWarranty: config }),
      });
      const json = await res.json();
      if (!json.success) { setMsg({ type: 'err', text: json.error || 'Lỗi lưu cấu hình' }); return; }
      if (json.data?.assetWarranty) setConfig(json.data.assetWarranty);
      setMsg({ type: 'ok', text: 'Đã lưu danh sách thời hạn bảo hành' });
    } catch { setMsg({ type: 'err', text: 'Lỗi kết nối' }); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <h2 className="text-lg font-700 text-foreground mb-1 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-orange-400" /> Thời Hạn Bảo Hành
      </h2>
      <p className="text-xs text-muted-foreground mb-3">
        Hiện trong ô &quot;Bảo hành trong&quot; khi thêm/sửa tài sản — hệ thống tự tính ngày hết hạn từ ngày mua.
        Đặt <span className="text-foreground font-600">0 tháng</span> để đánh dấu <span className="text-foreground font-600">bảo hành trọn đời</span> (không có ngày hết hạn).
      </p>

      <div className="rounded-2xl border border-white/5 p-4 sm:p-5 space-y-3" style={{ background: 'var(--card)' }}>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {config.periods.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <input
                  value={p.label} disabled={!canEdit}
                  onChange={(e) => editPeriod(p.id, 'label', e.target.value)}
                  placeholder="VD: 1 năm"
                  className="flex-1 h-10 rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-orange-500/60 disabled:opacity-60"
                />
                <input
                  type="number" min={0} max={MAX_WARRANTY_MONTHS} value={p.months} disabled={!canEdit}
                  onChange={(e) => editPeriod(p.id, 'months', e.target.value)}
                  className="w-24 h-10 rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-orange-500/60 disabled:opacity-60 tabular-nums"
                />
                <span className={`text-xs shrink-0 w-16 ${p.months === WARRANTY_LIFETIME_MONTHS ? 'text-emerald-400 font-600' : 'text-muted-foreground'}`}>
                  {p.months === WARRANTY_LIFETIME_MONTHS ? 'trọn đời' : 'tháng'}
                </span>
                {canEdit && (
                  <button onClick={() => removePeriod(p.id)} title="Xóa"
                    className="btn-ghost rounded-lg p-2.5 -m-1 text-red-400 hover:text-red-300 shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}

            {canEdit && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button onClick={addPeriod}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-hover hover:bg-hover-strong px-3 py-2 text-xs font-600 text-foreground">
                  <Plus className="h-3.5 w-3.5" /> Thêm thời hạn
                </button>
                <button onClick={save} disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-600 text-white disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Đang lưu...' : 'Lưu thời hạn'}
                </button>
              </div>
            )}

            {msg && <p className={`text-sm ${msg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>}
          </>
        )}
      </div>
    </div>
  );
}
