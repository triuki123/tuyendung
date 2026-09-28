'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

interface MobilePageHeaderProps {
  title: string;
  subtitle?: string;
  /** Hiện nút back (mặc định true). href có thì push, không thì router.back(). */
  back?: boolean;
  backHref?: string;
  /** Hành động bên phải (vd nút thêm, lọc). */
  action?: React.ReactNode;
}

/**
 * Header dính kiểu app cho từng màn — CHỈ hiện trên mobile (<lg).
 * Trên desktop ẩn đi để giữ header chuẩn của trang (h1 + mô tả).
 * Đặt ngay đầu nội dung trang, trong <AppLayout>.
 */
export default function MobilePageHeader({ title, subtitle, back = true, backHref, action }: MobilePageHeaderProps) {
  const router = useRouter();
  return (
    <div
      className="lg:hidden sticky top-14 z-20 -mx-4 sm:-mx-5 mb-3 px-4 sm:px-5 py-2.5 flex items-center gap-2 border-b border-white/8"
      style={{ background: 'var(--topbar-bg)', backdropFilter: 'blur(20px)' }}
    >
      {back && (
        <button
          type="button"
          onClick={() => (backHref ? router.push(backHref) : router.back())}
          aria-label="Quay lại"
          className="flex items-center justify-center w-9 h-9 -ml-1.5 rounded-xl btn-ghost text-muted-foreground"
        >
          <ArrowLeft size={20} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-base font-700 text-foreground leading-tight truncate">{title}</h1>
        {subtitle && <p className="text-2xs text-muted-foreground leading-tight truncate">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
