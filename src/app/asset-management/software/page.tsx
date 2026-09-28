import React from 'react';
import PermissionGate from '@/components/PermissionGate';
import SoftwareClient from './components/SoftwareClient';

export default function SoftwarePage() {
  return (
    <PermissionGate unitId="software" backHref="/asset-management" backLabel="Quản Lý Tài Sản">
      <SoftwareClient />
    </PermissionGate>
  );
}
