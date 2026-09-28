import AppLayout from '@/components/AppLayout';
import SettingsClient from './components/SettingsClient';

export default function SettingsPage() {
  return (
    <AppLayout activePath="/settings">
      <SettingsClient />
    </AppLayout>
  );
}
