'use client';

import { useState } from 'react';
import { X, ShieldCheck, Loader2, CheckCircle2 } from 'lucide-react';

interface Props {
  email: string;
  password: string;
  emailMasked?: string;
  channel?: 'email' | 'telegram';
  onCancel: () => void;
  onSuccess: (user: unknown) => void;
}

const INPUT = 'w-full rounded-xl border border-slate-600 bg-hover px-3.5 py-3 text-center text-lg font-semibold tracking-[0.6em] text-white placeholder:text-ink-muted outline-none focus:border-indigo-500 transition';

/** Bước OTP khi tài khoản bật 2FA — nhập mã lấy từ email (magic-link → trang /otp). */
export function Login2FAModal({ email, password, emailMasked, channel, onCancel, onSuccess }: Props) {
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!/^\d{6}$/.test(otp)) { setErr('Mã OTP gồm 6 chữ số'); return; }
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/auth/login-2fa', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, otp }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || 'Mã OTP không đúng'); setBusy(false); return; }
      onSuccess(j);
    } catch { setErr('Lỗi kết nối'); setBusy(false); }
  };

  const resend = async () => {
    setResending(true); setErr('');
    try {
      await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch { /* ignore */ } finally { setResending(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a1f3a 0%, #0f1628 100%)', border: '1px solid rgba(99, 102, 241, 0.1)' }}>
        <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl -z-10" />
        <button onClick={onCancel} className="absolute top-5 right-5 p-1 hover:bg-hover-strong rounded-full transition text-ink-bright hover:text-white z-10" aria-label="Close">
          <X size={20} />
        </button>
        <div className="p-8">
          <div className="text-center mb-7">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-500/20 mb-4">
              <ShieldCheck size={24} className="text-indigo-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-1.5">Xác Thực Hai Yếu Tố</h2>
            <p className="text-ink-muted text-sm">
              {channel === 'telegram'
                ? <>Đã gửi mã OTP qua <b className="text-indigo-300">Telegram (FADO Notification)</b>. Mở Telegram lấy mã rồi nhập vào đây.</>
                : <>Đã gửi email tới <b className="text-indigo-300">{emailMasked || email}</b>. Mở email, bấm <b className="text-indigo-300">&quot;Xác minh &amp; Đăng nhập&quot;</b> để lấy mã, rồi nhập vào đây.</>}
            </p>
          </div>
          <div className="space-y-3">
            <input inputMode="numeric" autoFocus value={otp}
              onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
              placeholder="______" className={INPUT} />
            {err && <p className="text-xs text-red-400">{err}</p>}
            <button onClick={() => void submit()} disabled={busy || otp.length !== 6}
              className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 rounded-xl font-medium transition">
              {busy ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />} Xác minh & Đăng nhập
            </button>
            <button onClick={() => void resend()} disabled={resending} className="w-full text-xs text-ink-muted hover:text-indigo-300 transition py-1">
              {resending ? 'Đang gửi lại…' : 'Gửi lại email'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
