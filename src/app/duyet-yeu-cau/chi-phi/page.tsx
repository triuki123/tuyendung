import AppLayout from '@/components/AppLayout';
import DuyetChiPhiClient from './components/DuyetChiPhiClient';

export default function DuyetChiPhiPage() {
  return (
    <AppLayout activePath="/duyet-yeu-cau">
      <DuyetChiPhiClient />
    </AppLayout>
  );
}
