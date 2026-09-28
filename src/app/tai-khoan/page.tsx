'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { User, Settings, HelpCircle, LogOut, Shield, ChevronRight } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import InstallAppButton from '@/components/mobile/InstallAppButton';
import { getCurrentUser, logout } from '@/lib/authStore';

interface Row {
  label: string;
  icon: React.ReactNode;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  danger?: boolean;
}

export default function TaiKhoanPage() {
  const router = useRouter();
  const [user, setUser] = useState<ReturnType<typeof getCurrentUser>>(null);

  useEffect(() => { setUser(getCurrentUser()); }, []);

  const handleLogout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* vẫn rời trang */ }
    logout();
    router.push('/sign-up-login-screen');
  };

  const avatar = user?.avatar && user.avatar.startsWith('/') ? user.avatar : null;
  const initial = user?.name?.charAt(0).toUpperCase() ?? 'U';

  const groups: Row[][] = [
    [
      { label: 'Hồ sơ cá nhân', icon: <User size={18} className="text-indigo-400" />, href: '/ho-so-cua-toi' },
      { label: 'Cài đặt', icon: <Settings size={18} className="text-muted-foreground" />, href: '/settings' },
    ],
    [
      { label: 'Trợ giúp', icon: <HelpCircle size={18} className="text-muted-foreground" />, href: 'https://assetflow.fadoai.com/help', external: true },
      { label: 'Đăng xuất', icon: <LogOut size={18} className="text-red-400" />, onClick: handleLogout, danger: true },
    ],
  ];

  return (
    <AppLayout activePath="/tai-khoan">
      <div className="space-y-4 max-w-2xl mx-auto w-full">
        <h1 className="text-xl sm:text-2xl font-700 text-foreground">Tài khoản</h1>

        {/* Hồ sơ */}
        <div className="flex items-center gap-3.5 rounded-2xl border border-white/5 p-4" style={{ background: 'var(--card)' }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0 overflow-hidden relative"
            style={{ background: avatar ? 'transparent' : 'linear-gradient(135deg, #6366f1, #C62828)' }}>
            {avatar ? <Image src={avatar} alt={user?.name || 'User'} width={48} height={48} unoptimized className="w-full h-full object-cover" /> : initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-600 text-foreground truncate">{user?.name ?? 'Người dùng'}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            {user?.roleLabel && (
              <span className="inline-flex items-center gap-1 mt-1 text-2xs text-indigo-400">
                <Shield size={11} /> {user.roleLabel}
              </span>
            )}
          </div>
        </div>

        {/* Tải app về máy (ẩn nếu đã cài) */}
        <InstallAppButton />

        {/* Nhóm chức năng */}
        {groups.map((rows, gi) => (
          <div key={gi} className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
            {rows.map((r, i) => {
              const cls = `flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors ${i > 0 ? 'border-t border-white/5' : ''}`;
              const inner = (
                <>
                  <span className="flex-shrink-0">{r.icon}</span>
                  <span className={`flex-1 text-sm ${r.danger ? 'text-red-400' : 'text-foreground'}`}>{r.label}</span>
                  {!r.danger && <ChevronRight className="h-4 w-4 text-muted-foreground/50" />}
                </>
              );
              if (r.onClick) return <button key={r.label} onClick={r.onClick} className={`w-full text-left ${cls}`}>{inner}</button>;
              if (r.external) return <a key={r.label} href={r.href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>;
              return <Link key={r.label} href={r.href!} className={cls}>{inner}</Link>;
            })}
          </div>
        ))}
      </div>
    </AppLayout>
  );
}
