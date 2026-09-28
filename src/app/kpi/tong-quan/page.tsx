import AppLayout from '@/components/AppLayout';
import KpiOverviewClient from './components/KpiOverviewClient';

export default function KpiOverviewPage() {
  return (
    <AppLayout activePath="/kpi/tong-quan">
      <KpiOverviewClient />
    </AppLayout>
  );
}
