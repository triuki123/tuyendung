import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import BienDongNhanSuClient from './components/BienDongNhanSuClient';

export const metadata = { title: 'Tình Hình Biến Động Nhân Sự — Nguồn Nhân Lực' };

export default function BienDongNhanSuPage() {
  return (
    <AppLayout activePath="/nguon-nhan-luc">
      <PermissionGate unitId="hr" backHref="/nguon-nhan-luc" backLabel="Nguồn Nhân Lực">
        <BienDongNhanSuClient />
      </PermissionGate>
    </AppLayout>
  );
}
