'use client';

import AppLayout from '@/components/AppLayout';
import UserTicketsView from './components/UserTicketsView';

export default function UserTicketsPage() {
  return (
    <AppLayout activePath="/tickets">
      <UserTicketsView />
    </AppLayout>
  );
}
