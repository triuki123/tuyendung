import AppLayout from '@/components/AppLayout';
import QuanLyClient from './components/QuanLyClient';

export default function SolaceManagePage() {
  return (
    <AppLayout activePath="/solace">
      <QuanLyClient />
    </AppLayout>
  );
}
