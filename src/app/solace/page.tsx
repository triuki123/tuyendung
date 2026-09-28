import AppLayout from '@/components/AppLayout';
import SolaceHome from './components/SolaceHome';

export default function SolacePage() {
  return (
    <AppLayout activePath="/solace">
      <SolaceHome />
    </AppLayout>
  );
}
