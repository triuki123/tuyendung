import AppLayout from '@/components/AppLayout';
import WalletClient from './components/WalletClient';

export default function SolaceWalletPage() {
  return (
    <AppLayout activePath="/solace">
      <WalletClient />
    </AppLayout>
  );
}
