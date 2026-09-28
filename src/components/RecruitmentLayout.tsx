'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BriefcaseBusiness, CalendarDays, FileText, LayoutDashboard, Loader2, Mail, Plus, UsersRound, Sparkles } from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { installCompanyFetchInterceptor } from '@/lib/activeCompany';
import type { MockUser } from '@/lib/mockData';
import type { CvItem } from '@/lib/api/onboardingApi';
import { getRecruitmentIdentity } from '@/lib/recruitmentIdentity';
import '@/styles/recruitment-apple.css';

const CandidateAddModal = dynamic(
  () => import('@/app/nguon-nhan-luc/kho-ung-vien/components/CandidateAddModal'),
  { ssr: false },
);

const NAV = [
  { href: '/nguon-nhan-luc/tinh-hinh-tuyen-dung', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/nguon-nhan-luc/yeu-cau-tuyen-dung', label: 'Yêu cầu tuyển', icon: BriefcaseBusiness },
  { href: '/nguon-nhan-luc/lich-phong-van', label: 'Lịch PV', icon: CalendarDays },
  { href: '/nguon-nhan-luc/kho-ung-vien', label: 'Kho ứng viên', icon: UsersRound },
  { href: '/nguon-nhan-luc/kho-mo-ta-cong-viec', label: 'Kho JD', icon: FileText },
  { href: '/nguon-nhan-luc/email-tuyen-dung', label: 'Mẫu email', icon: Mail },
  { href: '/nguon-nhan-luc/fdv', label: 'FDV', icon: Sparkles },
];

/** Lightweight shell for recruitment: no global search, QR/camera, badges or operational SSE. */
export default function RecruitmentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<MockUser | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authAttempt, setAuthAttempt] = useState(0);

  const notifyCandidateCreated = (cvs: CvItem[]) => {
    window.dispatchEvent(new CustomEvent<CvItem[]>('recruitment-cv-created', { detail: cvs }));
    setQuickAddOpen(false);
  };

  useEffect(() => {
    let active = true;
    setBootstrapping(true);
    setAuthError('');
    installCompanyFetchInterceptor();
    // PermissionGate reads localStorage once on mount, so rendering it before
    // this refresh can incorrectly deny a TA whose permissions just changed.
    getRecruitmentIdentity()
      .then((identity) => {
        if (!active) return;
        if (identity?.id) {
          localStorage.setItem('assetflow_auth', JSON.stringify(identity));
          localStorage.setItem('currentUser', JSON.stringify(identity));
          setUser(getCurrentUser());
        }
      })
      .catch((error) => {
        if (active) {
          setUser(null);
          setAuthError(error.name === 'AbortError' ? 'Kết nối mất quá lâu. Vui lòng thử lại.' : error.message);
        }
      })
      .finally(() => { if (active) setBootstrapping(false); });
    return () => { active = false; };
  }, [authAttempt]);

  if (authError) return (
    <div className="recruitment-shell flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-base font-600">Không thể mở Tuyển dụng</p>
      <p className="text-sm text-muted-foreground">{authError}</p>
      <button type="button" onClick={() => setAuthAttempt(attempt => attempt + 1)} className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-600 text-white">Thử lại</button>
      <a href={process.env.NEXT_PUBLIC_RECRUITMENT_FOCUS === 'true' ? `/api/auth/dev-login?redirect=${encodeURIComponent(pathname)}` : '/sign-up-login-screen'} className="text-sm text-blue-600">Đăng nhập lại</a>
    </div>
  );

  if (bootstrapping || !user) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="recruitment-shell recruitment-apple min-h-screen">
      <a href="#recruitment-content" className="recruitment-skip-link">Đến nội dung chính</a>
      <header className="recruitment-header sticky top-0 z-20 border-b border-line-subtle backdrop-blur-xl">
        <div className="recruitment-toolbar mx-auto flex min-h-16 max-w-screen-2xl items-center gap-3 px-4 sm:px-6">
          <Link href="/nguon-nhan-luc" className="recruitment-brand flex shrink-0 items-center gap-2 text-[15px] font-700 tracking-[-0.01em] text-foreground" aria-label="Về danh mục Tuyển dụng">
            <UsersRound className="h-5 w-5 text-blue-500" /> Tuyển dụng
          </Link>
          <nav className="recruitment-nav flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-2" aria-label="Điều hướng tuyển dụng">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-600 transition-all ${active ? 'bg-blue-500 text-white shadow-sm' : 'text-muted-foreground hover:bg-hover hover:text-foreground'}`}>
                <Icon className="h-3.5 w-3.5" /> {label}
              </Link>;
            })}
          </nav>
          <button type="button" onClick={() => setQuickAddOpen(true)} className="recruitment-create inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-blue-500 px-3 py-1.5 text-[13px] font-700 text-white shadow-sm transition-colors hover:bg-blue-600">
            <Plus className="h-3.5 w-3.5" /> Thêm CV
          </button>
          <span title={user.name} aria-label={`Tài khoản: ${user.name}`} className="recruitment-avatar">{user.name?.trim().charAt(0).toUpperCase()}</span>
        </div>
      </header>
      <main id="recruitment-content" tabIndex={-1} className="mx-auto w-full max-w-screen-2xl p-4 sm:p-6 lg:p-7 xl:p-8">{children}</main>
      {quickAddOpen && <CandidateAddModal onClose={() => setQuickAddOpen(false)} onCreated={(cv) => notifyCandidateCreated([cv])} onCreatedMany={notifyCandidateCreated} />}
    </div>
  );
}
