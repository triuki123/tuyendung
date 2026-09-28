'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Coffee, Receipt, ChefHat, ClipboardList, BarChart3, Gift, Megaphone, LogOut, Loader2 } from 'lucide-react';
import { getCurrentUser, logout } from '@/lib/authStore';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import type { UserModulePermissions, PermissionAction } from '@/lib/modules';
import PosClient from '../../solace/pos/components/PosClient';
import QuanLyClient from '../../solace/quan-ly/components/QuanLyClient';
import BaoCaoClient from '../../solace/bao-cao/components/BaoCaoClient';
import MinigameAdminClient from '../../solace/minigame-quan-ly/MinigameAdminClient';
import MarketingClient from '../../solace/marketing/components/MarketingClient';
import BepClient from '../../solace/bep/components/BepClient';

type SectionKey = 'pos' | 'kds' | 'manage' | 'reports' | 'minigame' | 'marketing';

interface NavItem {
  key: SectionKey;
  label: string;
  icon: React.ReactNode;
  units: string[]; // hiện nếu admin hoặc có 'view' ở 1 trong các unit này
}

const NAV: NavItem[] = [
  { key: 'pos', label: 'Bán hàng', icon: <Receipt className="h-5 w-5" />, units: ['solace-pos'] },
  { key: 'kds', label: 'Bếp', icon: <ChefHat className="h-5 w-5" />, units: ['solace-pos'] },
  { key: 'manage', label: 'Quản lý', icon: <ClipboardList className="h-5 w-5" />, units: ['solace-menu', 'solace-inventory', 'solace-wallet', 'solace-debt', 'solace-cash'] },
  { key: 'reports', label: 'Báo cáo', icon: <BarChart3 className="h-5 w-5" />, units: ['solace-reports'] },
  { key: 'minigame', label: 'Minigame', icon: <Gift className="h-5 w-5" />, units: ['solace-minigame'] },
  { key: 'marketing', label: 'Marketing', icon: <Megaphone className="h-5 w-5" />, units: ['solace-marketing'] },
];

const LOGIN_PATH = '/sign-up-login-screen';

export default function SolacePosWorkspace() {
  const [perms, setPerms] = useState<UserModulePermissions | undefined>();
  const [role, setRole] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<SectionKey>('pos');

  useEffect(() => {
    const u = getCurrentUser() as { name?: string; role?: string; module_permissions?: UserModulePermissions } | null;
    if (!u) {
      // Có cookie phiên nhưng thiếu state client → quay lại đăng nhập rồi về đây.
      window.location.href = `${LOGIN_PATH}?redirect=${encodeURIComponent('/solace-pos')}`;
      return;
    }
    setPerms(u.module_permissions); setRole(u.role ?? ''); setName(u.name ?? ''); setLoading(false);
  }, []);

  const { canAccessInherited } = useUserPermissions(perms);
  // CHỈ super_admin thấy hết; admin/manager/user theo phân quyền unit solace-*.
  const isSuperAdmin = role === 'super_admin';

  const visible = useMemo(
    () => NAV.filter(n => isSuperAdmin || n.units.some(u => canAccessInherited(u, 'view' as PermissionAction))),
    [isSuperAdmin, canAccessInherited]
  );

  useEffect(() => {
    if (loading) return;
    if (visible.length && !visible.some(v => v.key === active)) setActive(visible[0].key);
  }, [loading, visible, active]);

  const handleLogout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* vẫn rời trang */ }
    logout();
    window.location.href = LOGIN_PATH;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center" style={{ background: 'var(--background)' }}>
        <Coffee className="h-10 w-10 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground">Tài khoản của bạn chưa được cấp quyền vận hành quán Solace.</p>
        <button onClick={handleLogout} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-600 border border-white/10 text-foreground hover:bg-white/5">
          <LogOut className="h-4 w-4" /> Đăng xuất
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      {/* Topbar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/5 px-4 py-2.5 backdrop-blur"
        style={{ background: 'color-mix(in srgb, var(--background) 85%, transparent)', paddingTop: 'calc(env(safe-area-inset-top) + 0.625rem)' }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0" style={{ background: 'linear-gradient(135deg, #8B4513, #C77B3B)' }}>
            <Coffee className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-700 text-foreground leading-tight">Quán Solace</p>
            <p className="text-2xs text-muted-foreground leading-tight">Vận hành quán</p>
          </div>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <span className="hidden sm:block text-xs text-muted-foreground truncate max-w-[160px]">{name}</span>
          <button onClick={handleLogout} title="Đăng xuất"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-600 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5">
            <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Đăng xuất</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Rail trái — desktop */}
        <nav className="hidden lg:flex flex-col gap-1 w-52 shrink-0 border-r border-white/5 p-3">
          {visible.map(n => (
            <button key={n.key} onClick={() => setActive(n.key)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-600 transition-colors ${
                active === n.key ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`}>
              {n.icon} {n.label}
            </button>
          ))}
        </nav>

        {/* Nội dung */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-5 lg:p-6 xl:p-8 max-w-screen-2xl mx-auto pb-24 lg:pb-8">
            {active === 'pos' && <PosClient embedded />}
            {active === 'kds' && <BepClient embedded />}
            {active === 'manage' && <QuanLyClient embedded />}
            {active === 'reports' && <BaoCaoClient embedded />}
            {active === 'minigame' && <MinigameAdminClient embedded />}
            {active === 'marketing' && <MarketingClient embedded />}
          </div>
        </main>
      </div>

      {/* Bottom bar — điện thoại / POS cầm tay */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 flex border-t border-white/10 backdrop-blur"
        style={{ background: 'color-mix(in srgb, var(--background) 92%, transparent)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {visible.map(n => (
          <button key={n.key} onClick={() => setActive(n.key)}
            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[3.5rem] py-2 text-2xs font-600 transition-colors active:bg-white/5 ${
              active === n.key ? 'text-indigo-400' : 'text-muted-foreground'
            }`}>
            {active === n.key && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-indigo-400" />}
            {n.icon} {n.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
