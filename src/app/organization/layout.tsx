import React from 'react';
import AppLayout from '@/components/AppLayout';

// AppLayout đã cung cấp main + padding + max-w + footer. Layout này chỉ truyền tiếp;
// điều hướng giữa các trang con dùng hub /organization (tile) + nút back ở mỗi trang.
export default function OrganizationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppLayout activePath="/organization">{children}</AppLayout>;
}
