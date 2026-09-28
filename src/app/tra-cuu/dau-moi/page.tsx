import PermissionGate from '@/components/PermissionGate';
import DauMoiClient from './components/DauMoiClient';

export default function DauMoiPage() {
  return (
    <div className="flex-1 p-4 sm:p-6">
      <PermissionGate unitId="tra-cuu-dau-moi" backHref="/tra-cuu" backLabel="Tra Cứu">
        <DauMoiClient />
      </PermissionGate>
    </div>
  );
}
