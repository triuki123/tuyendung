'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldAlert, ArrowLeft, Loader2 } from 'lucide-react';
import { PermissionAction } from '@/lib/modules';
import { useClientCanAccess } from '@/lib/clientPermissions';

interface PermissionGateProps {
  /** Đơn vị quyền cần kiểm tra (module mẹ hoặc con), vd 'hr-offboarding'. */
  unitId: string;
  action?: PermissionAction;
  children: React.ReactNode;
  /** Link quay lại khi bị chặn (mặc định Dashboard). */
  backHref?: string;
  backLabel?: string;
}

/**
 * Bọc nội dung trang con — chỉ hiển thị khi người dùng có quyền (kế thừa mẹ).
 * Khi chưa có quyền: hiện thông báo lịch sự + link quay lại. Không chặn super_admin/admin.
 */
export default function PermissionGate({
  unitId,
  action = 'view',
  children,
  backHref = '/dashboard',
  backLabel = 'Về Trang Chủ',
}: PermissionGateProps) {
  const { ready, allowed } = useClientCanAccess(unitId, action);

  // Lần render đầu (chưa đọc được localStorage) → tránh nhấp nháy nội dung
  if (!ready) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4">
          <ShieldAlert className="h-8 w-8 text-red-400" />
        </div>
        <h2 className="text-lg font-700 text-foreground">Bạn không có quyền truy cập</h2>
        <p className="mt-1.5 text-sm text-muted-foreground max-w-sm">
          Khu vực này yêu cầu quyền truy cập riêng. Vui lòng liên hệ quản trị viên nếu bạn cần được cấp quyền.
        </p>
        <Link href={backHref} className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-hover transition-colors">
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
