import React from 'react';
import PermissionGate from '@/components/PermissionGate';
import AssetManagementClient from '../components/AssetManagementClient';

export default function HardwarePage() {
  return (
    <PermissionGate unitId="hardware" backHref="/asset-management" backLabel="Quản Lý Tài Sản">
      <AssetManagementClient />
    </PermissionGate>
  );
}
