import React from 'react';
import PermissionGate from '@/components/PermissionGate';
import EmailAccountsClient from './components/EmailAccountsClient';

export default function EmailAccountsPage() {
  return (
    <PermissionGate unitId="asset-emails" backHref="/asset-management" backLabel="Quản Lý Tài Sản">
      <EmailAccountsClient />
    </PermissionGate>
  );
}
