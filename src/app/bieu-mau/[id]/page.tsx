import AppLayout from '@/components/AppLayout';
import FormManageClient from './components/FormManageClient';

export const metadata = { title: 'Quản Lý Biểu Mẫu — FADO AssetFlow' };

export default function FormManagePage({ params }: { params: { id: string } }) {
  return (
    <AppLayout activePath="/bieu-mau">
      <FormManageClient formId={params.id} />
    </AppLayout>
  );
}
