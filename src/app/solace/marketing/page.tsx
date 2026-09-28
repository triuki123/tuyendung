import AppLayout from '@/components/AppLayout';
import MarketingClient from './components/MarketingClient';

export default function SolaceMarketingPage() {
  return (
    <AppLayout activePath="/solace">
      <MarketingClient />
    </AppLayout>
  );
}
