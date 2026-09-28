import AppLayout from '@/components/AppLayout';
import PosClient from './components/PosClient';

export default function SolacePosPage() {
  return (
    <AppLayout activePath="/solace">
      <PosClient />
    </AppLayout>
  );
}
