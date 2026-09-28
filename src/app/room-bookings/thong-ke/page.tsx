'use client';

import AppLayout from '@/components/AppLayout';
import RoomAnalyticsClient from './RoomAnalyticsClient';

export default function RoomAnalyticsPage() {
  return (
    <AppLayout activePath="/room-bookings">
      <RoomAnalyticsClient />
    </AppLayout>
  );
}
