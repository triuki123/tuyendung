'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import BrandIcon from '@/components/ui/BrandIcon';
import BrandLockup from '@/components/ui/BrandLockup';
import {
  LayoutDashboard,
  Package,
  Ticket,
  ClipboardList,
  History,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Shield,
  X,
  DoorOpen,
  Building,
  Search,
  CheckSquare,
  UserCog,
  FileText,
  ClipboardPen,
  Megaphone,
  UsersRound,
  Timer,
  Network,
  PenLine,
  Palette,
  SlidersHorizontal,
  Coffee,
  QrCode,
  Bell,
  Inbox,
  IdCard,
  Send,
  Receipt,
  Target,
  Factory,
  Scale,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { shouldShowNavigationModule } from '@/lib/rolePolicy';
import { canAccess } from '@/lib/permissions';
import { realtimeClient } from '@/lib/realtime-client';
import { RealtimeEvent } from '@/lib/realtime-server';
import { useToast } from '@/context/ToastContext';
import type { SidebarCounts } from '@/app/api/sidebar-counts/route';

export type BadgeColor = 'red' | 'amber' | 'indigo' | 'teal' | 'emerald';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
  badgeColor?: BadgeColor;
  roles?: string[];
}

const NAV_SCROLL_KEY = 'assetflow_sidebar_nav_scroll_top';

