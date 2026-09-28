import AppLayout from '@/components/AppLayout';
import BaoCaoClient from './components/BaoCaoClient';

export default function SolaceReportsPage() {
  return (
    <AppLayout activePath="/solace">
      <BaoCaoClient />
    </AppLayout>
  );
}
