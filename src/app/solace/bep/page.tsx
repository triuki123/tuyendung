import AppLayout from '@/components/AppLayout';
import BepClient from './components/BepClient';

export default function SolaceBepPage() {
  return (
    <AppLayout activePath="/solace">
      <BepClient />
    </AppLayout>
  );
}