export const NAV_ITEMS: NavItem[] = [
  { id: 'nav-dashboard',        label: 'Dashboard',            href: '/dashboard',              icon: <LayoutDashboard size={20} />, roles: ['super_admin', 'admin'] },
  { id: 'nav-action-center',    label: 'Cần Xử Lý',           href: '/can-toi-xu-ly',          icon: <Inbox size={20} />,           badgeColor: 'indigo' },
  { id: 'nav-assets',           label: 'Quản lý Tài sản',      href: '/asset-management',       icon: <Package size={20} />,         roles: ['super_admin', 'admin'] },
  { id: 'nav-organization',     label: 'Tổ Chức',              href: '/organization',           icon: <Building size={20} />,        roles: ['super_admin', 'admin'] },
  { id: 'nav-duyet-yeu-cau',    label: 'Duyệt Yêu Cầu',       href: '/duyet-yeu-cau',          icon: <CheckSquare size={20} />,     roles: ['super_admin', 'admin'], badgeColor: 'amber' },
  { id: 'nav-tickets',          label: 'Ticket Hỗ Trợ',        href: '/tickets',                icon: <Ticket size={20} />,          badgeColor: 'red' },
  { id: 'nav-tasks',            label: 'Công Việc',            href: '/tasks',                  icon: <ClipboardList size={20} />,   roles: ['super_admin', 'admin'], badgeColor: 'indigo' },
  { id: 'nav-room-bookings',    label: 'Đặt Phòng Họp',        href: '/room-bookings',          icon: <DoorOpen size={20} />,        badgeColor: 'teal' },
  { id: 'nav-recruitment-order',label: 'Yêu Cầu Tuyển Dụng',  href: '/yeu-cau-tuyen-dung',     icon: <Megaphone size={20} />,       roles: ['super_admin', 'admin', 'manager'], badgeColor: 'amber' },
  { id: 'nav-design-requests', label: 'Yêu Cầu Thiết Kế',      href: '/yeu-cau-thiet-ke',       icon: <Palette size={20} />,         roles: ['super_admin', 'admin', 'manager'], badgeColor: 'indigo' },
  { id: 'nav-cham-cong',        label: 'Dữ Liệu Chấm Công',   href: '/tra-cuu/du-lieu-cong',   icon: <Timer size={20} /> },
  { id: 'nav-tra-cuu',          label: 'Tra Cứu',              href: '/tra-cuu',                icon: <Search size={20} /> },
  { id: 'nav-notifications',    label: 'Trung Tâm Thông Báo',  href: '/thong-bao',              icon: <Bell size={20} />,            badgeColor: 'red' },
  { id: 'nav-my-hr',            label: 'Hợp đồng & Hồ sơ',    href: '/ho-so-cua-toi',          icon: <FileText size={20} />,        badgeColor: 'red' },
  { id: 'nav-solace',           label: 'Quán Solace',          href: '/solace',                 icon: <Coffee size={20} /> },
  { id: 'nav-warehouse',        label: 'Kho / Xưởng',          href: '/kho-xuong',              icon: <Factory size={20} /> },
  { id: 'nav-email-signature',  label: 'Chữ Ký Email',         href: '/email-signature',        icon: <PenLine size={20} /> },
  { id: 'nav-qr',               label: 'Tạo Mã QR',            href: '/tao-ma-qr',              icon: <QrCode size={20} /> },
  { id: 'nav-the-dien-tu',      label: 'Hồ Sơ Năng Lực',       href: '/the-dien-tu',            icon: <IdCard size={20} /> },
  { id: 'nav-email-center',     label: 'Trung Tâm Email',      href: '/trung-tam-email',        icon: <Send size={20} /> },
  { id: 'nav-expense',          label: 'Chi Phí',              href: '/chi-phi',                icon: <Receipt size={20} />,         badgeColor: 'amber' },
  { id: 'nav-kpi',              label: 'KPI & Đánh Giá',       href: '/kpi',                    icon: <Target size={20} />,          badgeColor: 'indigo' },
  { id: 'nav-legal',            label: 'Pháp Chế',             href: '/phap-che',               icon: <Scale size={20} /> },
  { id: 'nav-history',          label: 'Lịch Sử',              href: '/history',                icon: <History size={20} />,         roles: ['super_admin', 'admin'] },
  { id: 'nav-hr',               label: 'Quản Lý Hồ Sơ',       href: '/nhan-su',                icon: <UserCog size={20} />,         roles: ['super_admin', 'admin'], badgeColor: 'amber' },
  { id: 'nav-hr-resources',     label: 'Tuyển Dụng',           href: '/nguon-nhan-luc',         icon: <UsersRound size={20} />,      roles: ['super_admin', 'admin'], badgeColor: 'emerald' },
  { id: 'nav-forms',            label: 'Biểu Mẫu',             href: '/bieu-mau',               icon: <ClipboardPen size={20} />,    roles: ['super_admin', 'admin'] },
  { id: 'nav-users',            label: 'Người Dùng',           href: '/users',                  icon: <Users size={20} />,           roles: ['super_admin', 'admin'], badgeColor: 'red' },
  { id: 'nav-system-config',    label: 'Cấu Hình Hệ Thống',    href: '/cau-hinh-he-thong',      icon: <SlidersHorizontal size={20} />, roles: ['super_admin'] },
  { id: 'nav-settings',         label: 'Cài Đặt',              href: '/settings',               icon: <Settings size={20} /> },
];

/** Gom NAV_ITEMS thành 4 nhóm (dùng chung cho Sidebar + màn Menu mobile). */
export const NAV_GROUPS: { label: string; ids: string[] }[] = [
  { label: 'Tổng Quan', ids: ['nav-dashboard', 'nav-action-center', 'nav-notifications', 'nav-tra-cuu', 'nav-history'] },
  { label: 'Công Việc', ids: ['nav-tickets', 'nav-ticket-config', 'nav-tasks', 'nav-tasks-analytics', 'nav-room-bookings', 'nav-duyet-yeu-cau', 'nav-expense', 'nav-kpi'] },
  { label: 'Nhân Sự', ids: ['nav-recruitment-order', 'nav-design-requests', 'nav-cham-cong', 'nav-my-hr', 'nav-the-dien-tu', 'nav-hr', 'nav-hr-resources'] },
  { label: 'Tiện Ích', ids: ['nav-solace', 'nav-warehouse', 'nav-email-signature', 'nav-qr', 'nav-forms'] },
  { label: 'Hệ Thống', ids: ['nav-assets', 'nav-organization', 'nav-legal', 'nav-email-center', 'nav-users', 'nav-system-config', 'nav-settings'] },
];

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  activePath: string;
  currentUser: { id: string; name: string; role: string; roleLabel: string; avatar?: string; module_permissions?: unknown } | null;
  onToggleCollapse: () => void;
  onMobileClose: () => void;
  /** Kiểu "switcher": chỉ hiện 1 khu vực (nhãn NAV_GROUPS). Bỏ trống = hiện tất cả (mặc định). */
  onlyGroup?: string;
}

