import AppLayout from '@/components/AppLayout';
import EmailSignatureClient from './components/EmailSignatureClient';

export default function EmailSignaturePage() {
  return (
    <AppLayout activePath="/email-signature">
      <EmailSignatureClient />
    </AppLayout>
  );
}
