'use client';

import { useState, useEffect } from 'react';
import { UserBookingInterface } from './UserBookingInterface';
import { AdminRoomBookingInterface } from './AdminRoomBookingInterface';

export function RoomBookingsClient() {
  const [userRole, setUserRole] = useState<string>('user');

  useEffect(() => {
    const userData = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (userData) {
      const user = JSON.parse(userData);
      setUserRole(user.role || 'user');
    }
  }, []);

  const isAdmin = userRole === 'admin' || userRole === 'super_admin';

  return (
    <div className="space-y-6">
      {isAdmin ? <AdminRoomBookingInterface /> : <UserBookingInterface />}
    </div>
  );
}
