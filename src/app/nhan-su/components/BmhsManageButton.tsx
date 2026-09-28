'use client';

/**
 * Nút quản trị BMHS cho 1 hồ sơ (chỉ hiện với super_admin có quyền BMHS).
 * Bật/đổi mật khẩu, tắt khóa, và reset qua OTP email khi quên.
 */
import { useEffect, useState } from 'react';
import { Loader2, Lock, LockOpen, X, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/context/ToastContext';

type Mode = 'idle' | 'set' | 'reset';

export default function BmhsManageButton({ employeeId, employeeName }: { employeeId: string; employeeName?: string | null }) {
  const toast = useToast();
  const [canManage, setCanManage] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('idle');
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState('');
  const [otpChannel, setOtpChannel] = useState<'email' | 'telegram'>('email');
  const [otpVerified, setOtpVerified] = useState(false); // bước 1 (OTP) đã đúng → mở form đổi mật khẩu
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r = await fetch(`/api/users/${employeeId}/bmhs`, { headers: { 'x-bmhs-retry': '1' } });
      const j = await r.json().catch(() => ({}));
      if (j?.data) { setCanManage(!!j.data.canManage); setEnabled(!!j.data.enabled); }
    } catch { /* ignore */ }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [employeeId]);

  if (!canManage) return null;

  const reset = () => { setPwd(''); setConfirm(''); setOtp(''); setOtpSent(''); setOtpVerified(false); setMode('idle'); };
  const close = () => { setOpen(false); reset(); };

  const setPassword = async () => {
    if (pwd.length < 6) { toast.error('Mật khẩu tối thiểu 6 ký tự'); return; }
    if (pwd !== confirm) { toast.error('Mật khẩu nhập lại không khớp'); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/users/${employeeId}/bmhs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-bmhs-retry': '1' },
        body: JSON.stringify({ password: pwd, confirm }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(j.error || 'Lỗi'); return; }
      toast.success(enabled ? 'Đã đổi mật khẩu hồ sơ' : 'Đã bật bảo mật hồ sơ');
      setEnabled(true); close();
    } finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/users/${employeeId}/bmhs`, { method: 'DELETE', headers: { 'x-bmhs-retry': '1' } });
      if (!r.ok) { const j = await r.json().catch(() => ({})); toast.error(j.error || 'Lỗi'); return; }
      toast.success('Đã tắt bảo mật hồ sơ'); setEnabled(false); close();
    } finally { setBusy(false); }
  };

  // Bấm "Quên mật khẩu" → gửi OTP về email, mở khung nhập OTP (bước 1).
  const requestOtp = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/users/${employeeId}/bmhs/reset`, { method: 'POST', headers: { 'x-bmhs-retry': '1' } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(j.error || 'Lỗi gửi mã'); return; }
      const ch = j.channel === 'telegram' ? 'telegram' : 'email';
      setOtpChannel(ch); setOtpSent(j.emailMasked || ''); setOtp(''); setOtpVerified(false); setPwd(''); setConfirm(''); setMode('reset');
      toast.success(ch === 'telegram'
        ? 'Đã gửi mã OTP qua Telegram (FADO Notification).'
        : `Đã gửi email tới ${j.emailMasked || 'email của bạn'}. Mở email, bấm "Xác minh & Đăng nhập" để lấy mã.`);
    } finally { setBusy(false); }
  };

  // Bước 1: xác minh OTP đúng → mở form đổi mật khẩu (bước 2).
  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(otp)) { toast.error('Mã OTP gồm 6 chữ số'); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/users/${employeeId}/bmhs/reset`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-bmhs-retry': '1' },
        body: JSON.stringify({ otp }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(j.error || 'Mã OTP không đúng'); return; }
      setOtpVerified(true);
    } finally { setBusy(false); }
  };

  // Bước 2: đặt mật khẩu mới (gửi kèm OTP để xác minh + tiêu thụ ở server).
  const confirmReset = async () => {
    if (pwd.length < 6) { toast.error('Mật khẩu tối thiểu 6 ký tự'); return; }
    if (pwd !== confirm) { toast.error('Mật khẩu nhập lại không khớp'); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/users/${employeeId}/bmhs/reset`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-bmhs-retry': '1' },
        body: JSON.stringify({ otp, password: pwd, confirm }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(j.error || 'Lỗi'); return; }
      toast.success('Đã đặt lại mật khẩu hồ sơ'); setEnabled(true); close();
    } finally { setBusy(false); }
  };

  const INPUT = 'w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2.5 text-sm text-foreground outline-none focus:border-indigo-500';

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        title="Bảo mật hồ sơ (BMHS)"
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-2xs font-600 transition-colors ${enabled ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300' : 'border-white/10 text-muted-foreground hover:bg-hover'}`}>
        {enabled ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />} BMHS
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl border border-white/10 overflow-hidden"
            style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <h2 className="flex items-center gap-2 text-base font-700 text-foreground"><Lock className="h-4 w-4 text-indigo-400" /> Bảo Mật Hồ Sơ</h2>
              <button onClick={close} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                Hồ sơ <span className="font-600 text-foreground">{employeeName || ''}</span> hiện <span className={enabled ? 'text-indigo-300 font-600' : 'text-muted-foreground'}>{enabled ? 'ĐANG khóa' : 'chưa khóa'}</span>.
              </p>

              {mode === 'idle' && (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-2xs font-600 text-muted-foreground uppercase tracking-wider">{enabled ? 'Mật khẩu mới' : 'Mật khẩu'}</label>
                    <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} className={INPUT} placeholder="Tối thiểu 6 ký tự" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-2xs font-600 text-muted-foreground uppercase tracking-wider">Nhập lại mật khẩu</label>
                    <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={INPUT} placeholder="Nhập lại" />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button onClick={() => void setPassword()} disabled={busy}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-600 text-white">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} {enabled ? 'Đổi mật khẩu' : 'Bật khóa'}
                    </button>
                    {enabled && (
                      <>
                        <button onClick={() => void requestOtp()} disabled={busy} className="btn-ghost rounded-xl px-3 py-2 text-xs">Quên mật khẩu</button>
                        <button onClick={() => void disable()} disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-600 text-red-400 hover:bg-red-500/20">
                          <LockOpen className="h-3.5 w-3.5" /> Tắt khóa
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {mode === 'reset' && !otpVerified && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {otpChannel === 'telegram'
                      ? <>Đã gửi mã OTP qua <span className="font-600 text-foreground">Telegram (FADO Notification)</span>. Mở Telegram lấy mã rồi nhập vào đây.</>
                      : <>Đã gửi email tới <span className="font-600 text-foreground">{otpSent}</span>. Mở email, bấm <span className="font-600 text-foreground">"Xác minh &amp; Đăng nhập"</span> để lấy mã rồi nhập vào đây.</>}
                  </p>
                  <div>
                    <label className="mb-1.5 block text-2xs font-600 text-muted-foreground uppercase tracking-wider">Mã OTP (6 số)</label>
                    <input inputMode="numeric" autoFocus value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      onKeyDown={(e) => { if (e.key === 'Enter') void verifyOtp(); }}
                      className={`${INPUT} tracking-[0.5em] text-center`} placeholder="______" />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={() => void verifyOtp()} disabled={busy || otp.length !== 6}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-600 text-white">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Xác minh
                    </button>
                    <button onClick={() => void requestOtp()} disabled={busy} className="btn-ghost rounded-xl px-3 py-2 text-xs">Gửi lại mã</button>
                  </div>
                </div>
              )}

              {mode === 'reset' && otpVerified && (
                <div className="space-y-3">
                  <p className="text-xs text-emerald-400 flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Mã hợp lệ. Đặt mật khẩu mới cho hồ sơ.</p>
                  <div>
                    <label className="mb-1.5 block text-2xs font-600 text-muted-foreground uppercase tracking-wider">Mật khẩu mới</label>
                    <input type="password" autoFocus value={pwd} onChange={(e) => setPwd(e.target.value)} className={INPUT} placeholder="Tối thiểu 6 ký tự" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-2xs font-600 text-muted-foreground uppercase tracking-wider">Nhập lại mật khẩu</label>
                    <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void confirmReset(); }} className={INPUT} placeholder="Nhập lại" />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={() => void confirmReset()} disabled={busy}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-600 text-white">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Đặt lại mật khẩu
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
