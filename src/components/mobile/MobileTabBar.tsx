'use client';

import React from 'react';
import Link from 'next/link';
import { Home, Fingerprint, CheckSquare, ClipboardList, LayoutGrid, User } from 'lucide-react';

interface Tab {
  label: string;
  href?: string;
  icon: React.ReactNode;
  match?: string;
  onClick?: () => void;
}

interface MobileTabBarProps {
  activePath: string;
  role?: string;
}

/**
 * Thanh điều hướng dưới đáy kiểu app — CHỈ hiện trên mobile (<lg). 5 tab:
 * Trang chủ · Chấm công · (Duyệt | Công việc) · Menu · Tài khoản.
 * Tab thứ 3 theo vai trò: quản lý/admin → Duyệt yêu cầu; người dùng → Công việc.
 * Mọi module khác nằm trong tab Menu (lọc theo quyền). Desktop dùng sidebar như cũ.
 */
export default function MobileTabBar({ activePath, role }: MobileTabBarProps) {
  const isApprover = role === 'super_admin' || role === 'admin' || role === 'manager';

  const tabs: Tab[] = [
    { label: 'Trang chủ', href: '/dashboard', match: '/dashboard', icon: <Home size={18} /> },
    { label: 'Chấm công', href: '/tra-cuu/du-lieu-cong', match: '/tra-cuu/du-lieu-cong', icon: <Fingerprint size={18} /> },
    isApprover
      ? { label: 'Duyệt', href: '/duyet-yeu-cau', match: '/duyet-yeu-cau', icon: <CheckSquare size={18} /> }
      : { label: 'Công việc', href: '/tasks', match: '/tasks', icon: <ClipboardList size={18} /> },
    { label: 'Menu', href: '/menu', match: '/menu', icon: <LayoutGrid size={18} /> },
    { label: 'Tài khoản', href: '/tai-khoan', match: '/tai-khoan', icon: <User size={18} /> },
  ];

  const bestMatch = tabs
    .filter(t => t.match && activePath.startsWith(t.match))
    .sort((a, b) => (b.match!.length - a.match!.length))[0]?.match;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 lg:hidden border-t border-white/10"
      style={{ background: 'var(--card)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Điều hướng chính"
    >
      <div className="flex items-stretch h-[46px]">
        {tabs.map((tab, i) => {
          const active = !!tab.match && tab.match === bestMatch;
          const cls = `flex-1 flex flex-col items-center justify-center gap-0.5 text-[9px] font-500 transition-colors ${
            active ? 'text-indigo-400' : 'text-muted-foreground'
          }`;
          const inner = (
            <>
              <span className={active ? 'scale-105 transition-transform' : 'transition-transform'}>{tab.icon}</span>
              {tab.label}
            </>
          );
          return tab.href ? (
            <Link key={i} href={tab.href} className={cls} aria-current={active ? 'page' : undefined}>
              {inner}
            </Link>
          ) : (
            <button key={i} type="button" onClick={tab.onClick} className={cls}>
              {inner}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
