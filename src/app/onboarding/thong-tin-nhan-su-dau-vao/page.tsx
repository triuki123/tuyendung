import OnboardingFormClient from './components/OnboardingFormClient';

export const metadata = {
  title: 'Biểu Mẫu Nhận Việc — FADO Group',
  description: 'Điền thông tin nhận việc nhân sự mới FADO Group',
};

/**
 * Landing page PUBLIC cố định cho nhân sự mới điền thông tin nhận việc.
 * Link: /onboarding/thong-tin-nhan-su-dau-vao — không cần đăng nhập.
 */
export default function OnboardingThongTinPage() {
  return <OnboardingFormClient />;
}
