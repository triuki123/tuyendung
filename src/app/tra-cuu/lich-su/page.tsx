import PermissionGate from '@/components/PermissionGate';
import LichSuClient from './components/LichSuClient';

export default function LichSuPage() {
  return (
    <div className="flex-1 p-4 sm:p-6">
      <PermissionGate unitId="tra-cuu-lich-su" backHref="/tra-cuu" backLabel="Tra Cứu">
        <LichSuClient />
      </PermissionGate>
    </div>
  );
}
