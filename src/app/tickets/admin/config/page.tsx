'use client';

import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import TicketConfigClient from './TicketConfigClient';

export default function TicketConfigPage() {
  return (
    <AppLayout activePath="/tickets/admin/config">
      <PermissionGate unitId="ticket-config" backHref="/tickets" backLabel="Ticket Hỗ Trợ">
        <TicketConfigClient />
      </PermissionGate>
    </AppLayout>
  );
}
