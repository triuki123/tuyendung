import AppLayout from '@/components/AppLayout';
import DonCuaToiClient from './components/DonCuaToiClient';

export default function MyOrdersPage() {
  return (
    <AppLayout activePath="/solace">
      <DonCuaToiClient />
    </AppLayout>
  );
}
