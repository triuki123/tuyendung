import AppLayout from '@/components/AppLayout';
import DeleteRequestsClient from './components/DeleteRequestsClient';

export default function DeleteRequestsPage() {
  return (
    <AppLayout activePath="/delete-requests">
      <DeleteRequestsClient />
    </AppLayout>
  );
}
