'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

/**
 * Back link về trang tổng quan Quản Lý Tài Sản — thay cho sidebar phụ đã gỡ.
 * Chỉ hiện ở các trang con (Phần Cứng, Tên Miền, Email, Phần Mềm, Zimbra),
 * KHÔNG hiện ở chính trang tổng quan.
 */
export default function AssetBackBar() {
  const pathname = usePathname();
  if (pathname === '/asset-management') return null;

  return (
    <Link
      href="/asset-management"
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Quản Lý Tài Sản
    </Link>
  );
}
