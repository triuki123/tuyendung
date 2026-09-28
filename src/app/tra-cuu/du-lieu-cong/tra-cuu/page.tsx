import PermissionGate from '@/components/PermissionGate';
import TraCuuCongClient from './components/TraCuuCongClient';
export default function TraCuuCongPage() {
  return (
    <div className="flex-1 p-4 sm:p-6">
      <PermissionGate unitId="cham-cong-lookup" backHref="/tra-cuu/du-lieu-cong" backLabel="Dữ Liệu Chấm Công">
        <TraCuuCongClient />
      </PermissionGate>
    </div>
  );
}
