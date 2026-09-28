'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useClickOutside } from '@/hooks/useClickOutside';
import Image from 'next/image';
import { Search, ChevronDown, User, LogOut, Shield, QrCode, X, Loader2, HelpCircle, LayoutGrid } from 'lucide-react';
import { MockUser } from '@/lib/mockData';
import type { UserModulePermissions } from '@/lib/modules';
import { logout } from '@/lib/authStore';
import { useRouter, usePathname } from 'next/navigation';
import { getHelpUrl } from '@/lib/helpLinks';
import BrandIcon from '@/components/ui/BrandIcon';
import NotificationBell from '@/components/NotificationBell';
import LunarCalendarButton from '@/components/LunarCalendarButton';
import CompanySwitcher from '@/components/CompanySwitcher';
import { useNotification } from '@/lib/useNotification';
import { loadOrgData } from '@/lib/api/onboardingApi';
import QuickProfileModal from '@/app/users/components/QuickProfileModal';
import GlobalSearch from '@/components/search/GlobalSearch';

interface TopbarProps {
  currentUser: MockUser | null;
  onOpenQRScanner: () => void;
  /** Kiểu launcher: hiện nút "Ứng dụng" mở lưới module. Bỏ trống = không hiện. */
  onOpenLauncher?: () => void;
}

