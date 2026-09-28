'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { NAV_ITEMS, NAV_GROUPS } from '@/components/Sidebar';
import { shouldShowNavigationModule } from '@/lib/rolePolicy';
import type { UserModulePermissions } from '@/lib/modules';

interface Props {
  role: string | undefined;
  perms: UserModulePermissions | undefined;
  activePath: string;
  onClose: () => void;
}

/** Màu riêng cho từng app (nhận diện nhanh bằng màu). Thiếu → tím mặc định. */
const APP_COLOR: Record<string, string> = {
  'nav-dashboard': '#3B82F6', 'nav-action-center': '#6366F1', 'nav-notifications': '#EF4444',
  'nav-tra-cuu': '#06B6D4', 'nav-history': '#64748B',
  'nav-tickets': '#F43F5E', 'nav-tasks': '#6366F1', 'nav-room-bookings': '#14B8A6',
  'nav-duyet-yeu-cau': '#F59E0B', 'nav-expense': '#EAB308', 'nav-kpi': '#8B5CF6',
  'nav-cham-cong': '#10B981', 'nav-my-hr': '#0EA5E9', 'nav-the-dien-tu': '#A855F7',
  'nav-recruitment-order': '#F97316', 'nav-hr': '#EC4899', 'nav-hr-resources': '#22C55E',
  'nav-solace': '#B45309', 'nav-warehouse': '#F59E0B', 'nav-email-signature': '#818CF8', 'nav-qr': '#22C55E',
  'nav-assets': '#10B981', 'nav-organization': '#3B82F6', 'nav-forms': '#6366F1',
  'nav-email-center': '#0EA5E9', 'nav-users': '#EF4444', 'nav-system-config': '#64748B', 'nav-settings': '#64748B',
};
const colorOf = (id: string) => APP_COLOR[id] || '#6366F1';

/** Lưới tất cả ứng dụng (module) theo nhóm — kiểu Odoo / Microsoft 365. Không có ô tìm riêng (dùng ⌘K / tìm kiếm topbar). */
export default function AppLauncher({ role, perms, activePath, onClose }: Props) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const groups = useMemo(() => {
    if (!role) return [];
    return NAV_GROUPS.map((g) => ({
      label: g.label,
      items: g.ids
        .map((id) => NAV_ITEMS.find((i) => i.id === id))
        .filter((i): i is (typeof NAV_ITEMS)[number] => !!i && shouldShowNavigationModule(role, i.id, perms)),
    })).filter((g) => g.items.length > 0);
  }, [role, perms]);

  const go = (href: string) => { onClose(); router.push(href); };

  return (
    // Bắt đầu NGAY DƯỚI topbar (top-14/16) để không che topbar.
    <div className="fixed left-0 right-0 bottom-0 top-14 sm:top-16 z-40 overflow-y-auto" style={{ background: 'var(--background)' }}>
      {/* Kiểu Odoo: chỉ có lưới, không nút đóng. Đóng bằng nút "Ứng dụng" trên topbar / Esc / chọn app. */}
      <div className="p-4 sm:p-6 max-w-screen-xl mx-auto space-y-7">
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-16">Không có ứng dụng phù hợp</p>
        ) : groups.map((g) => (
          <div key={g.label}>
            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider mb-3">{g.label}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {g.items.map((i) => {
                const isActive = i.href === activePath;
                const c = colorOf(i.id);
                return (
                  <button key={i.id} onClick={() => go(i.href)}
                    className={`group flex flex-col items-center gap-2.5 rounded-2xl border p-4 text-center transition-all hover:-translate-y-0.5 ${
                      isActive ? 'border-white/20' : 'border-white/5 hover:border-white/15'
                    }`}
                    style={{ background: isActive ? `${c}18` : 'var(--card)' }}>
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl transition-colors"
                      style={{ background: `${c}22`, color: c }}>
                      {i.icon}
                    </span>
                    <span className="text-xs font-600 text-foreground leading-tight line-clamp-2">{i.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
