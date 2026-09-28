import AppLayout from '@/components/AppLayout';
import DeleteRequestsClient from '@/app/delete-requests/components/DeleteRequestsClient';

export default function XoaTaiSanPage() {
  return (
    <AppLayout activePath="/duyet-yeu-cau">
      <DeleteRequestsClient />
    </AppLayout>
  );
}
