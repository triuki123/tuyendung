import AppLayout from '@/components/AppLayout';
import OrderRequisitionsClient from './components/OrderRequisitionsClient';

export const metadata = { title: 'Yêu Cầu Tuyển Dụng — FADO AssetFlow' };

export default function YeuCauTuyenDungOrderPage() {
  return (
    <AppLayout activePath="/yeu-cau-tuyen-dung">
      <OrderRequisitionsClient />
    </AppLayout>
  );
}
