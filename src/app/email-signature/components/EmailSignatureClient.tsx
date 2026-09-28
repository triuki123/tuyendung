'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Loader2, PenLine, Save, Copy, Check, Code2, Download,
  RefreshCw, Sparkles, ChevronRight, Upload, X, Building2, UserCircle2,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import {
  renderSignatureHtml,
  SIGNATURE_TEMPLATES,
  type SignatureData,
  type SignatureTemplateId,
} from '@/lib/signature/templates';

// Ảnh trong chữ ký PHẢI dùng URL tuyệt đối (email/Zimbra không resolve được đường dẫn tương đối).
// Chuyển '/api/...' → 'https://domain/api/...'. Giữ nguyên nếu đã tuyệt đối hoặc data:.
const SIG_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
function toAbsUrl(u?: string): string | undefined {
  if (!u) return u;
  if (/^https?:\/\//i.test(u) || u.startsWith('data:')) return u;
  const origin = SIG_ORIGIN || (typeof window !== 'undefined' ? window.location.origin : '');
  return u.startsWith('/') ? `${origin}${u}` : u;
}

const COLOR_PRESETS = ['#4f46e5', '#0ea5e9', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#0f172a', '#db2777'];

// Kiểu chữ cho chữ ký. Nhóm "an toàn" chạy mọi mail client. Nhóm "hiện đại" đẹp hơn nhưng
// chỉ hiển thị nếu máy người nhận có cài font đó (email không nhúng webfont); nếu không sẽ
// tự rơi về fallback sans-serif trong stack.
const DEFAULT_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const FONT_GROUPS: { group: string; fonts: { label: string; value: string }[] }[] = [
  {
    group: 'An toàn cho email (chạy mọi nơi)',
    fonts: [
      { label: 'Mặc định (Hệ thống)', value: DEFAULT_FONT },
      { label: 'Arial', value: "Arial, 'Helvetica Neue', Helvetica, sans-serif" },
      { label: 'Helvetica', value: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
      { label: 'Segoe UI', value: "'Segoe UI', Tahoma, Arial, sans-serif" },
      { label: 'Calibri', value: "Calibri, 'Segoe UI', Arial, sans-serif" },
      { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
      { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
      { label: 'Trebuchet MS', value: "'Trebuchet MS', Tahoma, sans-serif" },
      { label: 'Century Gothic', value: "'Century Gothic', 'Apple Gothic', sans-serif" },
      { label: 'Georgia (serif)', value: "Georgia, 'Times New Roman', serif" },
      { label: 'Times New Roman (serif)', value: "'Times New Roman', Times, serif" },
      { label: 'Garamond (serif)', value: "Garamond, 'Times New Roman', serif" },
      { label: 'Palatino (serif)', value: "'Palatino Linotype', 'Book Antiqua', Palatino, serif" },
      { label: 'Courier New (mono)', value: "'Courier New', Courier, monospace" },
    ],
  },
  {
    group: 'Hiện đại (cần cài trên máy người nhận)',
    fonts: [
      { label: 'Plus Jakarta Sans', value: "'Plus Jakarta Sans', 'Segoe UI', Roboto, Arial, sans-serif" },
      { label: 'Inter', value: "'Inter', 'Segoe UI', Roboto, Arial, sans-serif" },
      { label: 'Roboto', value: "'Roboto', 'Segoe UI', Arial, sans-serif" },
      { label: 'Open Sans', value: "'Open Sans', 'Segoe UI', Arial, sans-serif" },
      { label: 'Lato', value: "'Lato', 'Segoe UI', Arial, sans-serif" },
      { label: 'Montserrat', value: "'Montserrat', 'Segoe UI', Arial, sans-serif" },
      { label: 'Poppins', value: "'Poppins', 'Segoe UI', Arial, sans-serif" },
      { label: 'Nunito Sans', value: "'Nunito Sans', 'Segoe UI', Arial, sans-serif" },
    ],
  },
];

const EMPTY: SignatureData = {
  templateId: 'modern',
  fullName: '',
  jobTitle: '',
  department: '',
  subDepartment: '',
  company: '',
  phone: '',
  email: '',
  website: '',
  address: '',
  avatarUrl: '',
  logoUrl: '',
  logoScale: 1,
  tagline: '',
  social: {},
  primaryColor: '#4f46e5',
};

/* ── Input nhỏ tái dùng ── */
function Field({
  label, value, onChange, placeholder, type = 'text',
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-600 text-muted-foreground uppercase tracking-wider">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500/50"
      />
    </label>
  );
}

/* ── Bộ chọn ảnh (upload / dùng ảnh sẵn có / dán URL) ── */
function ImagePicker({
  label, value, shape, busy, onPick, onUseExisting, useExistingLabel, useExistingIcon, onUrlChange, onClear,
}: {
  label: string;
  value: string;
  shape: 'circle' | 'rect';
  busy: boolean;
  onPick: (file: File) => void;
  onUseExisting?: () => void;
  useExistingLabel?: string;
  useExistingIcon?: React.ReactNode;
  onUrlChange: (v: string) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showUrl, setShowUrl] = useState(false);
  return (
    <div className="rounded-xl border border-line bg-hover p-3">
      <div className="flex items-center gap-3">
        {/* Thumbnail */}
        <div
          className={`flex-shrink-0 flex items-center justify-center overflow-hidden bg-[#0d1424] border border-line ${shape === 'circle' ? 'h-14 w-14 rounded-full' : 'h-14 w-20 rounded-lg'}`}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={label} className="h-full w-full object-contain" />
          ) : (
            <span className="text-2xs text-muted-foreground">Trống</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-600 text-muted-foreground uppercase tracking-wider">{label}</span>
            {value && (
              <button onClick={onClear} className="text-2xs text-red-400 hover:text-red-300 inline-flex items-center gap-0.5">
                <X className="h-3 w-3" /> Xóa
              </button>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1.5 text-2xs font-600 text-white disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />} Tải lên
            </button>
            {onUseExisting && (
              <button
                onClick={onUseExisting}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg border border-line bg-hover hover:bg-hover-strong px-2.5 py-1.5 text-2xs font-600 text-foreground disabled:opacity-60"
              >
                {useExistingIcon} {useExistingLabel}
              </button>
            )}
            <button
              onClick={() => setShowUrl((s) => !s)}
              className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-2xs text-muted-foreground hover:text-foreground"
            >
              URL
            </button>
          </div>
        </div>
      </div>

      {showUrl && (
        <input
          value={value}
          placeholder="https://.../image.png"
          onChange={(e) => onUrlChange(e.target.value)}
          className="mt-2 w-full rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs text-foreground outline-none focus:border-indigo-500/50"
        />
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

interface CompanyOption { id: string; name: string; logo_url?: string | null; }

/** Phân công tổ chức (kiêm nhiệm) — dùng để chọn chức danh hiển thị trên chữ ký */
interface AssignmentOption {
  id: string;
  position_name: string | null;
  company_name: string | null;
  department_name: string | null;
  sub_department_name: string | null;
  is_primary: boolean;
  is_active?: boolean;
}

export default function EmailSignatureClient() {
  const [userId, setUserId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<SignatureData>(EMPTY);
  const [autofill, setAutofill] = useState<Partial<SignatureData> | null>(null);
  const [companyMeta, setCompanyMeta] = useState<{ companyId: string | null; hasLogo: boolean }>({ companyId: null, hasLogo: false });
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [assignments, setAssignments] = useState<AssignmentOption[]>([]);
  const [selectedAssignments, setSelectedAssignments] = useState<string[]>([]);
  const [copied, setCopied] = useState<'rich' | 'html' | null>(null);
  const [showHtml, setShowHtml] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [uploading, setUploading] = useState<'avatar' | 'logo' | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);

  const html = useMemo(
    () => renderSignatureHtml({ ...data, logoUrl: toAbsUrl(data.logoUrl), avatarUrl: toAbsUrl(data.avatarUrl) }),
    [data]
  );

  // Load chữ ký hiện tại + dữ liệu auto-fill + danh sách công ty
  useEffect(() => {
    const user = getCurrentUser();
    if (!user?.id) { setLoading(false); return; }
    setUserId(user.id);
    (async () => {
      try {
        const [sigRes, compRes, asgRes] = await Promise.all([
          fetch(`/api/email-signature?userId=${encodeURIComponent(user.id)}`),
          fetch('/api/organizations/companies'),
          fetch(`/api/users/${encodeURIComponent(user.id)}/assignments`),
        ]);
        const json = await sigRes.json();
        if (json?.autofill) setAutofill(json.autofill);
        if (json?.company) setCompanyMeta(json.company);
        if (json?.signature?.data) {
          setData({ ...EMPTY, ...json.signature.data });
          setCompanyId(json.signature.company_id ?? null);
        } else if (json?.autofill) {
          setData((d) => ({ ...d, ...json.autofill }));
        }
        if (compRes.ok) {
          const list = await compRes.json();
          if (Array.isArray(list)) setCompanies(list);
        }
        if (asgRes.ok) {
          const asgJson = await asgRes.json();
          if (Array.isArray(asgJson?.data)) {
            // Chỉ giữ phân công đang hiệu lực và có chức danh — thứ tự API: Chính trước
            const active = (asgJson.data as AssignmentOption[]).filter(
              (a) => a.is_active !== false && a.position_name
            );
            setAssignments(active);
            const primary = active.find((a) => a.is_primary) || active[0];
            if (primary) setSelectedAssignments([primary.id]);
          }
        }
      } catch {
        /* im lặng — vẫn cho người dùng tạo mới */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = useCallback(<K extends keyof SignatureData>(key: K, val: SignatureData[K]) => {
    setData((d) => ({ ...d, [key]: val }));
  }, []);

  const setSocial = (key: keyof NonNullable<SignatureData['social']>, val: string) =>
    setData((d) => ({ ...d, social: { ...d.social, [key]: val } }));

  const applyAutofill = () => {
    if (autofill) setData((d) => ({ ...d, ...autofill }));
  };

  /**
   * Tick/bỏ tick một chức danh → jobTitle = các chức danh đã chọn nối bằng " | "
   * (theo thứ tự phân công: Chính trước). Ô Chức danh vẫn sửa tay tự do như cũ.
   */
  const toggleAssignment = (id: string) => {
    setSelectedAssignments((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      const titles = assignments
        .filter((a) => next.includes(a.id))
        .map((a) => a.position_name)
        .filter(Boolean) as string[];
      setData((d) => ({ ...d, jobTitle: titles.join(' | ') }));
      return next;
    });
  };

  const handleSelectCompany = (id: string) => {
    const c = companies.find((co) => co.id === id);
    if (!c) return;
    setCompanyId(id);
    setData((d) => ({ ...d, company: c.name }));
    if (c.logo_url) {
      setData((d) => ({ ...d, company: c.name, logoUrl: c.logo_url as string }));
    }
    setCompanyMeta({ companyId: id, hasLogo: !!c.logo_url });
  };

  // Upload ảnh (avatar/logo) → nhận URL public tuyệt đối (dùng được cả trong email).
  const uploadImage = async (file: File, kind: 'avatar' | 'logo') => {
    setUploading(kind);
    setImgError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      const res = await fetch('/api/email-signature/image', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.url) { setImgError(json.error || 'Tải ảnh thất bại'); return; }
      set(kind === 'avatar' ? 'avatarUrl' : 'logoUrl', json.url);
    } catch {
      setImgError('Tải ảnh thất bại');
    } finally {
      setUploading(null);
    }
  };

  // Lấy ảnh từ nguồn sẵn có (avatar của tôi / logo công ty) → URL public.
  const useExisting = async (source: 'avatar' | 'company-logo') => {
    const kind = source === 'avatar' ? 'avatar' : 'logo';
    setUploading(kind);
    setImgError(null);
    try {
      const res = await fetch('/api/email-signature/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(source === 'avatar' ? { source } : { source, companyId: companyMeta.companyId }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) { setImgError(json.error || 'Không lấy được ảnh'); return; }
      set(kind === 'avatar' ? 'avatarUrl' : 'logoUrl', json.url);
    } catch {
      setImgError('Không lấy được ảnh');
    } finally {
      setUploading(null);
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/email-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, companyId, data }),
      });
      if (res.ok) {
        const now = new Date();
        setSavedAt(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const copyRich = async () => {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([html], { type: 'text/plain' }),
        }),
      ]);
      setCopied('rich');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Fallback: copy HTML thô
      await navigator.clipboard.writeText(html);
      setCopied('html');
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const copyHtml = async () => {
    await navigator.clipboard.writeText(html);
    setCopied('html');
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadHtml = () => {
    const blob = new Blob(
      [`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`],
      { type: 'text/html' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chu-ky-email.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-foreground flex items-center gap-2">
            <PenLine className="h-6 w-6 text-indigo-400" /> Chữ Ký Email
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Tạo chữ ký email chuyên nghiệp — tự động chạy đúng trên Gmail, Outlook, Zimbra
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> Đã lưu {savedAt}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-600 text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Lưu chữ ký
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.05fr] gap-5">
        {/* ── CỘT TRÁI: FORM ── */}
        <div className="space-y-5">
          {/* Template gallery */}
          <div className="rounded-2xl border border-line-subtle p-4" style={{ background: 'var(--card)' }}>
            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider mb-3">Mẫu chữ ký</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {SIGNATURE_TEMPLATES.map((t) => {
                const active = data.templateId === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => set('templateId', t.id as SignatureTemplateId)}
                    className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${
                      active ? 'border-indigo-500/60 bg-indigo-500/10' : 'border-line bg-hover hover:border-line-strong'
                    }`}
                  >
                    <p className={`text-sm font-600 ${active ? 'text-indigo-300' : 'text-foreground'}`}>{t.name}</p>
                    <p className="text-2xs text-muted-foreground leading-snug mt-0.5 line-clamp-2">{t.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Thông tin */}
          <div className="rounded-2xl border border-line-subtle p-4 space-y-3.5" style={{ background: 'var(--card)' }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Thông tin</p>
              {autofill && (
                <button
                  onClick={applyAutofill}
                  className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
                  title="Điền lại từ hồ sơ nhân sự"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Điền từ hồ sơ
                </button>
              )}
            </div>
            {/* Chức danh hiển thị — chỉ hiện khi user kiêm nhiệm (>= 2 phân công) */}
            {assignments.length >= 2 && (
              <div className="rounded-xl border border-line bg-hover p-3 space-y-2">
                <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Chức danh hiển thị</p>
                <p className="text-2xs text-muted-foreground">
                  Bạn đang kiêm nhiệm nhiều vị trí — tick các chức danh muốn hiển thị trên chữ ký.
                  Vẫn có thể sửa tay ở ô <em>Chức danh</em> bên dưới.
                </p>
                <div className="space-y-1">
                  {assignments.map((a) => {
                    const unit = [a.sub_department_name, a.department_name, a.company_name]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <label
                        key={a.id}
                        className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/5 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedAssignments.includes(a.id)}
                          onChange={() => toggleAssignment(a.id)}
                          className="mt-0.5 h-4 w-4 rounded border-line accent-indigo-500 cursor-pointer"
                        />
                        <span className="flex-1 min-w-0">
                          <span className="text-sm text-foreground flex items-center gap-1.5 flex-wrap">
                            {a.position_name}
                            {a.is_primary && (
                              <span className="rounded-full bg-indigo-500/15 px-1.5 py-0.5 text-2xs font-600 text-indigo-300">
                                Chính
                              </span>
                            )}
                          </span>
                          {unit && (
                            <span className="block text-2xs text-muted-foreground truncate">{unit}</span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Họ và tên" value={data.fullName} onChange={(v) => set('fullName', v)} placeholder="Nguyễn Văn A" />
              <Field label="Chức danh" value={data.jobTitle || ''} onChange={(v) => set('jobTitle', v)} placeholder="Trưởng phòng IT" />
              <Field label="Phòng ban" value={data.department || ''} onChange={(v) => set('department', v)} placeholder="Phòng CNTT" />
              <Field label="Bộ phận" value={data.subDepartment || ''} onChange={(v) => set('subDepartment', v)} placeholder="Bộ phận Hạ tầng" />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Công ty</label>
                {companies.length > 0 ? (
                  <select
                    value={companyId || ''}
                    onChange={(e) => e.target.value ? handleSelectCompany(e.target.value) : (setCompanyId(null), set('company', ''))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-foreground border border-line outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30"
                    style={{ background: 'var(--input)' }}
                  >
                    <option value="">— Chọn công ty —</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}{c.logo_url ? ' ✓' : ''}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={data.company || ''}
                    onChange={(e) => set('company', e.target.value)}
                    placeholder="Công ty FADO"
                    className="w-full rounded-xl px-3 py-2 text-sm text-foreground border border-line outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30"
                    style={{ background: 'var(--input)' }}
                  />
                )}
                {companyId && companies.find(c => c.id === companyId)?.logo_url && (
                  <p className="text-2xs text-emerald-400">✓ Logo đã tự động điền từ công ty</p>
                )}
              </div>
              <Field label="Điện thoại" value={data.phone || ''} onChange={(v) => set('phone', v)} placeholder="0901 234 567" />
              <Field label="Email" type="email" value={data.email || ''} onChange={(v) => set('email', v)} placeholder="a@fado.vn" />
              <Field label="Website" value={data.website || ''} onChange={(v) => set('website', v)} placeholder="fadoai.com" />
              <Field label="Địa chỉ" value={data.address || ''} onChange={(v) => set('address', v)} placeholder="123 Lê Lợi, Q1, TP.HCM" />
            </div>
            <Field label="Khẩu hiệu / Ghi chú" value={data.tagline || ''} onChange={(v) => set('tagline', v)} placeholder="Vui lòng cân nhắc môi trường trước khi in email này" />
          </div>

          {/* Hình ảnh */}
          <div className="rounded-2xl border border-line-subtle p-4 space-y-3" style={{ background: 'var(--card)' }}>
            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Hình ảnh</p>
            <ImagePicker
              label="Ảnh đại diện"
              value={data.avatarUrl || ''}
              shape="circle"
              busy={uploading === 'avatar'}
              onPick={(f) => uploadImage(f, 'avatar')}
              onUseExisting={() => useExisting('avatar')}
              useExistingLabel="Ảnh của tôi"
              useExistingIcon={<UserCircle2 className="h-3 w-3" />}
              onUrlChange={(v) => set('avatarUrl', v)}
              onClear={() => set('avatarUrl', '')}
            />
            <ImagePicker
              label="Logo công ty"
              value={data.logoUrl || ''}
              shape="rect"
              busy={uploading === 'logo'}
              onPick={(f) => uploadImage(f, 'logo')}
              onUseExisting={companyMeta.hasLogo ? () => useExisting('company-logo') : undefined}
              useExistingLabel="Logo công ty"
              useExistingIcon={<Building2 className="h-3 w-3" />}
              onUrlChange={(v) => set('logoUrl', v)}
              onClear={() => set('logoUrl', '')}
            />
            {data.logoUrl && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Cỡ logo</label>
                  <span className="text-2xs text-muted-foreground">{Math.round((data.logoScale ?? 1) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2.5}
                  step={0.1}
                  value={data.logoScale ?? 1}
                  onChange={(e) => set('logoScale', parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
                <p className="text-2xs text-muted-foreground/60">Kéo để phóng to / thu nhỏ logo trong chữ ký.</p>
              </div>
            )}
            {imgError && <p className="text-2xs text-red-400">{imgError}</p>}
            <p className="text-2xs text-muted-foreground">
              Ảnh tải lên được lưu công khai để hiển thị đúng cả trong bản xem trước lẫn khi dán sang email.
            </p>
          </div>

          {/* Mạng xã hội + màu */}
          <div className="rounded-2xl border border-line-subtle p-4 space-y-3.5" style={{ background: 'var(--card)' }}>
            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Mạng xã hội</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="LinkedIn" value={data.social?.linkedin || ''} onChange={(v) => setSocial('linkedin', v)} placeholder="linkedin.com/in/..." />
              <Field label="Facebook" value={data.social?.facebook || ''} onChange={(v) => setSocial('facebook', v)} placeholder="facebook.com/..." />
              <Field label="Twitter / X" value={data.social?.twitter || ''} onChange={(v) => setSocial('twitter', v)} placeholder="x.com/..." />
              <Field label="Instagram" value={data.social?.instagram || ''} onChange={(v) => setSocial('instagram', v)} placeholder="instagram.com/..." />
              <Field label="YouTube" value={data.social?.youtube || ''} onChange={(v) => setSocial('youtube', v)} placeholder="youtube.com/@..." />
              <Field label="Zalo" value={data.social?.zalo || ''} onChange={(v) => setSocial('zalo', v)} placeholder="zalo.me/..." />
              <Field label="Telegram" value={data.social?.telegram || ''} onChange={(v) => setSocial('telegram', v)} placeholder="t.me/..." />
            </div>

            <div>
              <span className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Màu nhấn thương hiệu</span>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    onClick={() => set('primaryColor', c)}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${data.primaryColor === c ? 'border-white scale-110' : 'border-line-strong'}`}
                    style={{ background: c }}
                    title={c}
                  />
                ))}
                <input
                  type="color"
                  value={data.primaryColor || '#4f46e5'}
                  onChange={(e) => set('primaryColor', e.target.value)}
                  className="h-7 w-9 rounded-md bg-transparent border border-line cursor-pointer"
                  title="Màu tùy chỉnh"
                />
              </div>
            </div>

            <div>
              <span className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Kiểu chữ</span>
              <select
                value={data.fontFamily || DEFAULT_FONT}
                onChange={(e) => set('fontFamily', e.target.value)}
                className="mt-2 w-full rounded-lg border border-line bg-[#162033] px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500 cursor-pointer"
                style={{ fontFamily: data.fontFamily || DEFAULT_FONT }}
              >
                {FONT_GROUPS.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.fonts.map((f) => (
                      <option key={f.label} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="mt-1 text-2xs text-muted-foreground/60">Font an toàn cho email — chạy đúng trên Gmail, Outlook, Zimbra.</p>
            </div>
          </div>
        </div>

        {/* ── CỘT PHẢI: PREVIEW + XUẤT (sticky) ── */}
        <div className="space-y-4 lg:sticky lg:top-4 self-start">
          <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
            <div className="flex items-center justify-between border-b border-line-subtle px-4 py-3">
              <p className="text-sm font-600 text-foreground">Xem trước</p>
              <span className="text-2xs text-muted-foreground">Hiển thị như trong email của người nhận</span>
            </div>
            {/* Preview trên nền trắng giống hộp thư thật, iframe cách ly CSS */}
            <div className="p-4" style={{ background: '#f3f4f6' }}>
              <div className="rounded-lg bg-white p-4 shadow-sm">
                <iframe
                  title="Xem trước chữ ký"
                  srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:Arial,sans-serif;}</style></head><body>${html}</body></html>`}
                  className="w-full border-0"
                  style={{ minHeight: 220 }}
                />
              </div>
            </div>
          </div>

          {/* Xuất */}
          <div className="rounded-2xl border border-line-subtle p-4 space-y-3" style={{ background: 'var(--card)' }}>
            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Xuất & cài đặt</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                onClick={copyRich}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-3 py-2.5 text-sm font-600 text-white"
              >
                {copied === 'rich' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied === 'rich' ? 'Đã copy!' : 'Copy chữ ký'}
              </button>
              <button
                onClick={copyHtml}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-hover hover:bg-hover-strong px-3 py-2.5 text-sm font-600 text-foreground"
              >
                {copied === 'html' ? <Check className="h-4 w-4" /> : <Code2 className="h-4 w-4" />}
                {copied === 'html' ? 'Đã copy HTML!' : 'Copy mã HTML'}
              </button>
              <button
                onClick={downloadHtml}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-hover hover:bg-hover-strong px-3 py-2.5 text-sm font-600 text-foreground"
              >
                <Download className="h-4 w-4" /> Tải HTML
              </button>
            </div>

            <button
              onClick={() => setShowHtml((s) => !s)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showHtml ? 'rotate-90' : ''}`} />
              {showHtml ? 'Ẩn mã nguồn HTML' : 'Xem mã nguồn HTML'}
            </button>
            {showHtml && (
              <pre className="max-h-60 overflow-auto rounded-xl bg-[#0d1424] p-3 text-2xs text-ink-bright whitespace-pre-wrap break-all">
                {html}
              </pre>
            )}

            {/* Hướng dẫn nhanh */}
            <div className="rounded-xl border border-line-subtle bg-white/[0.03] p-3 text-xs text-muted-foreground space-y-1.5">
              <p className="font-600 text-foreground flex items-center gap-1"><RefreshCw className="h-3.5 w-3.5" /> Cách cài vào hộp thư</p>
              <p><strong className="text-foreground">Gmail:</strong> Cài đặt → Chung → Chữ ký → dán bằng <em>Copy chữ ký</em>.</p>
              <p><strong className="text-foreground">Outlook:</strong> File → Tùy chọn → Mail → Chữ ký → dán.</p>
              <p><strong className="text-foreground">Zimbra:</strong> Tùy chọn → Chữ ký → chọn định dạng HTML → dán.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
