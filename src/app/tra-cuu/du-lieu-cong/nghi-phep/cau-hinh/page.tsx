import PermissionGate from '@/components/PermissionGate';
import CauHinhPhepClient from './components/CauHinhPhepClient';

export default function CauHinhPhepPage() {
  return (
    <div className="flex-1 p-4 sm:p-6">
      <PermissionGate unitId="cham-cong-leave-config" backHref="/tra-cuu/du-lieu-cong" backLabel="Dữ Liệu Chấm Công">
        <CauHinhPhepClient />
      </PermissionGate>
    </div>
  );
}
