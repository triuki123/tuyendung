import React from 'react';
import PermissionGate from '@/components/PermissionGate';
import PositionsManagement from '../components/PositionsManagement';
import OrgBackLink from '../components/OrgBackLink';

export default function PositionsPage() {
  return (
    <PermissionGate unitId="org-positions" backHref="/organization" backLabel="Quản Lý Tổ Chức">
      <OrgBackLink />
      <PositionsManagement />
    </PermissionGate>
  );
}