export default function Sidebar({
  collapsed,
  mobileOpen,
  activePath,
  currentUser,
  onToggleCollapse,
  onMobileClose,
  onlyGroup,
}: SidebarProps) {
  const recruitmentFocus = process.env.NEXT_PUBLIC_RECRUITMENT_FOCUS === 'true';
  const router = useRouter();
  const navScrollRef = useRef<HTMLElement>(null);
  const navScrollPosRef = useRef(0);

  const [isDesktop, setIsDesktop] = useState(true);
  const [sidebarCounts, setSidebarCounts] = useState<SidebarCounts>({
    duyetYeuCau: 0, tickets: 0, tasks: 0, roomBookings: 0, onboarding: 0, offboarding: 0, requisitionsPendingApproval: 0, hrPending: 0, users: 0, recruitment: 0, myContracts: 0, hrDocReplace: 0, notifications: 0,
  });
  const [userModulePermissions, setUserModulePermissions] = useState(
    (currentUser as any)?.module_permissions
  );
  const toast = useToast();
  const fetchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Update local module permissions when currentUser changes
  useEffect(() => {
    setUserModulePermissions((currentUser as any)?.module_permissions);
  }, [currentUser?.id]);

  // Listen for avatar updates to refresh sidebar display
  useEffect(() => {
    const handleAvatarUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.userId === currentUser?.id) {
        const updatedUser = { ...currentUser, avatar: customEvent.detail.avatarUrl };
        localStorage.setItem('currentUser', JSON.stringify(updatedUser));
        localStorage.setItem('assetflow_auth', JSON.stringify(updatedUser));
      }
    };

    window.addEventListener('userAvatarUpdated', handleAvatarUpdate);
    return () => {
      window.removeEventListener('userAvatarUpdated', handleAvatarUpdate);
    };
  }, [currentUser?.id]);

  // Subscribe to user permission changes for real-time sidebar updates
  useEffect(() => {
    if (!currentUser) return;

    const subscriberId = realtimeClient.subscribe(
      ['users'],
      (event: RealtimeEvent) => {
        if (event.entity === 'users' && event.entityId === currentUser.id) {
          // Update menu when user permissions change
          if (event.data?.module_permissions) {
            const changed = JSON.stringify(userModulePermissions ?? null) !== JSON.stringify(event.data.module_permissions ?? null);
            setUserModulePermissions(event.data.module_permissions);
            // Also update localStorage
            const updatedUser = {
              ...currentUser,
              module_permissions: event.data.module_permissions,
            };
            localStorage.setItem('assetflow_auth', JSON.stringify(updatedUser));
            if (changed) {
              try { toast.success('Phân quyền của bạn vừa được cập nhật — menu đã thay đổi.'); } catch { /* noop */ }
            }
          }
        }
      }
    );

    return () => {
      realtimeClient.unsubscribe(subscriberId);
    };
  }, [currentUser]);

  // Fetch sidebar badge counts — chạy lần đầu + mỗi 60s
  useEffect(() => {
    // Badge aggregation queries every operational module and is not useful in
    // the recruitment workspace. It also avoids touching optional HR tables.
    if (recruitmentFocus) return;

    const load = async () => {
      if (!currentUser) return;
      try {
        const res = await fetch('/api/sidebar-counts');
        if (!res.ok) return;
        const { counts } = await res.json();
        setSidebarCounts(counts);
      } catch {
        // fail silently — badge counts are non-critical
      }
    };

    load();
    fetchIntervalRef.current = setInterval(load, 60_000);
    return () => {
      if (fetchIntervalRef.current) clearInterval(fetchIntervalRef.current);
    };
  }, [currentUser?.id]);

  const effectiveCollapsed = isDesktop ? collapsed : false;

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Bỏ qua lỗi mạng — vẫn rời trang.
    }
    router.push('/sign-up-login-screen');
  };

  // Map sidebar counts → badge per nav item
  const BADGE_MAP: Record<string, number> = {
    'nav-duyet-yeu-cau':    sidebarCounts.duyetYeuCau,
    'nav-tickets':           sidebarCounts.tickets,
    'nav-tasks':             sidebarCounts.tasks,
    'nav-room-bookings':     sidebarCounts.roomBookings,
    'nav-hr-resources':      sidebarCounts.hrPending,
    'nav-users':             sidebarCounts.users,
    'nav-recruitment-order': sidebarCounts.recruitment,
    'nav-my-hr':             sidebarCounts.myContracts,
    'nav-hr':                sidebarCounts.hrDocReplace,
    'nav-notifications':     sidebarCounts.notifications,
  };

  const itemsWithDynamicBadge = NAV_ITEMS.map(item => {
    const count = BADGE_MAP[item.id] ?? 0;
    return count > 0 ? { ...item, badge: count } : item;
  });

  // TẦNG 1: Module Visibility Logic
  // Check module_permissions first (Option A), fall back to roles
  const visibleItems = itemsWithDynamicBadge.filter(item => {
    if (!currentUser) return false;

    // Kho / Xưởng: RBAC NGHIÊM NGẶT (tick mới thấy) nay nằm trong
    // STRICT_RBAC_UNIT_IDS của rolePolicy → dùng chung một luật với AppLayout,
    // Command Palette, App Launcher. Đừng chép lại nhánh riêng ở đây nữa.

    // Pháp Chế: RBAC nghiêm ngặt như Kho/Xưởng — người không liên quan không thấy menu.
    if (item.id === 'nav-legal') {
      return canAccess(userModulePermissions as any, 'legal', 'view');
    }

    // Use userModulePermissions which updates in real-time
    return shouldShowNavigationModule(currentUser.role, item.id, userModulePermissions);
  });

  const inGroup = (label: string) => (i: NavItem) => (NAV_GROUPS.find(g => g.label === label)?.ids ?? []).includes(i.id);
  // Kiểu switcher: chỉ giữ khu vực đang chọn; các nhóm khác để rỗng.
  const groupOn = (label: string) => !onlyGroup || onlyGroup === label;
  const overviewItems = groupOn('Tổng Quan') ? visibleItems.filter(inGroup('Tổng Quan')) : [];
  const workItems = groupOn('Công Việc') ? visibleItems.filter(inGroup('Công Việc')) : [];
  const hrItems = groupOn('Nhân Sự') ? visibleItems.filter(inGroup('Nhân Sự')) : [];
  const serviceItems = groupOn('Tiện Ích') ? visibleItems.filter(inGroup('Tiện Ích')) : [];
  const systemItems = groupOn('Hệ Thống') ? visibleItems.filter(inGroup('Hệ Thống')) : [];

  const visibleNavSignature = visibleItems.map(item => item.id).join('|');

  const persistNavScroll = () => {
    const next = navScrollRef.current?.scrollTop ?? navScrollPosRef.current;
    navScrollPosRef.current = next;
    try {
      sessionStorage.setItem(NAV_SCROLL_KEY, String(next));
    } catch {
      // ignore
    }
  };

  // Restore only after permissions load and the navigation items exist in the DOM.
  useLayoutEffect(() => {
    if (!visibleNavSignature) return;

    let next = navScrollPosRef.current;
    try {
      const saved = sessionStorage.getItem(NAV_SCROLL_KEY);
      const parsed = saved ? Number(saved) : 0;
      if (Number.isFinite(parsed)) next = parsed;
    } catch {
      // ignore
    }
    navScrollPosRef.current = next;

    const restore = () => {
      if (navScrollRef.current) navScrollRef.current.scrollTop = next;
    };
    restore();
    const frame = window.requestAnimationFrame(restore);
    return () => window.cancelAnimationFrame(frame);
  }, [activePath, mobileOpen, effectiveCollapsed, visibleNavSignature]);

  const handleNavNavigate = () => {
    persistNavScroll();
    if (!isDesktop) onMobileClose();
  };

  const sidebarBase = `fixed top-0 left-0 h-full z-50 flex flex-col border-r border-line-subtle sidebar-transition`;
  // On mobile, full-width drawer up to 280px. On desktop, 72/260 based on collapsed.
  const sidebarWidth = effectiveCollapsed
    ? 'w-[86vw] max-w-[280px] lg:w-[72px]'
    : 'w-[86vw] max-w-[280px] lg:w-[260px]';
  const mobileClass = mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0';

  return (
    <aside
      className={`${sidebarBase} ${sidebarWidth} ${mobileClass}`}
      style={{ background: 'var(--primary)', boxShadow: '4px 0 24px rgba(0,0,0,0.4)' }}
    >
      {/* Logo area */}
      <div className={`flex items-center h-14 sm:h-16 border-b border-line-subtle px-4 ${effectiveCollapsed ? 'justify-center' : 'justify-between'}`}>
        <button
          onClick={() => {
            router.push('/dashboard');
            if (!isDesktop) onMobileClose();
          }}
          className={`flex items-center gap-2.5 hover:opacity-80 transition-opacity ${effectiveCollapsed ? 'justify-center' : ''}`}
          title="Quay về Dashboard"
        >
          {!effectiveCollapsed && <BrandLockup height={40} />}
          {effectiveCollapsed && <BrandIcon size={34} />}
        </button>

        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg btn-ghost text-muted-foreground shrink-0"
          title={effectiveCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
        >
          {effectiveCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <button
          onClick={onMobileClose}
          className="lg:hidden flex items-center justify-center w-7 h-7 rounded-lg btn-ghost text-muted-foreground"
        >
          <X size={14} />
        </button>
      </div>

      {/* Nav items */}
      <nav
        ref={navScrollRef}
        onScroll={persistNavScroll}
        className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5"
      >
        {overviewItems.length > 0 && (
          <>
            {!effectiveCollapsed && (
              <p className="text-2xs font-600 uppercase tracking-widest text-muted-foreground/60 px-3 pb-2 pt-1">
                Tổng Quan
              </p>
            )}
            {overviewItems.map(item => (
              <NavItemComponent key={item.id} item={item} collapsed={effectiveCollapsed} isActive={activePath === item.href} onNavigate={handleNavNavigate} />
            ))}
          </>
        )}

        {workItems.length > 0 && (
          <>
            {!effectiveCollapsed && (
              <p className="text-2xs font-600 uppercase tracking-widest text-muted-foreground/60 px-3 pb-2 pt-4">
                Công Việc
              </p>
            )}
            {effectiveCollapsed && <div className="h-2" />}
            {workItems.map(item => (
              <NavItemComponent key={item.id} item={item} collapsed={effectiveCollapsed} isActive={activePath === item.href} onNavigate={handleNavNavigate} />
            ))}
          </>
        )}

        {hrItems.length > 0 && (
          <>
            {!effectiveCollapsed && (
              <p className="text-2xs font-600 uppercase tracking-widest text-muted-foreground/60 px-3 pb-2 pt-4">
                Nhân Sự
              </p>
            )}
            {effectiveCollapsed && <div className="h-2" />}
            {hrItems.map(item => (
              <NavItemComponent key={item.id} item={item} collapsed={effectiveCollapsed} isActive={activePath === item.href} onNavigate={handleNavNavigate} />
            ))}
          </>
        )}

        {serviceItems.length > 0 && (
          <>
            {!effectiveCollapsed && (
              <p className="text-2xs font-600 uppercase tracking-widest text-muted-foreground/60 px-3 pb-2 pt-4">
                Tiện Ích
              </p>
            )}
            {effectiveCollapsed && <div className="h-2" />}
            {serviceItems.map(item => (
              <NavItemComponent key={item.id} item={item} collapsed={effectiveCollapsed} isActive={activePath === item.href} onNavigate={handleNavNavigate} />
            ))}
          </>
        )}

        {systemItems.length > 0 && (
          <>
            {!effectiveCollapsed && (
              <p className="text-2xs font-600 uppercase tracking-widest text-muted-foreground/60 px-3 pb-2 pt-4">
                Hệ Thống
              </p>
            )}
            {effectiveCollapsed && <div className="h-2" />}
            {systemItems.map(item => (
              <NavItemComponent key={item.id} item={item} collapsed={effectiveCollapsed} isActive={activePath === item.href} onNavigate={handleNavNavigate} />
            ))}
          </>
        )}
      </nav>

      {/* User info at bottom */}
      <div className="border-t border-line-subtle p-3">
        {currentUser && !effectiveCollapsed && (
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl mb-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 overflow-hidden relative"
              style={{ background: currentUser.avatar ? 'transparent' : 'linear-gradient(135deg, #6366f1, #C62828)' }}>
              {currentUser.avatar && currentUser.avatar.startsWith('/') ? (
                <Image
                  src={currentUser.avatar}
                  alt={currentUser.name}
                  width={32}
                  height={32}
                  unoptimized
                  className="w-full h-full object-cover"
                />
              ) : (
                currentUser.name?.charAt(0).toUpperCase() || 'U'
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-600 text-foreground truncate">{currentUser.name}</p>
              <div className="flex items-center gap-1">
                <Shield size={10} className="text-indigo shrink-0" />
                <p className="text-2xs text-muted-foreground truncate">{currentUser.roleLabel}</p>
              </div>
            </div>
          </div>
        )}
        {currentUser && effectiveCollapsed && (
          <div className="flex justify-center mb-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white overflow-hidden relative"
              style={{ background: currentUser.avatar ? 'transparent' : 'linear-gradient(135deg, #6366f1, #C62828)' }}>
              {currentUser.avatar && currentUser.avatar.startsWith('/') ? (
                <Image
                  src={currentUser.avatar}
                  alt={currentUser.name}
                  width={32}
                  height={32}
                  unoptimized
                  className="w-full h-full object-cover"
                />
              ) : (
                currentUser.name?.charAt(0).toUpperCase() || 'U'
              )}
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl nav-item-hover text-muted-foreground hover:text-red-400 group ${effectiveCollapsed ? 'justify-center' : ''}`}
          title="Đăng Xuất"
        >
          <LogOut size={18} className="shrink-0 group-hover:text-red-400 transition-colors" />
          {!effectiveCollapsed && <span className="text-sm font-500">Đăng Xuất</span>}
        </button>
      </div>
    </aside>
  );
}

// Badge kiểu logo FlowNodeIcon — 3 vòng cung xoay chậm quanh con số
const BADGE_STYLES: Record<BadgeColor, { arc1: string; arc2: string; arc3: string; text: string; glow: string }> = {
  red:     { arc1: '#dc2626', arc2: '#ef4444', arc3: '#fca5a5', text: '#fca5a5', glow: 'rgba(239,68,68,0.6)' },
  amber:   { arc1: '#d97706', arc2: '#f59e0b', arc3: '#fcd34d', text: '#fcd34d', glow: 'rgba(245,158,11,0.6)' },
  indigo:  { arc1: '#6366f1', arc2: '#818cf8', arc3: '#c4b5fd', text: '#a5b4fc', glow: 'rgba(99,102,241,0.6)' },
  teal:    { arc1: '#0d9488', arc2: '#2dd4bf', arc3: '#99f6e4', text: '#5eead4', glow: 'rgba(20,184,166,0.6)' },
  emerald: { arc1: '#059669', arc2: '#34d399', arc3: '#a7f3d0', text: '#6ee7b7', glow: 'rgba(52,211,153,0.6)' },
};

/** Vòng cung xoay quanh số — cùng geometry với FlowNodeIcon, tái dùng .logo-spin-slow (viewBox 64, origin 32) */
function NavBadge({ count, color, collapsed }: { count: number; color: BadgeColor; collapsed: boolean }) {
  const s = BADGE_STYLES[color];
  const label = count > 99 ? '99+' : String(count);
  // Số dài hơn → badge to hơn một chút để giữ độ rõ
  const size = collapsed ? (label.length >= 2 ? 20 : 18) : (label.length >= 2 ? 25 : 22);

  const badge = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, filter: `drop-shadow(0 0 3px ${s.glow})` }}
    >
      {/* 3 vòng cung + mũi tên — xoay chậm như logo */}
      <g className="logo-spin-slow">
        <path d="M32 8 a24 24 0 0 1 20.8 12" fill="none" stroke={s.arc1} strokeWidth="5.5" strokeLinecap="round" />
        <path d="M56.28 26.06 L48.22 20.9 L55.85 16.5 Z" fill={s.arc1} />
        <path d="M52.8 44 a24 24 0 0 1 -20.8 12" fill="none" stroke={s.arc2} strokeWidth="5.5" strokeLinecap="round" />
        <path d="M25 56 L33.5 51.6 L33.5 60.4 Z" fill={s.arc2} />
        <path d="M11.2 44 a24 24 0 0 1 0 -24" fill="none" stroke={s.arc3} strokeWidth="5.5" strokeLinecap="round" />
        <path d="M14.72 13.94 L14.28 23.5 L6.65 19.1 Z" fill={s.arc3} />
      </g>
      {/* Số ở giữa — đứng yên */}
      <text
        x="32"
        y="33"
        textAnchor="middle"
        dominantBaseline="central"
        fill={s.text}
        style={{ fill: `var(--nav-badge-${color})` }}
        fontSize={label.length >= 3 ? 22 : label.length === 2 ? 26 : 30}
        fontWeight="700"
        fontFamily="inherit"
      >
        {label}
      </text>
    </svg>
  );

  if (collapsed) {
    // Collapsed: badge nhỏ ở góc trên phải icon
    return (
      <span
        className="absolute flex items-center justify-center rounded-full"
        style={{ top: -3, right: -3, background: '#0f172a', padding: 1 }}
      >
        {badge}
      </span>
    );
  }

  // Expanded: badge cuối dòng nav item
  return <span className="shrink-0 flex items-center">{badge}</span>;
}

function NavItemComponent({
  item,
  collapsed,
  isActive,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  isActive: boolean;
  onNavigate?: () => void;
}) {
  const hasBadge = (item.badge ?? 0) > 0;
  const badgeColor = item.badgeColor ?? 'red';

  return (
    <Link
      href={item.href}
      onClick={() => onNavigate?.()}
      title={collapsed ? item.label : undefined}
      className={`
        flex items-center gap-3 px-3 py-2.5 rounded-xl nav-item-hover group relative
        ${isActive ? 'nav-item-active' : 'text-muted-foreground'}
        ${collapsed ? 'justify-center' : ''}
      `}
    >
      <span className={`relative shrink-0 transition-colors ${isActive ? 'text-indigo' : 'group-hover:text-slate-200'}`}>
        {item.icon}
        {hasBadge && collapsed && (
          <NavBadge count={item.badge!} color={badgeColor} collapsed />
        )}
      </span>

      {!collapsed && (
        <>
          <span className={`text-sm font-500 flex-1 truncate ${isActive ? 'text-indigo' : ''}`}>
            {item.label}
          </span>
          {hasBadge && (
            <NavBadge count={item.badge!} color={badgeColor} collapsed={false} />
          )}
        </>
      )}
    </Link>
  );
}
