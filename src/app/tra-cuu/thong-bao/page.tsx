import PermissionGate from '@/components/PermissionGate';
import ThongBaoClient from './components/ThongBaoClient';

export default function ThongBaoPage() {
  return (
    <div className="flex-1 p-4 sm:p-6">
      <PermissionGate unitId="tra-cuu-thong-bao" backHref="/tra-cuu" backLabel="Tra Cứu">
        <ThongBaoClient />
      </PermissionGate>
    </div>
  );
}
