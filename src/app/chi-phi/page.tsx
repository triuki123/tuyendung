import AppLayout from '@/components/AppLayout';
import ChiPhiClient from './components/ChiPhiClient';

export default function ChiPhiPage() {
  return (
    <AppLayout activePath="/chi-phi">
      <ChiPhiClient />
    </AppLayout>
  );
}
