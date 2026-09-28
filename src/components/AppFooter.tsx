'use client';

import React from 'react';
import BrandWordmark from '@/components/ui/BrandWordmark';
import { APP_VERSION_LABEL } from '@/lib/version';

/**
 * Chân trang dùng chung — wordmark Concept 4 + thông tin bản quyền.
 * Render trong AppLayout nên xuất hiện ở mọi trang lớn.
 */
export default function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-8 border-t border-line-subtle">
      {/* Mobile: 1 dòng gọn */}
      <div className="sm:hidden px-1 py-3 text-center text-2xs text-muted-foreground/50">
        © {year} FADO AssetFlow · HR FADO Group
      </div>

      {/* Desktop: full lockup */}
      <div className="hidden sm:flex items-end justify-between gap-4 pt-6 pb-2 max-w-screen-2xl mx-auto">
        <BrandWordmark height={22} tagline={false} />
        <div className="text-xs text-muted-foreground text-right space-y-1">
          <p>© {year} FADO AssetFlow · {APP_VERSION_LABEL}</p>
          <p className="opacity-70">Được phát triển &amp; vận hành bởi HR FADO Group</p>
        </div>
      </div>
    </footer>
  );
}
