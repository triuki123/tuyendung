'use client';

import { useState, useEffect } from 'react';
import {
  Lock, User, Shield, Bell, LogOut, Eye, EyeOff,
  CheckCircle, AlertCircle, Camera, Monitor, Loader2, Send, Link2, LayoutGrid, Check,
} from 'lucide-react';
import { UI_MODES, getUiMode, setUiMode, type UiMode } from '@/lib/ui/uiMode';
import { usePreferences } from '@/context/PreferencesContext';
import { LIGHT_THEME_ENABLED } from '@/lib/config/featureFlags';
import { t, type Language } from '@/lib/i18n';
import type { Theme } from '@/context/PreferencesContext';
import { AvatarCropper } from './AvatarCropper';

interface TelegramLink {
  telegram_id: string | null;
  telegram_username: string | null;
  telegram_first_name: string | null;
  telegram_last_name: string | null;
  telegram_photo_url: string | null;
  telegram_linked_at: string | null;
}

type SettingTab = 'profile' | 'interface' | 'security_notifications' | 'sessions';

interface Session {
  id: string;
  device_name: string;
  browser: string;
  os: string;
  ip_address: string | null;
  created_at: string;
  last_activity: string;
}

function getUserId(): string | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem('currentUser') || localStorage.getItem('assetflow_auth');
  if (!stored) return null;
  try { return JSON.parse(stored).id || null; } catch { return null; }
}

const TABS: { id: SettingTab; label: string; icon: React.ReactNode }[] = [
  { id: 'profile',                 label: 'Thông Tin',      icon: <User className="h-4 w-4" /> },
  { id: 'interface',               label: 'Giao Diện',      icon: <LayoutGrid className="h-4 w-4" /> },
  { id: 'security_notifications',  label: 'Cài Đặt Chung', icon: <Shield className="h-4 w-4" /> },
  { id: 'sessions',                label: 'Phiên Đăng Nhập', icon: <Monitor className="h-4 w-4" /> },
];

