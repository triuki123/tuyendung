import PermissionGate from '@/components/PermissionGate';
import ChamCongClient from './components/ChamCongClient';
export default function ChamCongPage() {
  return (
    <div className="flex-1 p-4 sm:p-6">
      <PermissionGate unitId="cham-cong-checkin" backHref="/tra-cuu/du-lieu-cong" backLabel="Dữ Liệu Chấm Công">
        <ChamCongClient />
      </PermissionGate>
    </div>
  );
}
