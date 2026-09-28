import { revealOtp } from '@/lib/services/otpChallengeService';
import OtpReveal from './OtpReveal';

export const dynamic = 'force-dynamic';

export default async function OtpPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token || '';
  const res = await revealOtp(token);
  return <OtpReveal otp={res.ok ? res.otp! : null} error={res.ok ? null : (res.error || 'Liên kết không hợp lệ')} />;
}
