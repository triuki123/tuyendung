import AppLayout from '@/components/AppLayout';
import EmailCenterClient from './components/EmailCenterClient';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <AppLayout activePath="/trung-tam-email">
      <EmailCenterClient />
    </AppLayout>
  );
}
