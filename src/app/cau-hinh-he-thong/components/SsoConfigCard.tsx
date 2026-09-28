'use client';

import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2, Save } from 'lucide-react';
import type { SsoConfig } from '@/lib/config/systemConfig';

/**
 * Card cấu hình SSO trong tab Bảo mật của Cấu Hình Hệ Thống.
 * Lưu vào system_settings key 'sso.provisioning' qua /api/system-config.
 */
export default function SsoConfigCard() {
  const [cfg, setCfg] = useState<SsoConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [domainsText, setDomainsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    // GET /api/system-config trả { data: {...} } (xem SystemConfigClient.tsx:173).
    fetch('/api/system-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const sso = (j?.data?.sso ?? j?.sso) as SsoConfig | undefined;
        if (sso) {
          setCfg(sso);
          setDomainsText(sso.zimbraDomains.join(', '));
        } else {
          setLoadError('Không tải được cấu hình SSO');
        }
      })
      .catch(() => setLoadError('Không tải được cấu hình SSO'));
  }, []);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    setMsg(null);
    const zimbraDomains = Array.from(new Set(
      domainsText
        .split(/[,\n]/)
        .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean)
    ));
    try {
      const res = await fetch('/api/system-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sso: { ...cfg, zimbraDomains } }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        setCfg({ ...cfg, zimbraDomains });
        setMsg({ ok: true, text: 'Đã lưu cấu hình SSO' });
      } else {
        setMsg({ ok: false, text: j?.error || 'Lưu thất bại' });
      }
    } catch {
      setMsg({ ok: false, text: 'Lưu thất bại. Vui lòng thử lại.' });
    } finally {
      setSaving(false);
    }
  };

  if (!cfg) {
    return (
      <div className="rounded-2xl border border-white/5 p-6 flex justify-center" style={{ background: 'var(--card)' }}>
        {loadError ? (
          <p className="text-sm text-red-400">{loadError}</p>
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
      <div className="flex items-center gap-2.5 border-b border-white/5 px-5 py-3.5">
        <KeyRound className="h-4 w-4 text-indigo-400" />
        <h3 className="text-base font-600 text-foreground">Đăng nhập SSO &amp; đồng bộ tài khoản</h3>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">
            Domain email Zimbra (phân cách bởi dấu phẩy)
          </label>
          <textarea
            value={domainsText}
            onChange={(e) => setDomainsText(e.target.value)}
            rows={2}
            placeholder="fadogroup.com.au, fado.vn"
            className="mt-1.5 w-full rounded-xl bg-[#162033] border border-white/10 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-indigo-500/60"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            User thuộc các domain này đăng nhập SSO bằng mật khẩu Zimbra — hệ thống sẽ KHÔNG tạo tài khoản local bên SSO cho họ.
          </p>
        </div>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={cfg.autoSyncEnabled}
            onChange={(e) => setCfg({ ...cfg, autoSyncEnabled: e.target.checked })}
            className="w-4 h-4 rounded accent-indigo-500"
          />
          <span className="text-sm text-foreground">Tự đồng bộ sang SSO khi tạo / sửa / khóa người dùng</span>
        </label>
        {msg && (
          <p className={`text-xs ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>{msg.text}</p>
        )}
        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 flex items-center gap-2 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Lưu cấu hình SSO
          </button>
        </div>
      </div>
    </div>
  );
}
