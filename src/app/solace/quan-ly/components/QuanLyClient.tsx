'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ClipboardList, SlidersHorizontal, Package, Wallet, BookOpen, Gift, Settings, Loader2 } from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import type { UserModulePermissions } from '@/lib/modules';
import MenuTab from './MenuTab';
import OptionsTab from './OptionsTab';
import InventoryTab from './InventoryTab';
import WalletAdminTab from './WalletAdminTab';
import DebtTab from './DebtTab';
import VoucherTab from './VoucherTab';
import SettingsTab from './SettingsTab';
import CashTab from './CashTab';

type TabKey = 'menu' | 'options' | 'inventory' | 'wallet' | 'debt' | 'voucher' | 'cash' | 'settings';

export default function QuanLyClient({ embedded }: { embedded?: boolean } = {}) {
  const [perms, setPerms] = useState<UserModulePermissions | undefined>();
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('menu');
  const [mobileSection, setMobileSection] = useState(false); // mobile: false = đang ở lưới thẻ; true = đã mở 1 mục

  useEffect(() => {
    const u = getCurrentUser() as { role?: string; module_permissions?: UserModulePermissions } | null;
    setPerms(u?.module_permissions);
    setRole(u?.role ?? '');
    setLoading(false);
  }, []);

  const { canAccessInherited } = useUserPermissions(perms);
  const isSuperAdmin = role === 'super_admin';
  const canMenu = isSuperAdmin || canAccessInherited('solace-menu', 'view');
  const canInv = isSuperAdmin || canAccessInherited('solace-inventory', 'view');
  const canWallet = isSuperAdmin || canAccessInherited('solace-wallet', 'view');
  const canDebt = isSuperAdmin || canAccessInherited('solace-debt', 'view');
  const canCash = isSuperAdmin || canAccessInherited('solace-cash', 'view');
  const canCashDelete = isSuperAdmin || canAccessInherited('solace-cash', 'delete');
  // Cấu hình quán: CHỈ super_admin (nhân viên/quản lý không được vào — khoá cả ở API).
  const canSettings = isSuperAdmin;

  const tabs: { key: TabKey; label: string; icon: React.ReactNode; desc: string; show: boolean }[] = [
    { key: 'menu', label: 'Thực Đơn', icon: <ClipboardList className="h-4 w-4" />, desc: 'Món, giá & ảnh', show: canMenu },
    { key: 'options', label: 'Tuỳ Chọn', icon: <SlidersHorizontal className="h-4 w-4" />, desc: 'Đường, đá, size...', show: canMenu },
    { key: 'inventory', label: 'Kho Nguyên Liệu', icon: <Package className="h-4 w-4" />, desc: 'Nguyên liệu & tồn kho', show: canInv },
    { key: 'wallet', label: 'Ví & Nạp Tiền', icon: <Wallet className="h-4 w-4" />, desc: 'Ví & nạp tiền nhân viên', show: canWallet },
    { key: 'debt', label: 'Công Nợ', icon: <BookOpen className="h-4 w-4" />, desc: 'Theo dõi ghi nợ', show: canDebt },
    { key: 'voucher', label: 'Khuyến Mãi', icon: <Gift className="h-4 w-4" />, desc: 'Mã giảm giá & quà', show: canMenu },
    { key: 'cash', label: 'Sổ Quỹ', icon: <Wallet className="h-4 w-4" />, desc: 'Tiền mặt & ngân hàng', show: canCash },
    { key: 'settings', label: 'Cấu Hình Quán', icon: <Settings className="h-4 w-4" />, desc: 'Chỉ Super Admin', show: canSettings },
  ];
  const visibleTabs = tabs.filter(t => t.show);

  useEffect(() => {
    if (loading) return;
    const urlTab = new URLSearchParams(window.location.search).get('tab') as TabKey | null;
    if (urlTab && visibleTabs.some(t => t.key === urlTab)) { setTab(urlTab); setMobileSection(true); return; }
    if (visibleTabs.length > 0 && !visibleTabs.some(t => t.key === tab)) setTab(visibleTabs[0].key);
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (visibleTabs.length === 0) {
    return (
      <div className="flex flex-col items-center py-20 text-muted-foreground">
        <Package className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm">Bạn không có quyền vận hành quán</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {!embedded && (
        <Link href="/solace" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Quán Solace
        </Link>
      )}

      <div>
        <h1 className="text-xl sm:text-2xl font-700 text-foreground">Quản Lý Quán</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">Thực đơn, tuỳ chọn món & kho nguyên liệu</p>
      </div>

      {/* Desktop: thanh tab */}
      <div className="hidden lg:flex gap-2 border-b border-white/10 overflow-x-auto">
        {visibleTabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-500 border-b-2 whitespace-nowrap transition-colors ${
              tab === t.key ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Mobile: lưới thẻ (không cuộn ngang) */}
      {!mobileSection && (
        <div className="lg:hidden grid grid-cols-2 gap-3">
          {visibleTabs.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setMobileSection(true); }}
              className="flex flex-col items-start gap-2 rounded-2xl border border-white/5 p-4 text-left active:bg-white/5 transition-colors"
              style={{ background: 'var(--card)' }}>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">{t.icon}</span>
              <span className="text-sm font-600 text-foreground leading-tight">{t.label}</span>
              <span className="text-2xs text-muted-foreground leading-tight">{t.desc}</span>
            </button>
          ))}
        </div>
      )}

      {/* Mobile: nút quay lại lưới thẻ khi đang mở 1 mục */}
      {mobileSection && (
        <button onClick={() => setMobileSection(false)}
          className="lg:hidden inline-flex items-center gap-1.5 text-sm font-600 text-foreground">
          <ArrowLeft className="h-4 w-4" /> {visibleTabs.find(t => t.key === tab)?.label ?? 'Quản lý quán'}
        </button>
      )}

      {/* Nội dung: desktop luôn hiện; mobile chỉ hiện khi đã mở 1 mục */}
      <div className={`${mobileSection ? 'block' : 'hidden'} lg:block`}>
        {tab === 'menu' && <MenuTab />}
        {tab === 'options' && <OptionsTab />}
        {tab === 'inventory' && <InventoryTab />}
        {tab === 'wallet' && <WalletAdminTab />}
        {tab === 'debt' && <DebtTab />}
        {tab === 'voucher' && <VoucherTab />}
        {tab === 'cash' && <CashTab canDelete={canCashDelete} />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
}
