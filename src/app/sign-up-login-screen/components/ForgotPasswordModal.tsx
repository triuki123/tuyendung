'use client';

import { useState } from 'react';
import { Mail, X, Lock, Loader2, CheckCircle2, ArrowRight, KeyRound } from 'lucide-react';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'email' | 'otp' | 'password' | 'done';

const INPUT = 'w-full rounded-xl border border-slate-600 bg-hover px-3.5 py-3 text-sm text-white placeholder:text-ink-muted outline-none focus:border-indigo-500 transition';

export function ForgotPasswordModal({ isOpen, onClose }: ForgotPasswordModalProps) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sentTo, setSentTo] = useState('');

  if (!isOpen) return null;

  const close = () => {
    setStep('email'); setEmail(''); setOtp(''); setPwd(''); setConfirm(''); setErr(''); setBusy(false); setSentTo('');
    onClose();
  };

  const requestLink = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setErr('Email không hợp lệ'); return; }
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/auth/otp-reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || 'Có lỗi xảy ra'); setBusy(false); return; }
      setSentTo(email.trim()); setStep('otp'); setBusy(false);
    } catch { setErr('Lỗi kết nối'); setBusy(false); }
  };

  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(otp)) { setErr('Mã OTP gồm 6 chữ số'); return; }
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/auth/otp-reset', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), otp }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || 'Mã OTP không đúng'); setBusy(false); return; }
      setStep('password'); setBusy(false);
    } catch { setErr('Lỗi kết nối'); setBusy(false); }
  };

  const setPassword = async () => {
    if (pwd.length < 6) { setErr('Mật khẩu tối thiểu 6 ký tự'); return; }
    if (pwd !== confirm) { setErr('Mật khẩu nhập lại không khớp'); return; }
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/auth/otp-reset', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), otp, password: pwd, confirm }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || 'Có lỗi xảy ra'); setBusy(false); return; }
      setStep('done'); setBusy(false);
    } catch { setErr('Lỗi kết nối'); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a1f3a 0%, #0f1628 100%)', border: '1px solid rgba(99, 102, 241, 0.1)' }}>
        <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl -z-10" />
        <button onClick={close} className="absolute top-5 right-5 p-1 hover:bg-hover-strong rounded-full transition text-ink-bright hover:text-white z-10" aria-label="Close">
          <X size={20} />
        </button>

        <div className="p-8">
          {/* Header */}
          <div className="text-center mb-7">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-500/20 mb-4">
              {step === 'done' ? <CheckCircle2 size={24} className="text-emerald-400" /> : <KeyRound size={24} className="text-indigo-400" />}
            </div>
            <h2 className="text-2xl font-bold text-white mb-1.5">
              {step === 'email' && 'Quên Mật Khẩu?'}
              {step === 'otp' && 'Nhập Mã Xác Minh'}
              {step === 'password' && 'Đặt Mật Khẩu Mới'}
              {step === 'done' && 'Hoàn Tất'}
            </h2>
            <p className="text-ink-muted text-sm">
              {step === 'email' && 'Nhập email để nhận liên kết xác minh.'}
              {step === 'otp' && <>Nếu <b className="text-indigo-300">{sentTo}</b> tồn tại, mã xác thực đã được gửi qua <b className="text-indigo-300">email</b> (bấm "Xác minh &amp; Đăng nhập" để lấy mã) hoặc <b className="text-indigo-300">Telegram</b> nếu đã liên kết. Nhập mã vào đây.</>}
              {step === 'password' && 'Mã hợp lệ. Đặt mật khẩu mới cho tài khoản.'}
              {step === 'done' && 'Mật khẩu đã được cập nhật. Đăng nhập với mật khẩu mới.'}
            </p>
          </div>

          {/* Steps */}
          {step === 'email' && (
            <div className="space-y-3">
              <div className="relative">
                <Mail size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input type="email" autoFocus value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void requestLink(); }}
                  placeholder="your.email@company.vn" className={`${INPUT} pl-10`} />
              </div>
              {err && <p className="text-xs text-red-400">{err}</p>}
              <button onClick={() => void requestLink()} disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 rounded-xl font-medium transition">
                {busy ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />} Gửi liên kết xác minh
              </button>
            </div>
          )}

          {step === 'otp' && (
            <div className="space-y-3">
              <input inputMode="numeric" autoFocus value={otp}
                onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') void verifyOtp(); }}
                placeholder="______" className={`${INPUT} text-center tracking-[0.6em] text-lg font-semibold`} />
              {err && <p className="text-xs text-red-400">{err}</p>}
              <button onClick={() => void verifyOtp()} disabled={busy || otp.length !== 6}
                className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 rounded-xl font-medium transition">
                {busy ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />} Xác minh
              </button>
              <button onClick={() => void requestLink()} disabled={busy} className="w-full text-xs text-ink-muted hover:text-indigo-300 transition py-1">Gửi lại email</button>
            </div>
          )}

          {step === 'password' && (
            <div className="space-y-3">
              <div className="relative">
                <Lock size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input type="password" autoFocus value={pwd} onChange={(e) => { setPwd(e.target.value); setErr(''); }}
                  placeholder="Mật khẩu mới (tối thiểu 6 ký tự)" className={`${INPUT} pl-10`} />
              </div>
              <div className="relative">
                <Lock size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input type="password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setErr(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void setPassword(); }}
                  placeholder="Nhập lại mật khẩu" className={`${INPUT} pl-10`} />
              </div>
              {err && <p className="text-xs text-red-400">{err}</p>}
              <button onClick={() => void setPassword()} disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 rounded-xl font-medium transition">
                {busy ? <Loader2 size={17} className="animate-spin" /> : <Lock size={17} />} Đặt lại mật khẩu
              </button>
            </div>
          )}

          {step === 'done' && (
            <button onClick={close} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-medium transition">
              Quay lại đăng nhập
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
