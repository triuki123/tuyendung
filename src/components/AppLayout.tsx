'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Sidebar, { NAV_ITEMS, NAV_GROUPS } from './Sidebar';
import Topbar from './Topbar';
import CommandPalette from './CommandPalette';
import AppLauncher from './nav/AppLauncher';
import AreaTabs from './nav/AreaTabs';
import { useUiMode } from '@/lib/ui/uiMode';
import AppFooter from './AppFooter';
import MobileTabBar from './mobile/MobileTabBar';
import { parseQrPayload } from '@/lib/qr/qrPayload';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/authStore';
import { installCompanyFetchInterceptor } from '@/lib/activeCompany';
import { MockUser } from '@/lib/mockData';
import { useNotification } from '@/lib/useNotification';
import { realtimeClient } from '@/lib/realtime-client';
import { shouldShowNavigationModule } from '@/lib/rolePolicy';
import type { UserModulePermissions } from '@/lib/modules';
import { Loader2, ShieldAlert } from 'lucide-react';

// These operation tools pull camera/QR code and non-recruitment code into the
// client bundle. Keep them out of the initial recruitment workspace payload.
const QRScannerModal = dynamic(() => import('./QRScannerModal').then((m) => m.QRScannerModal), { ssr: false });
const RoomScanSheet = dynamic(() => import('./qr/RoomScanSheet'), { ssr: false });
const AssetScanSheet = dynamic(() => import('./qr/AssetScanSheet'), { ssr: false });
const BirthdayPopup = dynamic(() => import('./BirthdayPopup'), { ssr: false });
const PushPrompt = dynamic(() => import('./PushPrompt'), { ssr: false });

interface AppLayoutProps {
  children: React.ReactNode;
  activePath: string;
}

