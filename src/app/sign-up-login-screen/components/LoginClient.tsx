'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Shield, AlertCircle, Package, TrendingUp, Users, Zap, ClipboardList } from 'lucide-react';
import BrandWordmark from '@/components/ui/BrandWordmark';
import SplashScreen from '@/components/ui/SplashScreen';
import { APP_VERSION_LABEL } from '@/lib/version';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import { Login2FAModal } from './Login2FAModal';
import TelegramLoginButton from '@/components/auth/TelegramLoginButton';
import type { TelegramAuthData } from '@/lib/services/telegramAuthService';

interface LoginFormValues {
  email: string;
  password: string;
  remember: boolean;
}

export default function LoginClient() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  // 2FA: khi tài khoản bật xác thực 2 bước, chờ nhập OTP trước khi tạo phiên.
  const [twofa, setTwofa] = useState<{ email: string; password: string; emailMasked?: string; channel?: 'email' | 'telegram' } | null>(null);

  // Telegram login (chỉ đăng nhập — KHÔNG có tự liên kết; super_admin gắn quyền trước)
  const [tgLoading, setTgLoading] = useState(false);

  // Chỉ SSO: form mật khẩu là đường break-glass, chỉ hiện khi ?mode=emergency.
  const [emergencyMode, setEmergencyMode] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormValues>({
    defaultValues: { email: '', password: '', remember: false },
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'emergency') setEmergencyMode(true);
    const err = params.get('error');
    if (err) {
      const messages: Record<string, string> = {
        sso_no_account: 'Tài khoản SSO của bạn chưa được cấp trên AssetFlow. Liên hệ quản trị viên.',
        sso_inactive: 'Tài khoản này đã bị khóa trên AssetFlow.',
        sso_failed: 'Đăng nhập SSO thất bại hoặc phiên xác thực hết hạn. Vui lòng thử lại.',
      };
      setLoginError(messages[err] || 'Đăng nhập thất bại. Vui lòng thử lại.');
    }
  }, []);

  /** Trang đích sau đăng nhập: ưu tiên ?redirect (do middleware gắn), mặc định /dashboard. */
  const getRedirectTarget = (): string => {
    if (typeof window === 'undefined') return '/dashboard';
    const target = new URLSearchParams(window.location.search).get('redirect');
    // Chỉ chấp nhận đường dẫn nội bộ (chống open-redirect).
    if (target && target.startsWith('/') && !target.startsWith('//')) return target;
    return '/dashboard';
  };

  /** Lưu phiên + hiện splash → dashboard (dùng chung cho mọi luồng đăng nhập). */
  const completeLogin = (user: unknown) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('assetflow_auth', JSON.stringify(user));
      localStorage.setItem('currentUser', JSON.stringify(user));
      // Đa Công Ty: đăng nhập mới luôn bắt đầu ở công ty CHÍNH (xóa active tồn dư).
      localStorage.removeItem('active_company_id');
    }
    router.prefetch('/dashboard');
    setShowSplash(true);
  };

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    setLoginError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email, password: data.password }),
      });

      if (response.ok) {
        const j = await response.json();
        if (j?.twofa_required) {
          // Tài khoản bật 2FA → chờ OTP, chưa có phiên.
          setTwofa({ email: data.email, password: data.password, emailMasked: j.emailMasked, channel: j.channel });
          setIsLoading(false);
        } else {
          completeLogin(j);
        }
      } else {
        const j = await response.json().catch(() => null);
        setLoginError(j?.error || 'Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.');
        setIsLoading(false);
      }
    } catch (error) {
      setLoginError('Đăng nhập thất bại. Vui lòng thử lại.');
      setIsLoading(false);
    }
  };

  /**
   * Callback từ Telegram Login Widget — CHỈ đăng nhập.
   * telegram_id phải được Quản trị viên tối cao gắn trước. Nếu chưa → server trả 403.
   */
  const handleTelegramAuth = async (tgUser: TelegramAuthData) => {
    setLoginError('');
    setTgLoading(true);
    try {
      const res = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tgUser),
      });
      const data = await res.json();
      if (res.ok) {
        completeLogin(data);
      } else {
        setLoginError(data.error || 'Đăng nhập Telegram thất bại.');
      }
    } catch {
      setLoginError('Đăng nhập Telegram thất bại. Vui lòng thử lại.');
    } finally {
      setTgLoading(false);
    }
  };

  const STATS = [
    { icon: <Package size={18} />, label: 'Tài sản quản lý', value: '1,247' },
    { icon: <Users size={18} />, label: 'Nhân viên', value: '386' },
    { icon: <ClipboardList size={18} />, label: 'Công việc hoạt động', value: '154' },
    { icon: <Zap size={18} />, label: 'Yêu cầu hỗ trợ', value: '23' },
  ];

  if (showSplash) {
    return <SplashScreen onFinish={() => router.push(getRedirectTarget())} />;
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--background)' }}>
      {/* Left panel — brand hero */}
      <div
        className="hidden lg:flex flex-col justify-between w-[45%] xl:w-[42%] p-10 xl:p-14 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #0B1F3B 0%, #0d1a30 60%, #080f1c 100%)' }}
      >
        <div
          className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)', transform: 'translate(30%, -30%)' }}
        />
        <div
          className="absolute bottom-0 left-0 w-80 h-80 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #C62828 0%, transparent 70%)', transform: 'translate(-30%, 30%)' }}
        />

        <div className="relative z-10">
          <BrandWordmark height={100} tagline={true} onDark />
        </div>

        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="text-4xl xl:text-5xl font-800 text-white leading-tight mb-4">
              Nền tảng vận hành<br />
              doanh nghiệp tôi ưu &<br />
              <span className="text-gradient-indigo">thông minh</span>
            </h1>
            <p className="text-base text-muted-foreground leading-relaxed max-w-lg">
              Hệ thống tích hợp cho phép các tổ chức quản lý hiệu quả tài sản, cấu trúc nhân sự, phân công công việc, yêu cầu hỗ trợ và các quy trình hành chính từ một nền tảng duy nhất.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {STATS.map((stat, i) => (
              <div
                key={`stat-${i}`}
                className="rounded-2xl p-4 border border-white/05"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              >
                <div className="flex items-center gap-2 mb-2 text-indigo">
                  {stat.icon}
                  <span className="text-xs text-muted-foreground">{stat.label}</span>
                </div>
                <p className="text-2xl font-700 text-white tabular-nums">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-2xs text-muted-foreground/50 relative z-10">
          ©FADO AssetFlow {APP_VERSION_LABEL}. Được phát triển và vận hành bởi HR FADO Group
        </p>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 xl:p-10">
        <div className="w-full max-w-md">
          <div className="mb-6 sm:mb-8 lg:hidden">
            <BrandWordmark height={78} tagline={true} />
          </div>

          <div className="mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl font-700 text-foreground mb-1">Đăng nhập</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">Chào mừng trở lại. Đăng nhập bằng tài khoản FADO SSO.</p>
          </div>

          {loginError && (
            <div className="flex items-start gap-3 p-4 rounded-2xl mb-5 fade-in"
              style={{ background: 'rgba(198,40,40,0.1)', border: '1px solid rgba(198,40,40,0.3)' }}>
              <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{loginError}</p>
            </div>
          )}

          {/* Đăng nhập SSO — luồng chính duy nhất */}
          <a
            href={`/api/auth/sso/start?redirect=${encodeURIComponent(getRedirectTarget())}`}
            className="w-full h-11 rounded-xl btn-accent font-600 text-sm flex items-center justify-center gap-2"
          >
            <Shield size={16} />
            Đăng nhập với FADO SSO
          </a>

          {emergencyMode && (
            <>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 mt-6">
            <div>
              <label className="block text-sm font-500 text-foreground mb-1.5">
                Email đăng nhập
              </label>
              <input
                type="email"
                autoComplete="email"
                placeholder="your.email@company.vn"
                className={`w-full h-11 px-4 rounded-xl text-sm text-foreground placeholder:text-ink-faint border transition-all focus:outline-none focus:border-indigo/60 focus:ring-1 focus:ring-indigo/30 ${errors.email ? 'border-red-500/60 bg-red-500/05' : 'border-line bg-surface-2'}`}
                {...register('email', {
                  required: 'Vui lòng nhập email',
                  pattern: { value: /^\S+@\S+\.\S+$/, message: 'Email không hợp lệ' },
                })}
              />
              {errors.email && (
                <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                  <AlertCircle size={12} />
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-500 text-foreground">Mật khẩu</label>
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-xs text-indigo hover:text-indigo/80 transition-colors"
                >
                  Quên mật khẩu?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  className={`w-full h-11 px-4 pr-11 rounded-xl text-sm text-foreground placeholder:text-ink-faint border transition-all focus:outline-none focus:border-indigo/60 focus:ring-1 focus:ring-indigo/30 ${errors.password ? 'border-red-500/60 bg-red-500/05' : 'border-line bg-surface-2'}`}
                  {...register('password', { required: 'Vui lòng nhập mật khẩu' })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                  <AlertCircle size={12} />
                  {errors.password.message}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                id="remember"
                className="w-4 h-4 rounded border-line-strong accent-indigo"
                {...register('remember')}
              />
              <label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">
                Ghi nhớ đăng nhập
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 rounded-xl btn-accent font-600 text-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Đang xác thực...
                </>
              ) : (
                <>
                  <Shield size={16} />
                  Đăng Nhập
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="h-px flex-1 bg-hover-strong" />
            <span className="text-xs text-muted-foreground">hoặc</span>
            <div className="h-px flex-1 bg-hover-strong" />
          </div>

          {/* Telegram login */}
          <div className="flex flex-col items-center gap-2">
            <TelegramLoginButton onAuth={handleTelegramAuth} size="large" />
            {tgLoading && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Đang xác thực Telegram...
              </p>
            )}
            <p className="text-2xs text-muted-foreground/60 text-center">
              Đăng nhập nhanh bằng tài khoản Telegram đã liên kết
            </p>
          </div>
            </>
          )}

          {/* Forgot Password Modal */}
          <ForgotPasswordModal
            isOpen={showForgotPassword}
            onClose={() => setShowForgotPassword(false)}
          />

          {/* 2FA OTP Modal */}
          {twofa && (
            <Login2FAModal
              email={twofa.email}
              password={twofa.password}
              emailMasked={twofa.emailMasked}
              channel={twofa.channel}
              onCancel={() => setTwofa(null)}
              onSuccess={(user) => { setTwofa(null); completeLogin(user); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
