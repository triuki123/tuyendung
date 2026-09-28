'use client';

import React from 'react';
import { Calendar, MapPin, Clock } from 'lucide-react';

interface RoomBooking {
  id: string;
  room_id: string;
  room_name: string;
  requested_by: string;
  requested_by_name: string;
  start_time: string;
  end_time: string;
  status: 'pending' | 'approved' | 'rejected';
  purpose?: string;
  created_at: string;
}

interface UserMyRoomBookingsProps {
  bookings: RoomBooking[];
  loading: boolean;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'approved':
      return 'bg-green-500/10 text-green-600 border-green-500/20';
    case 'pending':
      return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    case 'rejected':
      return 'bg-red-500/10 text-red-600 border-red-500/20';
    default:
      return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
  }
};

const formatDateTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('vi-VN', {
    weekday: 'short',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function UserMyRoomBookings({
  bookings,
  loading,
}: UserMyRoomBookingsProps) {
  const activeBookings = bookings.filter(b => b.status !== 'rejected');

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-muted rounded w-1/3" />
          <div className="h-3 bg-muted rounded" />
          <div className="h-3 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <h2 className="text-lg font-700 text-foreground mb-4 flex items-center gap-2">
        <Calendar className="w-5 h-5" />
        Phòng Họp Sắp Tới
      </h2>

      <div className="space-y-3">
        {activeBookings.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Không có phòng họp được đặt
          </p>
        ) : (
          activeBookings.slice(0, 5).map(booking => (
            <div
              key={booking.id}
              className="bg-muted/50 rounded-lg p-4 border border-border/50 hover:border-border transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {booking.room_name}
                  </p>
                  {booking.purpose && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {booking.purpose}
                    </p>
                  )}
                </div>
                <span
                  className={`text-xs font-medium px-2 py-1 rounded border flex-shrink-0 ${getStatusColor(
                    booking.status
                  )}`}
                >
                  {booking.status === 'pending' ? 'Chờ duyệt' : booking.status === 'approved' ? 'Đã duyệt' : 'Từ chối'}
                </span>
              </div>

              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>
                    {formatDateTime(booking.start_time)} - {new Date(booking.end_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
