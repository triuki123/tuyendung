import AppLayout from '@/components/AppLayout';
import TraTienClient from './components/TraTienClient';

export default function SolacePayPage() {
  return (
    <AppLayout activePath="/solace">
      <TraTienClient />
    </AppLayout>
  );
}