export default function SettingsClient() {
  const [activeTab, setActiveTab] = useState<SettingTab>('profile');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-700 text-foreground">Cài Đặt</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">Quản lý tài khoản và cài đặt ứng dụng</p>
      </div>

      {/* Alert */}
      {message && (
        <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
          message.type === 'success'
            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
            : 'border-red-500/20 bg-red-500/10 text-red-400'
        }`}>
          {message.type === 'success'
            ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
            : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
          <span className="flex-1">{message.text}</span>
          <button onClick={() => setMessage(null)} className="shrink-0 opacity-60 hover:opacity-100 text-lg leading-none">×</button>
        </div>
      )}

      {/* Tab bar — ngang trên mọi màn hình */}
      <div className="flex gap-1 border-b border-line overflow-x-auto">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="max-w-2xl">
        {activeTab === 'profile'                && <ProfileSettings setMessage={setMessage} />}
        {activeTab === 'interface'              && <InterfaceSettings />}
        {activeTab === 'security_notifications' && <SecurityNotificationSettings setMessage={setMessage} />}
        {activeTab === 'sessions'               && <SessionSettings setMessage={setMessage} />}
      </div>
    </div>
  );
}

// ── Shared input style ──────────────────────────────────────────────────────
const inputCls = 'w-full rounded-xl border border-line px-3 py-2.5 text-sm text-foreground outline-none focus:border-indigo-500 transition-colors';
const inputStyle = { background: 'var(--input, #162033)' };
const labelCls = 'block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5';

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
      <div className="px-4 sm:px-6 py-4 border-b border-line-subtle">
        <h2 className="text-base font-600 text-foreground">{title}</h2>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      <div className="px-4 sm:px-6 py-5 space-y-5">
        {children}
      </div>
    </div>
  );
}

function InterfaceSettings() {
  const [mode, setMode] = useState<UiMode>('sidebar');
  useEffect(() => { setMode(getUiMode()); }, []);
  const choose = (m: UiMode) => { setUiMode(m); setMode(m); };

  return (
    <div className="space-y-4">
      <Card title="Kiểu giao diện điều hướng" desc="Chọn cách hiển thị menu. Áp dụng ngay, chỉ trên thiết bị này — đổi qua lại thoải mái.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {UI_MODES.map((m) => {
            const on = mode === m.key;
            return (
              <button
                key={m.key}
                onClick={() => choose(m.key)}
                className={`text-left rounded-2xl border p-4 transition-colors ${
                  on ? 'border-indigo-500 bg-indigo-600/10' : 'border-line-subtle hover:border-indigo-500/40'
                }`}
                style={{ background: on ? undefined : 'var(--card)' }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-700 text-foreground">{m.label}</p>
                  {on && <Check className="h-4 w-4 text-indigo-400" />}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{m.desc}</p>
              </button>
            );
          })}
        </div>
        <div className="rounded-xl border border-line-subtle px-4 py-3 text-xs text-muted-foreground" style={{ background: 'var(--card)' }}>
          💡 Mẹo: nhấn <kbd className="border border-line rounded px-1.5 py-0.5 text-foreground">Ctrl</kbd> / <kbd className="border border-line rounded px-1.5 py-0.5 text-foreground">⌘</kbd> + <kbd className="border border-line rounded px-1.5 py-0.5 text-foreground">K</kbd> ở bất kỳ kiểu giao diện nào để gõ nhảy nhanh tới mọi trang.
        </div>
      </Card>
    </div>
  );
}

function SectionDivider({ title }: { title: string }) {
  return (
    <div className="border-t border-line-subtle pt-5">
      <p className="text-sm font-600 text-foreground mb-4">{title}</p>
    </div>
  );
}

// Định nghĩa ở MODULE SCOPE (không phải trong component) để React không unmount/remount
// input mỗi lần gõ → tránh mất focus / con trỏ nhảy.
function PasswordField({ label, value, onChange, show, onToggle, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  show: boolean; onToggle: () => void; placeholder: string;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="relative">
        <input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
          className={inputCls + ' pr-10'} style={inputStyle} placeholder={placeholder} />
        <button type="button" onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

// ── Profile ─────────────────────────────────────────────────────────────────
function ProfileSettings({ setMessage }: { setMessage: (m: { type: 'success' | 'error'; text: string } | null) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isCropperOpen, setIsCropperOpen] = useState(false);
  const userId = getUserId();

  useEffect(() => {
    if (!userId) { setInitialLoading(false); return; }
    fetch(`/api/users/${userId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((u) => {
        if (!u) return;
        setName(u.name || '');
        setEmail(u.email || '');
        setPhone(u.phone || '');
        setBio(u.bio || '');
        if (u.avatar) setAvatarPreview(u.avatar);
      })
      .catch(() => setMessage({ type: 'error', text: 'Không tải được thông tin cá nhân. Vui lòng tải lại trang.' }))
      .finally(() => setInitialLoading(false));
  }, [userId]);

  async function handleSave() {
    if (!name.trim()) { setMessage({ type: 'error', text: 'Tên không được để trống' }); return; }
    if (!userId)      { setMessage({ type: 'error', text: 'Không tìm thấy ID người dùng' }); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, bio }),
      });
      if (!res.ok) { const e = await res.json(); setMessage({ type: 'error', text: e.error || 'Cập nhật thất bại' }); return; }
      setMessage({ type: 'success', text: 'Thông tin cá nhân đã được cập nhật' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Có lỗi xảy ra' });
    } finally { setLoading(false); }
  }

  if (initialLoading) return (
    <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  );

  return (
    <div className="space-y-4">
      <Card title="Thông Tin Cá Nhân" desc="Cập nhật thông tin tài khoản của bạn">
        {/* Avatar */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="shrink-0">
            {avatarPreview
              ? <img src={avatarPreview} alt="Avatar" className="w-20 h-20 rounded-2xl object-cover border-2 border-indigo-500/40" />
              : <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-line-strong flex items-center justify-center bg-hover">
                  <User className="h-8 w-8 text-muted-foreground" />
                </div>
            }
          </div>
          <div className="space-y-1.5">
            <button onClick={() => setIsCropperOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-600 text-white transition-colors">
              <Camera className="h-4 w-4" />
              <span className="hidden xs:inline">Thay Đổi Ảnh Đại Diện</span>
              <span className="xs:hidden">Đổi ảnh</span>
            </button>
            <p className="text-xs text-muted-foreground">JPG, PNG, WebP · Tối đa 1MB · Tự cắt 300×300px</p>
          </div>
        </div>

        {/* Fields */}
        <div>
          <label className={labelCls}>Email</label>
          <input value={email} disabled className={inputCls + ' opacity-50 cursor-not-allowed'} style={inputStyle} />
          <p className="text-xs text-muted-foreground mt-1">Email không thể thay đổi</p>
        </div>
        <div>
          <label className={labelCls}>Tên Đầy Đủ <span className="text-red-400">*</span></label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} style={inputStyle} placeholder="Nhập tên đầy đủ" />
        </div>
        <div>
          <label className={labelCls}>Số Điện Thoại</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} style={inputStyle} placeholder="Nhập số điện thoại" />
        </div>
        <div>
          <label className={labelCls}>Tiểu Sử</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3}
            className={inputCls + ' resize-none'} style={inputStyle} placeholder="Nhập tiểu sử ngắn" />
        </div>

        <div className="pt-1">
          <button onClick={handleSave} disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2.5 text-sm font-600 text-white transition-colors">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Đang lưu...' : 'Lưu Thay Đổi'}
          </button>
        </div>
      </Card>

      <AvatarCropper isOpen={isCropperOpen} onClose={() => setIsCropperOpen(false)}
        userId={userId || ''}
        onUploadSuccess={(url) => { setAvatarPreview(url); setMessage({ type: 'success', text: 'Ảnh đại diện đã được cập nhật' }); }} />
    </div>
  );
}

