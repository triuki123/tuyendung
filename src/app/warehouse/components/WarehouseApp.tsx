'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Fingerprint, CalendarDays, BarChart3, Megaphone, FileText, LogOut, Warehouse, KeyRound } from 'lucide-react';
import CheckinView from './CheckinView';
import TimesheetView from './TimesheetView';
import OutputView from './OutputView';
import NewsView from './NewsView';
import RequestsView from './RequestsView';

export interface MeData {
  worker: { id: string; full_name: string; cccd: string; shift_id: string | null; shift_name: string | null; must_change_pin: boolean };
  warehouse: {
    id: string; name: string; code: string; has_gps: boolean; radius_m: number;
    advance_enabled: boolean;
    /** 'shift' = 1 đợt/ngày theo ca (mặc định) · 'flex' = nhiều đợt/ngày, tổng giờ cộng dồn */
    attendance_mode: 'shift' | 'flex';
  } | null;
  shifts: { id: string; name: string; start_time: string; end_time: string }[];
  /** Sản phẩm của kho — để công nhân tự khai sản lượng lúc check-out */
  products: { id: string; name: string; unit: string }[];
  /** Chấm công hôm nay: mọi đợt + đợt đang mở + tổng giờ các đợt hợp lệ */
  today: { sessions: any[]; open: any | null; total_hours: number } | null;
}

type TabKey = 'checkin' | 'timesheet' | 'output' | 'news' | 'requests';

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'checkin', label: 'Chấm công', icon: Fingerprint },
  { key: 'timesheet', label: 'Bảng công', icon: CalendarDays },
  { key: 'output', label: 'Sản lượng', icon: BarChart3 },
  { key: 'news', label: 'Bảng tin', icon: Megaphone },
  { key: 'requests', label: 'Yêu cầu', icon: FileText },
];

