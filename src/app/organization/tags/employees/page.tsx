import React from 'react';
import PermissionGate from '@/components/PermissionGate';
import TagsManagement from '../../components/TagsManagement';

export default function EmployeeTagsPage() {
  return (
    <PermissionGate unitId="org-tags" backHref="/organization" backLabel="Quản Lý Tổ Chức">
      <TagsManagement />
    </PermissionGate>
  );
}
