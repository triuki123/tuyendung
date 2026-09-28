'use client';

import dynamic from 'next/dynamic';
import AppLayout from '@/components/AppLayout';

const UsersClient = dynamic(() => import('./components/UsersClient'), {
  ssr: false,
  loading: () => <div className="text-center py-8">Đang tải...</div>,
});

export default function UsersPage() {
  return (
    <AppLayout activePath="/users">
      <UsersClient />
    </AppLayout>
  );
}
