'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Coffee, ShoppingBag, Wallet, Gift, Loader2,
  ClipboardList, Package, ReceiptText, BookOpen, BarChart3, Settings, ScrollText, Send, Coins, ChefHat, Megaphone,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import type { UserModulePermissions, PermissionAction } from '@/lib/modules';

interface FeatureCard {
  key: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  /** Unit RBAC cần có để thấy (bỏ trống = mọi user). */
  unit?: string;
  /** Phase sẽ bàn giao — hiển thị nhãn "Sắp ra mắt". */
  phase: number;
  /** Link điều hướng nếu chức năng đã sẵn sàng. */
  href?: string;
}

const CUSTOMER_CARDS: FeatureCard[] = [
  { key: 'order',    title: 'Đặt Đồ Uống',  desc: 'Chọn món, tuỳ chọn đường/đá, đặt nhận tại quầy hoặc tại chỗ', icon: <ShoppingBag className="h-5 w-5" />, phase: 4, href: '/solace/dat-mon' },
  { key: 'wallet',   title: 'Ví Của Tôi',   desc: 'Số dư tín dụng, nạp tiền, lịch sử giao dịch & công nợ',       icon: <Wallet className="h-5 w-5" />,     phase: 3, href: '/solace/vi' },
  { key: 'minigame', title: 'Minigame Quà', desc: 'Đi làm sớm — quét mã nhận quà nước/cà phê miễn phí',          icon: <Gift className="h-5 w-5" />,       phase: 6, href: '/solace/minigame' },
];

const MANAGE_CARDS: FeatureCard[] = [
  { key: 'pos',       title: 'Bán Hàng (POS)',       desc: 'Tạo đơn tại quầy, thu tiền, in hoá đơn, kết ca',     icon: <ReceiptText className="h-5 w-5" />,   unit: 'solace-pos',       phase: 2, href: '/solace/pos' },
  { key: 'kds',       title: 'Màn Hình Bếp',         desc: 'Đơn đang xử lý realtime, đẩy trạng thái 1 chạm cho bar/bếp', icon: <ChefHat className="h-5 w-5" />,  unit: 'solace-pos',       phase: 2, href: '/solace/bep' },
  { key: 'menu',      title: 'Thực Đơn & Công Thức', desc: 'Danh mục, món, tuỳ chọn & định mức pha chế',         icon: <ClipboardList className="h-5 w-5" />, unit: 'solace-menu',      phase: 1, href: '/solace/quan-ly' },
  { key: 'inventory', title: 'Kho Nguyên Liệu',      desc: 'Tồn kho, nhập/xuất/điều chỉnh, cảnh báo tồn thấp',   icon: <Package className="h-5 w-5" />,       unit: 'solace-inventory', phase: 1, href: '/solace/quan-ly' },
  { key: 'wallet-mn', title: 'Ví & Nạp Tiền',        desc: 'Quản lý ví thành viên, nạp tiền, giao dịch',         icon: <Wallet className="h-5 w-5" />,        unit: 'solace-wallet',    phase: 3, href: '/solace/quan-ly?tab=wallet' },
  { key: 'debt',      title: 'Công Nợ',              desc: 'Theo dõi & thu công nợ, nhắc nợ tự động',            icon: <BookOpen className="h-5 w-5" />,      unit: 'solace-debt',      phase: 5, href: '/solace/quan-ly?tab=debt' },
  { key: 'cash',      title: 'Sổ Quỹ',               desc: 'Tiền mặt & ngân hàng — thu/chi, kiểm quỹ, số dư',    icon: <Coins className="h-5 w-5" />,         unit: 'solace-cash',      phase: 2, href: '/solace/quan-ly?tab=cash' },
  { key: 'minigame-mn', title: 'Minigame Quà Tặng',  desc: 'Cấu hình minigame & pool món quà (đến sớm nhận quà)',  icon: <Gift className="h-5 w-5" />,          unit: 'solace-minigame',  phase: 6, href: '/solace/minigame-quan-ly' },
  { key: 'reports',   title: 'Báo Cáo Quán',         desc: 'Doanh thu, giá vốn, tiêu hao nguyên liệu, kết ca',   icon: <BarChart3 className="h-5 w-5" />,     unit: 'solace-reports',   phase: 7, href: '/solace/bao-cao' },
  { key: 'marketing', title: 'Marketing',            desc: 'Soạn & gửi bài quảng bá tới khách qua Telegram bot',  icon: <Megaphone className="h-5 w-5" />,    unit: 'solace-marketing', phase: 2, href: '/solace/marketing' },
  { key: 'settings',  title: 'Cấu Hình Quán',        desc: 'Ngân hàng VietQR, giờ hoạt động, hạn mức nợ, người nhận TB', icon: <Settings className="h-5 w-5" />, unit: 'solace-settings', phase: 2, href: '/solace/quan-ly?tab=settings' },
];

