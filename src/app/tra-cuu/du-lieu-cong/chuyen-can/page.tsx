import PermissionGate from '@/components/PermissionGate';
import ChuyenCanClient from './components/ChuyenCanClient';

export default function ChuyenCanPage() {
  return (
    <div className="flex-1 p-4 sm:p-6">
      <PermissionGate unitId="cham-cong-diligence" backHref="/tra-cuu/du-lieu-cong" backLabel="Dữ Liệu Chấm Công">
        <ChuyenCanClient />
      </PermissionGate>
    </div>
  );
}
