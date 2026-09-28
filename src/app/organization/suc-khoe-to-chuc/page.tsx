import React from 'react';
import PermissionGate from '@/components/PermissionGate';
import OrgBackLink from '../components/OrgBackLink';
import OrgHealthClient from './components/OrgHealthClient';

/**
 * Trang "Kiểm Tra Sức Khoẻ Tổ Chức" — rà soát dữ liệu cơ cấu còn thiếu:
 * người chưa xếp chỗ, đơn vị thiếu trưởng, chức danh chưa xếp cấp bậc.
 * AppLayout đã được cung cấp bởi src/app/organization/layout.tsx.
 */
export default function OrgHealthPage() {
  return (
    <PermissionGate unitId="organization" backHref="/organization" backLabel="Quản Lý Tổ Chức">
      <OrgBackLink />
      <OrgHealthClient />
    </PermissionGate>
  );
}
