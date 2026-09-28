import AppLayout from '@/components/AppLayout';
import KpiClient from './components/KpiClient';

export default function KpiPage() {
  return (
    <AppLayout activePath="/kpi">
      <KpiClient />
    </AppLayout>
  );
}
