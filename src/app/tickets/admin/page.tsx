'use client';

import { useSearchParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import AdminDashboard from './components/AdminDashboard';

export default function AdminTicketsPage() {
  const searchParams = useSearchParams();
  const ticketId = searchParams.get('ticketId');

  return (
    <AppLayout activePath="/tickets">
      <AdminDashboard initialTicketId={ticketId} />
    </AppLayout>
  );
}
