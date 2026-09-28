'use client';

import React from 'react';
import { LucideIcon, Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Nút hành động chính (vd "Tạo mới"). */
  action?: React.ReactNode;
  className?: string;
}

/**
 * EmptyState — trạng thái rỗng chuẩn: icon + tiêu đề + mô tả + (tuỳ chọn) nút hành động.
 * Chuẩn UX: mọi danh sách rỗng phải hướng dẫn bước tiếp theo, không để màn trống.
 *
 * Dùng: <EmptyState icon={Users} title="Chưa có người dùng" description="..." action={<button.../>} />
 */
export default function EmptyState({ icon: Icon = Inbox, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 sm:py-20 text-center ${className ?? ''}`}>
      <Icon className="h-10 w-10 mb-3 text-muted-foreground opacity-30" />
      <p className="text-sm font-600 text-foreground">{title}</p>
      {description && <p className="text-xs text-muted-foreground mt-1 max-w-xs opacity-80">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
