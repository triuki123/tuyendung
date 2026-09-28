import AppLayout from '@/components/AppLayout';
import FormsListClient from './components/FormsListClient';

export const metadata = { title: 'Biểu Mẫu — FADO AssetFlow' };

export default function BieuMauPage() {
  return (
    <AppLayout activePath="/bieu-mau">
      <FormsListClient />
    </AppLayout>
  );
}
