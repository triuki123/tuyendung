import PermissionGate from '@/components/PermissionGate';
import TaiSanClient from './components/TaiSanClient';

export default function TaiSanPage() {
  return (
    <div className="flex-1 p-4 sm:p-6">
      <PermissionGate unitId="tra-cuu-tai-san" backHref="/tra-cuu" backLabel="Tra Cứu">
        <TaiSanClient />
      </PermissionGate>
    </div>
  );
}