export default function WarehouseApp() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeData | null>(null);
  const [tab, setTab] = useState<TabKey>('checkin');

  const loadMe = useCallback(async () => {
    try {
      const res = await fetch('/api/warehouse/me');
      if (res.ok) {
        const json = await res.json();
        setMe(json.data);
      } else {
        setMe(null);
      }
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMe(); }, [loadMe]);

  const handleLogout = async () => {
    await fetch('/api/warehouse/auth/logout', { method: 'POST' });
    setMe(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!me) return <LoginView onLoggedIn={loadMe} />;

  // Lần đầu đăng nhập bằng PIN tạm (hoặc vừa được cấp lại PIN) → buộc đổi PIN
  if (me.worker.must_change_pin) {
    return <ChangePinView onDone={loadMe} onLogout={handleLogout} />;
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      {/* Topbar */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between border-b border-white/5 px-4 py-3"
        style={{ background: 'var(--card)', paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600/20 shrink-0">
            <Warehouse className="h-5 w-5 text-indigo-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-600 text-foreground truncate">{me.worker.full_name}</p>
            <p className="text-xs text-muted-foreground truncate">{me.warehouse?.name || 'Kho'}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="btn-ghost rounded-lg p-2" title="Đăng xuất">
          <LogOut className="h-4 w-4 text-muted-foreground" />
        </button>
      </header>

      {/* Nội dung */}
      <main className="flex-1 p-4 pb-24 max-w-lg w-full mx-auto">
        {tab === 'checkin' && <CheckinView me={me} onChanged={loadMe} />}
        {tab === 'timesheet' && <TimesheetView />}
        {tab === 'output' && <OutputView />}
        {tab === 'news' && <NewsView />}
        {tab === 'requests' && <RequestsView advanceEnabled={!!me.warehouse?.advance_enabled} />}
      </main>

      {/* Bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 flex"
        style={{ background: 'var(--card)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-600 ${active ? 'text-indigo-400' : 'text-muted-foreground'}`}
            >
              <Icon className="h-5 w-5" />
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/** Màn hình BẮT BUỘC đổi PIN — chặn toàn bộ app cho tới khi đặt PIN mới */
function ChangePinView({ onDone, onLogout }: { onDone: () => void; onLogout: () => void }) {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pinInput = (value: string, set: (v: string) => void, placeholder: string, autoComplete: string) => (
    <input
      value={value}
      onChange={(e) => set(e.target.value.replace(/\D/g, '').slice(0, 6))}
      inputMode="numeric"
      type="password"
      autoComplete={autoComplete}
      placeholder={placeholder}
      className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#162033] px-4 py-3 text-sm text-foreground tracking-[0.4em] placeholder:tracking-normal placeholder:text-muted-foreground/50 focus:outline-none focus:border-indigo-500"
    />
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPin !== confirmPin) { setError('PIN mới nhập lại không khớp'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/warehouse/auth/change-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPin, newPin }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Đổi PIN thất bại'); return; }
      onDone();
    } catch {
      setError('Lỗi kết nối, thử lại');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--background)' }}>
      <div className="w-full max-w-sm rounded-3xl border border-white/10 p-6" style={{ background: 'var(--card)' }}>
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 mb-3">
            <KeyRound className="h-7 w-7 text-amber-400" />
          </div>
          <h1 className="text-lg font-700 text-foreground">Đặt mã PIN mới</h1>
          <p className="text-xs text-muted-foreground mt-1.5">
            Mã PIN quản lý cấp chỉ dùng 1 lần.<br />Hãy tự đặt PIN 6 số riêng của bạn để bảo mật.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">PIN được cấp (hiện tại)</label>
            {pinInput(currentPin, setCurrentPin, '6 chữ số', 'current-password')}
          </div>
          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">PIN mới</label>
            {pinInput(newPin, setNewPin, 'Tự chọn 6 chữ số', 'new-password')}
          </div>
          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Nhập lại PIN mới</label>
            {pinInput(confirmPin, setConfirmPin, 'Nhập lại', 'new-password')}
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy || currentPin.length !== 6 || newPin.length !== 6 || confirmPin.length !== 6}
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-600 text-white disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Đổi PIN & vào app
          </button>
        </form>
        <button onClick={onLogout} className="w-full text-center text-[11px] text-muted-foreground/60 mt-4 hover:text-muted-foreground">
          Đăng xuất
        </button>
      </div>
    </div>
  );
}

function LoginView({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [cccd, setCccd] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Khi 1 người làm nhiều kho: PIN đúng → chọn kho chấm công
  const [choices, setChoices] = useState<{ id: string; name: string }[] | null>(null);

  const doLogin = async (warehouseId?: string) => {
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/warehouse/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cccd, pin, warehouseId }),
      });
      const json = await res.json();
      if (res.status === 409 && json.chooseWarehouse) {
        setChoices(json.chooseWarehouse);
        return;
      }
      if (!res.ok) { setError(json.error || 'Đăng nhập thất bại'); setChoices(null); return; }
      onLoggedIn();
    } catch {
      setError('Lỗi kết nối, thử lại');
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    doLogin();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--background)' }}>
      <div className="w-full max-w-sm rounded-3xl border border-white/10 p-6" style={{ background: 'var(--card)' }}>
        <div className="flex flex-col items-center mb-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/20 mb-3">
            <Warehouse className="h-7 w-7 text-indigo-400" />
          </div>
          <h1 className="text-xl font-700 text-foreground">Warehouse</h1>
          <p className="text-xs text-muted-foreground mt-1">Chấm công & sản lượng kho</p>
        </div>
        {choices ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground text-center">Bạn có tài khoản ở nhiều kho.<br />Chọn kho bạn muốn chấm công:</p>
            {choices.map((w) => (
              <button
                key={w.id}
                onClick={() => doLogin(w.id)}
                disabled={submitting}
                className="w-full rounded-xl border border-white/10 bg-[#162033] px-4 py-3 text-sm font-600 text-foreground hover:border-indigo-500 flex items-center justify-between disabled:opacity-50"
              >
                <span className="flex items-center gap-2"><Warehouse className="h-4 w-4 text-indigo-400" /> {w.name}</span>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              </button>
            ))}
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button onClick={() => { setChoices(null); setPin(''); }} className="w-full text-center text-[11px] text-muted-foreground/60 mt-1 hover:text-muted-foreground">
              ← Quay lại
            </button>
          </div>
        ) : (
          <>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Số CCCD</label>
              <input
                value={cccd}
                onChange={(e) => setCccd(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                autoComplete="username"
                placeholder="Nhập số căn cước"
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#162033] px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Mã PIN</label>
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                type="password"
                autoComplete="current-password"
                placeholder="6 chữ số"
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#162033] px-4 py-3 text-sm text-foreground tracking-[0.4em] placeholder:tracking-normal placeholder:text-muted-foreground/50 focus:outline-none focus:border-indigo-500"
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={submitting || !cccd || !pin}
              className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-600 text-white disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Đăng nhập
            </button>
          </form>
          <p className="text-[11px] text-muted-foreground/60 text-center mt-4">
            Quên PIN? Liên hệ quản lý kho để cấp lại.
          </p>
          </>
        )}
      </div>
    </div>
  );
}
