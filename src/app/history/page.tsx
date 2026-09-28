import AppLayout from '@/components/AppLayout';
import HistoryClient from './components/HistoryClient';

export default function HistoryPage() {
  return (
    <AppLayout activePath="/history">
      <HistoryClient />
    </AppLayout>
  );
}
