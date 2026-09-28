import AppLayout from '@/components/AppLayout';
import MinigameClaim from './MinigameClaim';

export default function SolaceMinigamePage() {
  return (
    <AppLayout activePath="/solace">
      <MinigameClaim />
    </AppLayout>
  );
}
