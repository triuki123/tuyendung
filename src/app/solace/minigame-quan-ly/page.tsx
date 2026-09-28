import AppLayout from '@/components/AppLayout';
import MinigameAdminClient from './MinigameAdminClient';

export default function SolaceMinigameAdminPage() {
  return (
    <AppLayout activePath="/solace">
      <MinigameAdminClient />
    </AppLayout>
  );
}
