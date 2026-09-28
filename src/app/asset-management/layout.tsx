import React from 'react';
import AppLayout from '@/components/AppLayout';
import AssetBackBar from './components/AssetBackBar';

export default function AssetManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppLayout activePath="/asset-management">
      <div className="space-y-5 sm:space-y-6">
        {/* Back về trang tổng quan — chỉ hiện ở trang con (thay cho sidebar phụ) */}
        <AssetBackBar />
        {children}
      </div>
    </AppLayout>
  );
}