export default function SolaceHome() {
  const [perms, setPerms] = useState<UserModulePermissions | undefined>(undefined);
  const [role, setRole] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = getCurrentUser() as { role?: string; module_permissions?: UserModulePermissions } | null;
    setPerms(u?.module_permissions);
    setRole(u?.role ?? '');
    setLoading(false);
  }, []);

  const { canAccessInherited } = useUserPermissions(perms);
  // CHỈ super_admin thấy hết khu vận hành; admin/manager/user theo từng unit RBAC được cấp.
  // (Phần khách — card không có unit — vẫn mở cho mọi người.)
  const isSuperAdmin = role === 'super_admin';
  const canSee = (unit?: string) =>
    !unit || isSuperAdmin || canAccessInherited(unit, 'view' as PermissionAction);
  const visibleManage = MANAGE_CARDS.filter(c => canSee(c.unit));

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl shrink-0"
            style={{ background: 'linear-gradient(135deg, #8B4513, #C77B3B)' }}>
            <Coffee className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-700 text-foreground">Quán Cà Phê Solace</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Đặt đồ uống, ví tín dụng nội bộ & nhận quà — phục vụ thành viên FADO Group
            </p>
          </div>
        </div>
      </div>

      {/* Liên kết bot Telegram Solace */}
      <TelegramLinkBanner />

      {/* Khu khách hàng */}
      <section className="space-y-3">
        <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Dành cho bạn</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {CUSTOMER_CARDS.map(card => <CardItem key={card.key} card={card} />)}
        </div>
      </section>

      {/* Khu vận hành (theo quyền) */}
      {visibleManage.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Vận hành quán</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleManage.map(card => <CardItem key={card.key} card={card} />)}
          </div>
        </section>
      )}

      {/* Ghi chú nền tảng */}
      <div className="rounded-2xl border border-white/5 p-4 flex items-start gap-3"
        style={{ background: 'var(--card)' }}>
        <ScrollText className="h-4 w-4 mt-0.5 text-indigo-400 shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Module Solace đang được xây dựng theo lộ trình. Nền tảng (cơ sở dữ liệu, phân quyền, cấu hình)
          đã sẵn sàng — các chức năng sẽ lần lượt mở khi hoàn thiện từng giai đoạn.
        </p>
      </div>
    </div>
  );
}

function TelegramLinkBanner() {
  const [busy, setBusy] = useState(false);
  const link = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/solace/telegram/link-token', { method: 'POST', credentials: 'include' });
      const d = await res.json();
      if (d?.data?.deepLink) window.open(d.data.deepLink, '_blank');
    } finally { setBusy(false); }
  };
  return (
    <div className="rounded-2xl border border-sky-500/20 p-4 flex items-center justify-between gap-3" style={{ background: 'var(--card)' }}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 shrink-0"><Send className="h-4 w-4" /></div>
        <div className="min-w-0">
          <p className="text-sm font-600 text-foreground">Đặt món qua Telegram</p>
          <p className="text-xs text-muted-foreground">Liên kết bot Solace để đặt nhanh & nhận thông báo qua Telegram.</p>
        </div>
      </div>
      <button onClick={link} disabled={busy}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-600 bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50">
        <Send className="h-4 w-4" /> {busy ? '...' : 'Liên kết'}
      </button>
    </div>
  );
}

function CardItem({ card }: { card: FeatureCard }) {
  const ready = !!card.href;
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-indigo-400 shrink-0">
          {card.icon}
        </div>
        {ready ? (
          <span className="text-2xs font-600 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Mở
          </span>
        ) : (
          <span className="text-2xs font-600 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Sắp ra mắt
          </span>
        )}
      </div>
      <h3 className="text-base font-600 text-foreground mt-3">{card.title}</h3>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{card.desc}</p>
    </>
  );

  const cls = 'rounded-2xl border border-white/5 p-4 overflow-hidden block';
  if (ready) {
    return (
      <Link href={card.href!} className={`${cls} hover:border-indigo-500/40 transition-colors`} style={{ background: 'var(--card)' }}>
        {inner}
      </Link>
    );
  }
  return <div className={cls} style={{ background: 'var(--card)' }}>{inner}</div>;
}
