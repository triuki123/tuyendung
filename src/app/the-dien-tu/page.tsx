import AppLayout from '@/components/AppLayout';
import TheDienTuClient from './components/TheDienTuClient';

export default function TheDienTuPage() {
  return (
    <AppLayout activePath="/the-dien-tu">
      <TheDienTuClient />
    </AppLayout>
  );
}