// ── Security & Notifications ─────────────────────────────────────────────────
function SecurityNotificationSettings({ setMessage }: { setMessage: (m: { type: 'success' | 'error'; text: string } | null) => void }) {
  const { preferences, setLanguage, setTheme } = usePreferences();
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [tgLoading, setTgLoading] = useState(false);
  const [tgLink, setTgLink] = useState<TelegramLink | null>(null);
  const userId = getUserId();

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/users/${userId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((u) => {
        if (u) {
          setTelegramEnabled(u.telegram_enabled || false);
          setTgLink({
            telegram_id: u.telegram_id ?? null,
            telegram_username: u.telegram_username ?? null,
            telegram_first_name: u.telegram_first_name ?? null,
            telegram_last_name: u.telegram_last_name ?? null,
            telegram_photo_url: u.telegram_photo_url ?? null,
            telegram_linked_at: u.telegram_linked_at ?? null,
          });
        }
      })
      .catch(() => {});
  }, [userId]);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!oldPw || !newPw || !confirmPw) { setMessage({ type: 'error', text: 'Vui lòng điền đầy đủ thông tin' }); return; }
    if (newPw !== confirmPw) { setMessage({ type: 'error', text: 'Mật khẩu mới không khớp' }); return; }
    if (newPw.length < 8) { setMessage({ type: 'error', text: 'Mật khẩu phải có ít nhất 8 ký tự' }); return; }
    setPwLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, oldPassword: oldPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage({ type: 'error', text: data.error || 'Thay đổi mật khẩu thất bại' }); return; }
      setMessage({ type: 'success', text: 'Mật khẩu đã được thay đổi' });
      setOldPw(''); setNewPw(''); setConfirmPw('');
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Có lỗi xảy ra' });
    } finally { setPwLoading(false); }
  }

  async function handleToggleTelegram() {
    if (!userId) { setMessage({ type: 'error', text: 'Không tìm thấy ID người dùng' }); return; }
    setTgLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram_enabled: !telegramEnabled }),
      });
      if (!res.ok) { const e = await res.json(); setMessage({ type: 'error', text: e.error || 'Cập nhật thất bại' }); return; }
      setTelegramEnabled((v) => !v);
      setMessage({ type: 'success', text: `Thông báo Telegram đã ${!telegramEnabled ? 'bật' : 'tắt'}` });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Có lỗi xảy ra' });
    } finally { setTgLoading(false); }
  }

  return (
    <div className="space-y-4">
      {/* App settings */}
      <Card title="Cài Đặt Ứng Dụng" desc="Ngôn ngữ và giao diện">
        <div>
          <label className={labelCls}>Ngôn Ngữ</label>
          <select value={preferences.language} onChange={(e) => setLanguage(e.target.value as Language)}
            className={inputCls} style={inputStyle}>
            <option value="vi">{t('language.vi', preferences.language)}</option>
            <option value="en">{t('language.en', preferences.language)}</option>
            <option value="zh">{t('language.zh', preferences.language)}</option>
          </select>
        </div>
        {/* Giao Diện: chỉ hiện khi cờ light bật (dev). Prod tắt cờ ⇒ ẩn, luôn dark. */}
        {LIGHT_THEME_ENABLED && (
          <div>
            <label className={labelCls}>Giao Diện</label>
            <select value={preferences.theme} onChange={(e) => setTheme(e.target.value as Theme)}
              className={inputCls} style={inputStyle}>
              <option value="light">{t('theme.light', preferences.language)}</option>
              <option value="dark">{t('theme.dark', preferences.language)}</option>
              <option value="auto">{t('theme.auto', preferences.language)}</option>
            </select>
          </div>
        )}
      </Card>

      {/* Password */}
      <Card title="Đổi Mật Khẩu" desc="Đặt mật khẩu mới cho tài khoản">
        <form onSubmit={handleChangePassword} className="space-y-4">
          <PasswordField label="Mật khẩu hiện tại" value={oldPw} onChange={setOldPw}
            show={showOld} onToggle={() => setShowOld((v) => !v)} placeholder="Nhập mật khẩu hiện tại" />
          <PasswordField label="Mật khẩu mới" value={newPw} onChange={setNewPw}
            show={showNew} onToggle={() => setShowNew((v) => !v)} placeholder="Tối thiểu 8 ký tự" />
          <PasswordField label="Xác nhận mật khẩu" value={confirmPw} onChange={setConfirmPw}
            show={showConfirm} onToggle={() => setShowConfirm((v) => !v)} placeholder="Nhập lại mật khẩu mới" />
          <button type="submit" disabled={pwLoading}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2.5 text-sm font-600 text-white transition-colors">
            {pwLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {pwLoading ? 'Đang xử lý...' : 'Đổi Mật Khẩu'}
          </button>
        </form>
      </Card>

      {/* Notifications */}
      <Card title="Thông Báo" desc="Cài đặt kênh nhận thông báo">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-600 text-foreground">Thông báo Telegram</p>
            <p className="text-xs text-muted-foreground mt-0.5">Nhận thông báo qua Telegram Bot</p>
          </div>
          <button onClick={handleToggleTelegram} disabled={tgLoading}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 transition-colors ${
              telegramEnabled ? 'border-indigo-500 bg-indigo-600' : 'border-line-strong bg-hover-strong'
            } ${tgLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform mt-0.5 ${
              telegramEnabled ? 'translate-x-5' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      </Card>

      {/* Telegram Account */}
      <Card title="Tài Khoản Telegram" desc="Trạng thái quyền đăng nhập Telegram (do Quản trị viên tối cao cấp)">
        {tgLink?.telegram_id ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl p-3" style={{ background: 'rgba(99,102,241,0.08)' }}>
              {tgLink.telegram_photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tgLink.telegram_photo_url} alt="" className="h-12 w-12 rounded-full" />
              ) : (
                <div className="h-12 w-12 rounded-full bg-indigo-600 flex items-center justify-center text-white font-700 text-lg">
                  {(tgLink.telegram_first_name || 'T').charAt(0)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-700 text-foreground truncate flex items-center gap-1.5">
                  <Send className="h-3.5 w-3.5 text-indigo" />
                  {[tgLink.telegram_first_name, tgLink.telegram_last_name].filter(Boolean).join(' ') || 'Telegram'}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {tgLink.telegram_username ? `@${tgLink.telegram_username}` : ''}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground uppercase tracking-wider mb-0.5">Telegram ID</p>
                <p className="text-foreground font-mono">{tgLink.telegram_id}</p>
              </div>
              <div>
                <p className="text-muted-foreground uppercase tracking-wider mb-0.5">Ngày liên kết</p>
                <p className="text-foreground">
                  {tgLink.telegram_linked_at
                    ? new Date(tgLink.telegram_linked_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    : '—'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <Send className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-300">
                Tài khoản đã được cấp quyền đăng nhập bằng Telegram. Muốn thay đổi hoặc gỡ liên kết,
                vui lòng liên hệ Quản trị viên tối cao.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-xl border border-line bg-hover px-3 py-2.5">
            <Link2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Chưa được cấp quyền đăng nhập Telegram. Việc liên kết do <span className="text-foreground font-600">Quản trị viên tối cao</span> thực hiện — vui lòng liên hệ nếu bạn cần.
            </p>
          </div>
        )}
      </Card>

      {/* 2FA */}
      <TwoFactorCard />
    </div>
  );
}

// ── 2FA (Xác thực hai yếu tố) ────────────────────────────────────────────────
function TwoFactorCard() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | 'request' | 'otp'>(null);
  const [otp, setOtp] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [channel, setChannel] = useState<'email' | 'telegram'>('email');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const load = async () => {
    try {
      const r = await fetch('/api/auth/2fa');
      const j = await r.json().catch(() => ({}));
      if (j?.data) setEnabled(!!j.data.enabled);
    } catch { /* ignore */ } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const close = () => { setModal(null); setOtp(''); setErr(''); setSentTo(''); setBusy(false); };

  const requestOtp = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/auth/2fa', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || 'Lỗi gửi mã'); setBusy(false); return; }
      setChannel(j.channel === 'telegram' ? 'telegram' : 'email'); setSentTo(j.emailMasked || ''); setOtp(''); setModal('otp'); setBusy(false);
    } catch { setErr('Lỗi kết nối'); setBusy(false); }
  };

  const confirmEnable = async () => {
    if (!/^\d{6}$/.test(otp)) { setErr('Mã OTP gồm 6 chữ số'); return; }
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/auth/2fa', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otp }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || 'Mã OTP không đúng'); setBusy(false); return; }
      setEnabled(true); setOk('Đã bật xác thực hai yếu tố.'); close();
      setTimeout(() => setOk(''), 4000);
    } catch { setErr('Lỗi kết nối'); setBusy(false); }
  };

  const disable = async () => {
    if (!window.confirm('Tắt xác thực hai yếu tố? Đăng nhập sẽ không cần OTP nữa.')) return;
    setBusy(true);
    try {
      const r = await fetch('/api/auth/2fa', { method: 'DELETE' });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error || 'Lỗi'); return; }
      setEnabled(false); setOk('Đã tắt xác thực hai yếu tố.'); setTimeout(() => setOk(''), 4000);
    } finally { setBusy(false); }
  };

  const INPUT = 'w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2.5 text-center text-lg font-semibold tracking-[0.5em] text-foreground outline-none focus:border-indigo-500';

  return (
    <Card title="Xác Thực Hai Yếu Tố" desc="Tăng cường bảo mật cho tài khoản">
      <p className="text-sm text-muted-foreground">Bảo vệ tài khoản bằng xác thực 2 bước khi đăng nhập. Mỗi lần đăng nhập cần nhập mã OTP gửi qua email.</p>
      {ok && <p className="text-sm text-emerald-400 flex items-center gap-1.5"><CheckCircle className="h-4 w-4" /> {ok}</p>}
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-600 ${enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-muted-foreground'}`}>
          <Shield className="h-3.5 w-3.5" /> {loading ? '...' : enabled ? 'Đang bật' : 'Đang tắt'}
        </span>
        {!loading && (enabled ? (
          <button onClick={() => void disable()} disabled={busy}
            className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-600 text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors">
            Tắt Xác Thực Hai Yếu Tố
          </button>
        ) : (
          <button onClick={() => { setErr(''); void requestOtp(); setModal('request'); }} disabled={busy}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-600 text-white disabled:opacity-50 transition-colors">
            Bật Xác Thực Hai Yếu Tố
          </button>
        ))}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="w-full max-w-sm rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <h2 className="flex items-center gap-2 text-base font-700 text-foreground"><Shield className="h-4 w-4 text-indigo-400" /> Bật Xác Thực Hai Yếu Tố</h2>
              <button onClick={close} className="text-lg leading-none opacity-60 hover:opacity-100">×</button>
            </div>
            <div className="p-6 space-y-4">
              {modal === 'request' || busy && !sentTo ? (
                <div className="flex flex-col items-center py-6 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mb-3" />
                  <p className="text-sm">Đang gửi email xác minh…</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {channel === 'telegram'
                      ? <>Đã gửi mã OTP qua <span className="font-600 text-foreground">Telegram (FADO Notification)</span>. Mở Telegram lấy mã rồi nhập vào đây.</>
                      : <>Đã gửi email tới <span className="font-600 text-foreground">{sentTo}</span>. Mở email, bấm <span className="font-600 text-foreground">&quot;Xác minh &amp; Đăng nhập&quot;</span> để lấy mã, rồi nhập vào đây.</>}
                  </p>
                  <input inputMode="numeric" autoFocus value={otp}
                    onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') void confirmEnable(); }}
                    placeholder="______" className={INPUT} />
                  {err && <p className="text-xs text-red-400">{err}</p>}
                  <div className="flex items-center gap-2">
                    <button onClick={() => void confirmEnable()} disabled={busy || otp.length !== 6}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-600 text-white">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />} Xác nhận bật
                    </button>
                    <button onClick={() => void requestOtp()} disabled={busy} className="btn-ghost rounded-xl px-3 py-2 text-xs">Gửi lại mã</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Sessions ─────────────────────────────────────────────────────────────────
function SessionSettings({ setMessage }: { setMessage: (m: { type: 'success' | 'error'; text: string } | null) => void }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState<string | null>(null);
  const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') : null;

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    fetch('/api/auth/sessions', { headers: { 'x-user-id': userId } })
      .then((r) => r.ok ? r.json() : { data: [] })
      .then((j) => setSessions(j.data || []))
      .catch(() => setMessage({ type: 'error', text: 'Không thể tải danh sách phiên' }))
      .finally(() => setLoading(false));
  }, [userId, setMessage]);

  async function handleLogout(sessionId: string) {
    if (!userId) return;
    setLoggingOut(sessionId);
    try {
      const res = await fetch(`/api/auth/sessions/${sessionId}/logout`, { method: 'POST', headers: { 'x-user-id': userId } });
      if (res.ok) { setSessions((s) => s.filter((x) => x.id !== sessionId)); setMessage({ type: 'success', text: 'Đã đăng xuất phiên' }); }
      else setMessage({ type: 'error', text: 'Không thể đăng xuất phiên' });
    } catch { setMessage({ type: 'error', text: 'Có lỗi xảy ra' }); }
    finally { setLoggingOut(null); }
  }

  async function handleLogoutAll() {
    if (!userId) return;
    const currentSessionId = localStorage.getItem('sessionId');
    if (!currentSessionId) return;
    setLoggingOut('all');
    try {
      const res = await fetch('/api/auth/logout-all', { method: 'POST', headers: { 'x-user-id': userId, 'x-session-id': currentSessionId } });
      if (res.ok) { setSessions((s) => s.filter((x) => x.id === currentSessionId)); setMessage({ type: 'success', text: 'Đã đăng xuất tất cả phiên khác' }); }
      else setMessage({ type: 'error', text: 'Không thể đăng xuất tất cả phiên' });
    } catch { setMessage({ type: 'error', text: 'Có lỗi xảy ra' }); }
    finally { setLoggingOut(null); }
  }

  function fmtTime(val: string) {
    const d = new Date(val), now = Date.now(), diff = now - d.getTime();
    const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), days = Math.floor(diff / 86400000);
    if (m < 1) return 'Vừa xong';
    if (m < 60) return `${m} phút trước`;
    if (h < 24) return `${h} giờ trước`;
    if (days < 7) return `${days} ngày trước`;
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  return (
    <Card title="Phiên Đăng Nhập" desc="Quản lý các thiết bị đang đăng nhập">
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Không có phiên nào</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <div key={s.id} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-line-subtle p-4"
              style={{ background: 'var(--background)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-600 text-foreground truncate">{s.device_name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.browser} · {s.os}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Lần cuối: {fmtTime(s.last_activity)}
                  {s.ip_address && ` · IP: ${s.ip_address}`}
                </p>
              </div>
              <button onClick={() => handleLogout(s.id)} disabled={loggingOut === s.id}
                className="shrink-0 rounded-xl border border-red-500/30 px-3 py-1.5 text-xs font-600 text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors">
                {loggingOut === s.id ? 'Đang...' : 'Đăng xuất'}
              </button>
            </div>
          ))}

          {sessions.length > 1 && (
            <div className="pt-2 border-t border-line-subtle">
              <button onClick={handleLogoutAll} disabled={loggingOut === 'all'}
                className="flex items-center gap-1.5 text-xs font-600 text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors">
                {loggingOut === 'all' && <Loader2 className="h-3 w-3 animate-spin" />}
                {loggingOut === 'all' ? 'Đang đăng xuất...' : 'Đăng xuất tất cả phiên khác'}
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
