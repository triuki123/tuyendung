import PermissionGate from '@/components/PermissionGate';
import CauHinhClient from './components/CauHinhClient';
export default function CauHinhPage() {
  return (
    <div className="flex-1 p-4 sm:p-6">
      <PermissionGate unitId="cham-cong-machines" backHref="/tra-cuu/du-lieu-cong" backLabel="Dữ Liệu Chấm Công">
        <CauHinhClient />
      </PermissionGate>
    </div>
  );
}
