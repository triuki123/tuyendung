import PermissionGate from '@/components/PermissionGate';
import VanBanClient from './components/VanBanClient';

export default function VanBanPage() {
  return (
    <div className="flex-1 p-4 sm:p-6">
      <PermissionGate unitId="tra-cuu-van-ban" backHref="/tra-cuu" backLabel="Tra Cứu">
        <VanBanClient />
      </PermissionGate>
    </div>
  );
}
