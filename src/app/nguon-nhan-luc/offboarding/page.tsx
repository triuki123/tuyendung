import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import OffboardingClient from './components/OffboardingClient';

export const metadata = { title: 'Offboarding — Nguồn Nhân Lực' };

export default function OffboardingPage() {
  return (
    <AppLayout activePath="/nguon-nhan-luc">
      <PermissionGate unitId="hr-offboarding" backHref="/nguon-nhan-luc" backLabel="Nguồn Nhân Lực">
        <OffboardingClient />
      </PermissionGate>
    </AppLayout>
  );
}
