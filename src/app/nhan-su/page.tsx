import AppLayout from '@/components/AppLayout';
import HRClient from './components/HRClient';

export default function NhanSuPage() {
  return (
    <AppLayout activePath="/nhan-su">
      <HRClient />
    </AppLayout>
  );
}
