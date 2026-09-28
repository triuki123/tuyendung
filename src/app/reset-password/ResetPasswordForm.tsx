'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AlertCircle, Lock, Loader, Eye, EyeOff, CheckCircle2, ArrowLeft } from 'lucide-react';

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [validToken, setValidToken] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setError('Token không được cung cấp');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/auth/verify-reset-token?token=${token}`);
        const data = await response.json();

        if (data.valid) {
          setValidToken(true);
          setEmail(data.email);
        } else {
          setError(data.error || 'Token không hợp lệ hoặc đã hết hạn');
        }
      } catch (err) {
        console.error('Token verification error:', err);
        setError('Lỗi xác minh token. Vui lòng thử lại');
      } finally {
        setLoading(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    if (!newPassword || !confirmPassword) {
      setError('Vui lòng nhập mật khẩu');
      setSubmitting(false);
      return;
    }

    if (newPassword.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự');
      setSubmitting(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu không khớp');
      setSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Lỗi cập nhật mật khẩu');
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/sign-up-login-screen');
      }, 2000);
    } catch (err) {
      console.error('Reset password error:', err);
      setError('Lỗi kết nối. Vui lòng thử lại');
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center">
          <Loader className="animate-spin text-indigo-400 mx-auto mb-4" size={48} />
          <p className="text-ink-bright font-medium">Đang xác minh token...</p>
        </div>
      </div>
    );
  }

  // Invalid token state
  if (!validToken) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="relative max-w-md w-full rounded-2xl shadow-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #1a1f3a 0%, #0f1628 100%)',
            border: '1px solid rgba(99, 102, 241, 0.1)',
          }}>

          <div className="absolute top-0 right-0 w-40 h-40 bg-red-500/10 rounded-full blur-3xl" />

          <div className="relative p-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-500/20 mb-4">
              <AlertCircle size={28} className="text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Token Không Hợp Lệ</h1>
            <p className="text-ink-muted text-sm mb-6">{error}</p>
            <a
              href="/sign-up-login-screen"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition"
            >
              <ArrowLeft size={18} />
              Quay lại đăng nhập
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="relative max-w-md w-full rounded-2xl shadow-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #1a1f3a 0%, #0f1628 100%)',
            border: '1px solid rgba(34, 197, 94, 0.1)',
          }}>

          <div className="absolute top-0 right-0 w-40 h-40 bg-green-500/10 rounded-full blur-3xl" />

          <div className="relative p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 mb-4">
              <CheckCircle2 size={32} className="text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Thành Công!</h1>
            <p className="text-ink-muted text-sm mb-6">
              Mật khẩu của bạn đã được cập nhật. Đang chuyển hướng...
            </p>
            <Loader className="animate-spin text-green-400 mx-auto" size={24} />
          </div>
        </div>
      </div>
    );
  }

  // Reset password form state
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="relative max-w-md w-full rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #1a1f3a 0%, #0f1628 100%)',
          border: '1px solid rgba(99, 102, 241, 0.1)',
        }}>

        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl" />

        <div className="relative p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-indigo-500/20 mb-4">
              <Lock size={28} className="text-indigo-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Đặt Mật Khẩu Mới</h1>
            <p className="text-ink-muted text-sm">Tạo mật khẩu mạnh cho tài khoản của bạn</p>
            <p className="text-ink-faint text-xs mt-3">📧 {email}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Password field */}
            <div>
              <label className="block text-sm font-medium text-ink-bright mb-2">
                Mật Khẩu Mới
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                  className="w-full px-4 py-3 bg-hover border border-slate-600 rounded-lg text-white placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition pr-10"
                  required
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-ink-muted hover:text-ink-bright transition"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Confirm password field */}
            <div>
              <label className="block text-sm font-medium text-ink-bright mb-2">
                Xác Nhận Mật Khẩu
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu"
                  className="w-full px-4 py-3 bg-hover border border-slate-600 rounded-lg text-white placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition pr-10"
                  required
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3.5 text-ink-muted hover:text-ink-bright transition"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition mt-6"
            >
              {submitting ? (
                <>
                  <Loader size={18} className="animate-spin" />
                  Đang cập nhật...
                </>
              ) : (
                <>
                  <Lock size={18} />
                  Cập Nhật Mật Khẩu
                </>
              )}
            </button>
          </form>

          {/* Help text */}
          <p className="text-center text-ink-muted text-sm mt-6">
            <a
              href="/sign-up-login-screen"
              className="text-indigo-400 hover:text-indigo-300 font-medium transition"
            >
              ← Quay lại đăng nhập
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
