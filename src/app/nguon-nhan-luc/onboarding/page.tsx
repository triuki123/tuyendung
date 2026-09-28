import AppLayout from '@/components/AppLayout';
import PermissionGate from '@/components/PermissionGate';
import OnboardingClient from './components/OnboardingClient';

export const metadata = { title: 'Onboarding — Nguồn Nhân Lực' };

export default function OnboardingPage() {
  return (
    <AppLayout activePath="/nguon-nhan-luc">
      <PermissionGate unitId="hr-onboarding" backHref="/nguon-nhan-luc" backLabel="Nguồn Nhân Lực">
        <OnboardingClient />
      </PermissionGate>
    </AppLayout>
  );
}
