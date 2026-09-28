import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/**
 * Nút quay lại hub Quản Lý Tổ Chức cho các trang con.
 * Thay cho sidebar phụ (đã gỡ) — điều hướng giữa các module con qua hub /organization.
 */
export default function OrgBackLink() {
  return (
    <Link
      href="/organization"
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Quản Lý Tổ Chức
    </Link>
  );
}
