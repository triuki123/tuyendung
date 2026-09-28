import React from 'react';
import PermissionGate from '@/components/PermissionGate';
import OrgTagsManagement from '../../components/OrgTagsManagement';

export default function DeptTagsPage() {
  return (
    <PermissionGate unitId="org-tags" backHref="/organization" backLabel="Quản Lý Tổ Chức">
      <OrgTagsManagement />
    </PermissionGate>
  );
}
