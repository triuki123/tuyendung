import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import DesignRequestsClient from './DesignRequestsClient';

export const metadata = { title: 'Yêu Cầu Thiết Kế — FADO AssetFlow' };

export default function DesignRequestsPage() {
  return (
    <AppLayout activePath="/yeu-cau-thiet-ke">
      <PermissionGate unitId="design-requests" backHref="/dashboard" backLabel="Dashboard">
        <DesignRequestsClient />
      </PermissionGate>
    </AppLayout>
  );
}