export default function Topbar({ currentUser, onOpenQRScanner, onOpenLauncher }: TopbarProps) {
  const recruitmentFocus = process.env.NEXT_PUBLIC_RECRUITMENT_FOCUS === 'true';
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [displayUser, setDisplayUser] = useState(currentUser);
  const [profileUser, setProfileUser] = useState<any | null>(null);
  const [profileCache, setProfileCache] = useState<any>({ companies: [], companyDepartmentsMap: {}, subDepartmentsByDepartmentId: {}, positions: {} });
  const [loadingProfile, setLoadingProfile] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const helpUrl = getHelpUrl(pathname);
  const userMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(userMenuRef, () => setUserMenuOpen(false), userMenuOpen);

  // Mở Sơ Yếu Lý Lịch của chính người đang đăng nhập (tải đầy đủ hồ sơ + danh mục tổ chức)
  const openProfile = async () => {
    if (!currentUser?.id) return;
    setUserMenuOpen(false);
    setLoadingProfile(true);
    try {
      const [userRes, org] = await Promise.all([
        fetch(`/api/users/${currentUser.id}`).then(r => (r.ok ? r.json() : null)),
        loadOrgData().catch(() => null),
      ]);
      if (org) {
        const companyDepartmentsMap: Record<string, { id: string; name: string }[]> = {};
        const subDepartmentsByDepartmentId: Record<string, { id: string; name: string }[]> = {};
        const positions: Record<string, { id: string; name: string }[]> = {};
        for (const d of org.departments) (companyDepartmentsMap[d.company_id] ||= []).push({ id: d.id, name: d.name });
        for (const s of org.subDepartments) (subDepartmentsByDepartmentId[s.department_id] ||= []).push({ id: s.id, name: s.name });
        for (const p of org.positions) (positions[p.company_id] ||= []).push({ id: p.id, name: p.name });
        setProfileCache({ companies: org.companies, companyDepartmentsMap, subDepartmentsByDepartmentId, positions });
      }
      setProfileUser(userRes || { ...currentUser });
    } catch {
      setProfileUser({ ...currentUser });
    } finally {
      setLoadingProfile(false);
    }
  };

  // Listen for avatar updates
  useEffect(() => {
    const handleAvatarUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (currentUser && customEvent.detail?.userId === currentUser.id) {
        setDisplayUser({
          ...currentUser,
          avatar: customEvent.detail.avatarUrl,
        });
      }
    };

    window.addEventListener('userAvatarUpdated', handleAvatarUpdate);
    return () => window.removeEventListener('userAvatarUpdated', handleAvatarUpdate);
  }, [currentUser?.id]);

  // Update when currentUser prop changes
  useEffect(() => {
    setDisplayUser(currentUser);
  }, [currentUser]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Bỏ qua lỗi mạng — vẫn dọn phía client và rời trang.
    }
    logout();
    router.push('/sign-up-login-screen');
  };

  const { showNotification } = useNotification();

  return (
    <>
    <header
      className="sticky top-0 z-30 min-h-[3.5rem] sm:min-h-[4rem] flex items-center px-3 sm:px-4 lg:px-6 gap-2 sm:gap-3 lg:gap-4 border-b border-line-subtle"
      style={{ background: 'var(--topbar-bg)', backdropFilter: 'blur(20px)', paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Logo with click to dashboard */}
      <button
        onClick={() => router.push('/dashboard')}
        className="flex items-center gap-2 p-1 rounded-lg hover:bg-white/05 transition-colors lg:hidden mr-1"
        title="Quay về Dashboard"
        aria-label="Logo - Quay về Dashboard"
      >
        <BrandIcon size={28} />
      </button>

      {/* Nút "Ứng dụng" — chỉ hiện ở kiểu giao diện Launcher (desktop) */}
      {onOpenLauncher && (
        <button
          onClick={onOpenLauncher}
          className="hidden lg:flex items-center gap-2 h-9 px-3 rounded-xl btn-ghost text-foreground mr-1"
          title="Mở lưới ứng dụng"
        >
          <LayoutGrid size={18} className="text-indigo-400" />
          <span className="text-sm font-600">Ứng dụng</span>
        </button>
      )}

      {/* Search — full bar on tablet+, icon trigger on mobile */}
      <div className="hidden sm:block flex-1 max-w-md">
        <GlobalSearch variant="desktop" />
      </div>

      {/* Mobile search trigger */}
      <button
        onClick={() => setMobileSearchOpen(true)}
        aria-label="Tìm kiếm"
        className="sm:hidden flex items-center justify-center w-9 h-9 rounded-xl btn-ghost ml-auto"
      >
        <Search size={18} />
      </button>

      <div className="flex items-center gap-1.5 sm:gap-2 sm:ml-auto">
        {/* Bộ chuyển Công Ty (Đa Công Ty) — tự ẩn nếu user chỉ 1 công ty */}
        {currentUser?.id && (
          <CompanySwitcher userId={currentUser.id} />
        )}

        {/* Notifications - Domain expiration alerts */}
        {currentUser?.id && !recruitmentFocus && (
          <NotificationBell
            userId={currentUser.id}
            role={currentUser.role}
            permissions={(currentUser as MockUser & { module_permissions?: UserModulePermissions }).module_permissions}
          />
        )}

        {/* QR Scanner Button */}
        {!recruitmentFocus && <button
          onClick={onOpenQRScanner}
          className="flex items-center justify-center w-9 h-9 rounded-xl btn-ghost text-muted-foreground hover:text-foreground transition-colors"
          title="Quét QR Code"
          aria-label="Quét QR Code"
        >
          <QrCode size={18} />
        </button>}

        {/* Lịch Âm - Dương (popover nhanh) */}
        {!recruitmentFocus && <LunarCalendarButton />}

        {/* Trợ giúp theo ngữ cảnh — mở đúng trang tài liệu của module đang xem (tab mới) */}
        <a
          href={helpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:flex items-center justify-center w-9 h-9 rounded-xl btn-ghost text-muted-foreground hover:text-foreground transition-colors"
          title="Trợ giúp cho trang này"
          aria-label="Trợ giúp cho trang này"
        >
          <HelpCircle size={18} />
        </a>

        {/* User menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(prev => !prev)}
            aria-label="Tài khoản"
            className="flex items-center gap-2 sm:gap-2.5 h-9 px-2 sm:px-3 rounded-xl btn-ghost"
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 overflow-hidden relative"
              style={{ background: displayUser?.avatar && displayUser.avatar.startsWith('/') ? 'transparent' : 'linear-gradient(135deg, #6366f1, #C62828)' }}
            >
              {displayUser?.avatar && displayUser.avatar.startsWith('/') ? (
                <Image
                  src={displayUser.avatar}
                  alt={displayUser.name || 'User'}
                  width={28}
                  height={28}
                  unoptimized
                  className="w-full h-full object-cover"
                />
              ) : (
                displayUser?.name?.charAt(0).toUpperCase() ?? 'U'
              )}
            </div>
            <div className="hidden md:block text-left max-w-[140px]">
              <p className="text-sm font-600 text-foreground leading-tight truncate">{displayUser?.name ?? 'Người dùng'}</p>
              <p className="text-2xs text-muted-foreground leading-tight truncate">{displayUser?.roleLabel ?? ''}</p>
            </div>
            <ChevronDown size={14} className="text-muted-foreground hidden md:block" />
          </button>

          {userMenuOpen && (
              <div
                className="absolute right-0 top-12 w-56 rounded-2xl border border-white/08 z-50 overflow-hidden modal-entrance"
                style={{ background: 'var(--card)', boxShadow: 'var(--shadow-modal)' }}
              >
                <div className="px-4 py-3 border-b border-white/05">
                  <p className="text-sm font-600 text-foreground truncate">{currentUser?.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{currentUser?.email}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Shield size={11} className="text-indigo" />
                    <span className="text-2xs text-indigo">{currentUser?.roleLabel}</span>
                  </div>
                </div>
                <div className="py-1">
                  <button onClick={openProfile} disabled={loadingProfile}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground hover:bg-white/05 hover:text-foreground transition-colors disabled:opacity-60">
                    {loadingProfile ? <Loader2 size={15} className="animate-spin" /> : <User size={15} />}
                    Hồ Sơ Cá Nhân
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <LogOut size={15} />
                    Đăng Xuất
                  </button>
                </div>
              </div>
          )}
        </div>
      </div>

      {/* Mobile search overlay */}
      {mobileSearchOpen && (
        <div
          className="sm:hidden fixed inset-0 z-50 flex items-start justify-center p-4 fade-in"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={() => setMobileSearchOpen(false)}
          onTouchEnd={() => setMobileSearchOpen(false)}
        >
          <div
            className="w-full max-w-lg mt-4 rounded-2xl border border-line p-3"
            style={{ background: 'var(--card)' }}
            onClick={e => e.stopPropagation()}
            onTouchEnd={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="flex-1">
                <GlobalSearch variant="mobile" autoFocus onNavigate={() => setMobileSearchOpen(false)} />
              </div>
              <button
                onClick={() => setMobileSearchOpen(false)}
                className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-foreground"
                aria-label="Đóng tìm kiếm"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

    </header>

    {/* Sơ Yếu Lý Lịch — render ra ngoài header để tránh stacking context của backdrop-filter */}
    {profileUser && typeof document !== 'undefined' && createPortal(
      <QuickProfileModal user={profileUser} dropdownCache={profileCache} onClose={() => setProfileUser(null)} />,
      document.body
    )}
    </>
  );
}
