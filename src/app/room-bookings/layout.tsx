import React from 'react';
import AppLayout from '@/components/AppLayout';

export default function RoomBookingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppLayout activePath="/room-bookings">
      {children}
    </AppLayout>
  );
}
