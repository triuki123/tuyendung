import React from 'react';
import PermissionGate from '@/components/PermissionGate';
import DomainsClient from './components/DomainsClient';

export default function DomainsPage() {
  return (
    <PermissionGate unitId="asset-domains" backHref="/asset-management" backLabel="Quản Lý Tài Sản">
      <DomainsClient />
    </PermissionGate>
  );
}