export default function AppLayout({ children, activePath }: AppLayoutProps) {
  const recruitmentFocus = process.env.NEXT_PUBLIC_RECRUITMENT_FOCUS === 'true';
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<MockUser | null>(null);
  const [isDesktop, setIsDesktop] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  // SSO: sau callback (302) localStorage có thể trống/khác người dù cookie phiên đã đúng.
  // Chặn render {children} tới khi đối chiếu xong với /api/auth/me, tránh child effect
  // ([]) đọc localStorage sai thời điểm (C1) hoặc render nhầm danh tính user cũ (C2).
  const [bootstrapping, setBootstrapping] = useState(true);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [scanRoomCode, setScanRoomCode] = useState<string | null>(null);
  const [scanAssetCode, setScanAssetCode] = useState<string | null>(null);
  const { showNotification } = useNotification();
  const router = useRouter();

  // Kiểu giao diện điều hướng (người dùng chọn trong Cài Đặt). Mặc định 'sidebar' = như cũ.
  const uiMode = useUiMode();
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [activeArea, setActiveArea] = useState('');
  const role = currentUser?.role;
  const perms = (currentUser as MockUser & { module_permissions?: UserModulePermissions })?.module_permissions;

  // Kiểu 'compact' → thu gọn sidebar mặc định; các kiểu khác về mặc định của kiểu đó.
  useEffect(() => { setSidebarCollapsed(uiMode === 'compact'); }, [uiMode]);

  // Handler trung tâm: hiểu payload QR (URL/token/JSON) và điều hướng đúng hành động.
  const handleQRScan = (data: string) => {
    // Vẫn phát sự kiện cho trang nào muốn tự bắt (vd đang ở form đặt phòng).
    window.dispatchEvent(new CustomEvent('qr-scan', { detail: { data } }));
    const parsed = parseQrPayload(data);
    if (parsed.kind === 'room' && parsed.code) {
      setScanRoomCode(parsed.code);
    } else if (parsed.kind === 'asset' && parsed.code) {
      setScanAssetCode(parsed.code);
    } else {
      showNotification('Mã QR không nhận dạng được', 'error');
    }
  };

  // Deep-link từ camera điện thoại: /q/room/CODE → redirect về app kèm ?scanRoom=CODE.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const room = params.get('scanRoom');
    const assetCode = params.get('scanAsset');
    if (room) setScanRoomCode(room);
    if (assetCode) setScanAssetCode(assetCode);
    if (room || assetCode) {
      params.delete('scanRoom');
      params.delete('scanAsset');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, []);

  useEffect(() => {
    // Đa Công Ty: chèn header công ty đang làm việc vào mọi request /api/ (chống rò rỉ chéo).
    installCompanyFetchInterceptor();
    setIsMounted(true);
    const user = getCurrentUser();
    setCurrentUser(user);
    // Luôn đối chiếu với phiên server (cookie) — không chỉ khi localStorage trống:
    //  - SSO callback (302) → localStorage trống dù cookie phiên đã có (C1).
    //  - localStorage còn lại của người dùng KHÁC (máy dùng chung) → id không khớp,
    //    phải ghi đè bằng danh tính thật của phiên đang đăng nhập, kể cả active_company_id (C2).
    // Đăng nhập bằng mật khẩu (LoginClient.completeLogin) đã tự ghi localStorage đúng user
    // trước khi điều hướng vào đây → id khớp → nhánh dưới chỉ đọc, không ghi lại (không tạo vòng lặp).
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        if (u?.id && typeof window !== 'undefined' && (!user || user.id !== u.id)) {
          localStorage.setItem('assetflow_auth', JSON.stringify(u));
          localStorage.setItem('currentUser', JSON.stringify(u));
          // "đăng nhập mới luôn bắt đầu ở công ty CHÍNH" — đồng nhất với completeLogin (mật khẩu).
          localStorage.removeItem('active_company_id');
          setCurrentUser(getCurrentUser());
        }
      })
      .catch(() => { /* chưa đăng nhập / lỗi mạng — middleware đã lo redirect trang */ })
      .finally(() => setBootstrapping(false));
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [isMounted]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [mobileOpen]);

  // Auto-close mobile drawer when switching to desktop
  useEffect(() => {
    if (isDesktop && mobileOpen) setMobileOpen(false);
  }, [isDesktop, mobileOpen]);

  // Ping "last_active" — cập nhật tối đa 1 lần/5 phút khi user đang dùng app
  useEffect(() => {
    if (!isMounted || !currentUser?.id) return;
    const ping = () => fetch('/api/ping', {
      method: 'POST',
      headers: { 'x-user-id': currentUser.id },
    }).catch(() => {});
    ping(); // lần đầu khi mount
    const onVisible = () => { if (document.visibilityState === 'visible') ping(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [isMounted, currentUser?.id]);

  // Refresh Phân Quyền + vai trò từ server khi vào app (và khi tab active lại).
  // localStorage chỉ lưu quyền lúc ĐĂNG NHẬP → super_admin đổi quyền xong, người đó chỉ cần
  // F5 là thấy ngay, không phải đăng xuất/đăng nhập lại. Sidebar đọc currentUser.module_permissions.
  useEffect(() => {
    if (!isMounted || !currentUser?.id) return;
    let cancelled = false;
    const syncPerms = async () => {
      try {
        const res = await fetch(`/api/users/${currentUser.id}`, { headers: { 'x-current-user-id': currentUser.id } });
        if (!res.ok) return;
        const fresh = await res.json();
        if (cancelled || !fresh?.id) return;
        const hasPerms = Object.prototype.hasOwnProperty.call(fresh, 'module_permissions');
        const stored = JSON.parse(localStorage.getItem('assetflow_auth') || '{}');
        const nextPerms = hasPerms ? fresh.module_permissions : stored.module_permissions;
        const nextRole = fresh.role ?? stored.role;
        const changed =
          JSON.stringify(stored.module_permissions ?? null) !== JSON.stringify(nextPerms ?? null) ||
          stored.role !== nextRole;
        if (changed) {
          localStorage.setItem('assetflow_auth', JSON.stringify({ ...stored, role: nextRole, module_permissions: nextPerms }));
          setCurrentUser(getCurrentUser());
        }
      } catch { /* im lặng — không chặn app nếu refresh quyền lỗi */ }
    };
    syncPerms();
    const onVisible = () => { if (document.visibilityState === 'visible') syncPerms(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible); };
  }, [isMounted, currentUser?.id]);

  // Initialize real-time connection
  useEffect(() => {
    if (!isMounted) return;

    // Start with all major entity types
    const entityTypes = recruitmentFocus ? [] : [
      'users',
      'assets',
      'tickets',
      'tasks',
      'room-bookings',
      'rooms',
      'organizations',
      'departments',
      'delete-requests',
      'notifications',
    ];

    // Recruitment screens subscribe to hr_cv_pool only when they actually need it.
    if (entityTypes.length) realtimeClient.connect(entityTypes);

    return () => {
      // Don't disconnect on unmount - keep connection alive
    };
  }, [isMounted]);

  const showDesktopSidebar = uiMode !== 'launcher';
  const desktopMargin = isDesktop && showDesktopSidebar ? (sidebarCollapsed ? '72px' : '260px') : '0px';
  const activeNavItem = NAV_ITEMS.find(item => item.href === activePath);
  // Kiểu switcher: khu vực đang chọn (mặc định theo trang hiện tại)
  const activeGroupLabel = NAV_GROUPS.find(g => g.ids.includes(activeNavItem?.id || ''))?.label || NAV_GROUPS[0]?.label || '';
  const currentArea = activeArea || activeGroupLabel;
  const canViewActiveModule = !activeNavItem || (
    !!currentUser &&
    shouldShowNavigationModule(
      currentUser.role,
      activeNavItem.id,
      (currentUser as MockUser & { module_permissions?: UserModulePermissions }).module_permissions
    )
  );

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--background)' }} suppressHydrationWarning>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden fade-in"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {showDesktopSidebar && (
        <Sidebar
          collapsed={sidebarCollapsed}
          mobileOpen={mobileOpen}
          activePath={activePath}
          currentUser={currentUser}
          onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
          onMobileClose={() => setMobileOpen(false)}
          onlyGroup={uiMode === 'switcher' ? currentArea : undefined}
        />
      )}

      <div
        className="flex-1 flex flex-col min-w-0 transition-all duration-300"
        style={{ marginLeft: desktopMargin }}
      >
        <Topbar
          currentUser={currentUser}
          onOpenQRScanner={() => setQrScannerOpen(true)}
          onOpenLauncher={uiMode === 'launcher' ? () => setLauncherOpen(true) : undefined}
        />
        {uiMode === 'switcher' && (
          <AreaTabs role={role} perms={perms} active={currentArea} onChange={setActiveArea} />
        )}
        <main className="flex-1 overflow-auto p-4 sm:p-5 lg:p-6 xl:p-8 2xl:p-10 flex flex-col">
          <div className="max-w-screen-2xl mx-auto w-full flex-1">
            {!isMounted || bootstrapping || !currentUser ? (
              <div className="flex justify-center py-24">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : canViewActiveModule ? (
              children
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4">
                  <ShieldAlert className="h-8 w-8 text-red-400" />
                </div>
                <h2 className="text-lg font-700 text-foreground">Bạn không có quyền truy cập</h2>
                <p className="mt-1.5 text-sm text-muted-foreground max-w-sm">
                  Module này chưa được cấp cho vai trò hoặc tài khoản của bạn.
                </p>
              </div>
            )}
          </div>
          <AppFooter />
          {/* Chừa chỗ cho thanh điều hướng dưới (mobile) để nội dung không bị che */}
          <div className="lg:hidden flex-shrink-0" style={{ height: 'calc(46px + env(safe-area-inset-bottom))' }} aria-hidden />
        </main>
      </div>

      {/* Thanh tab dưới đáy — chỉ mobile; 5 tab theo vai trò, module khác nằm trong tab Menu */}
      <MobileTabBar activePath={activePath} role={currentUser?.role} />

      {/* QR Scanner Modal - rendered at AppLayout level for proper z-index */}
      {!recruitmentFocus && <QRScannerModal
        isOpen={qrScannerOpen}
        onClose={() => setQrScannerOpen(false)}
        onScan={handleQRScan}
      />}

      {/* Bảng hành động phòng khi quét QR (check-in/out · đặt nhanh · trạng thái) */}
      {!recruitmentFocus && scanRoomCode && (
        <RoomScanSheet code={scanRoomCode} onClose={() => setScanRoomCode(null)} />
      )}

      {/* Lý lịch tài sản khi quét QR tài sản (mở thẳng, không cần vào trang quản lý) */}
      {!recruitmentFocus && scanAssetCode && (
        <AssetScanSheet code={scanAssetCode} onClose={() => setScanAssetCode(null)} />
      )}

      {/* Chúc mừng sinh nhật — popup khi đăng nhập (pháo giấy / gửi lời chúc) */}
      {!recruitmentFocus && <BirthdayPopup currentUser={currentUser} />}

      {/* Lời mời bật thông báo đẩy — tự hiện lần đầu mở app (chỉ khi chưa quyết định) */}
      {!recruitmentFocus && <PushPrompt userId={currentUser?.id} />}

      {/* Command Palette ⌘K — có ở MỌI kiểu giao diện */}
      <CommandPalette role={role} perms={perms} />

      {/* Lưới ứng dụng — kiểu launcher (hoặc khi bấm nút Ứng dụng) */}
      {launcherOpen && (
        <AppLauncher role={role} perms={perms} activePath={activePath} onClose={() => setLauncherOpen(false)} />
      )}
    </div>
  );
}
