import AppLayout from '@/components/AppLayout';
import DatMonClient from './components/DatMonClient';

export default function SolaceOrderPage() {
  return (
    <AppLayout activePath="/solace">
      <DatMonClient />
    </AppLayout>
  );
}
