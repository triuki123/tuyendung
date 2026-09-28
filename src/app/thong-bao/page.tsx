import AppLayout from '@/components/AppLayout';
import NotificationCenterClient from './components/NotificationCenterClient';

export default function TrungTamThongBaoPage() {
  return (
    <AppLayout activePath="/thong-bao">
      <NotificationCenterClient />
    </AppLayout>
  );
}
