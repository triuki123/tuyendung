'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, MapPin, Calendar as CalendarIcon } from 'lucide-react';

interface RoomBookingsDayViewProps {
  bookings: any[];
  onBookingClick?: (booking: any) => void;
  onShowHistory?: () => void;
}

export function RoomBookingsDayView({ bookings, onBookingClick, onShowHistory }: RoomBookingsDayViewProps) {
  const [selectedDate, setSelectedDate] = useState(new Date());

  const dateStr = selectedDate.toISOString().split('T')[0];
  const dayBookings = bookings.filter(b => b.booking_date === dateStr).sort((a, b) => {
    return a.start_time.localeCompare(b.start_time);
  });

  const getStatusBadge = (status: string) => {
    const statusConfig: any = {
      pending: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Chờ Duyệt' },
      approved: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Đã Duyệt' },
      confirmed: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Đã Xác Nhận' },
      checked_in: { bg: 'bg-indigo-500/10', text: 'text-indigo-300', label: 'Đã Nhận Phòng' },
      completed: { bg: 'bg-slate-500/10', text: 'text-ink-muted', label: 'Hoàn Tất' },
      rejected: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Từ Chối' },
      cancelled: { bg: 'bg-slate-500/10', text: 'text-ink-muted', label: 'Đã Hủy' },
    };

    const config = statusConfig[status] || statusConfig.pending;
    return (
      <span className={`px-2 py-1 rounded-full ${config.bg} ${config.text} text-2xs font-600 whitespace-nowrap`}>
        {config.label}
      </span>
    );
  };

  const handlePrevDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
  };

  const handleNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    setSelectedDate(newDate);
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  return (
    <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-line overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-line">
        <div className="flex items-center justify-between gap-2 mb-4">
          <button
            onClick={handlePrevDay}
            className="p-2 hover:bg-hover-strong rounded-lg transition-colors"
          >
            <ChevronLeft size={18} className="text-muted-foreground" />
          </button>

          <div className="flex-1 text-center">
            <h3 className="text-base font-600 text-foreground">
              {selectedDate.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })}
            </h3>
          </div>

          <button
            onClick={handleNextDay}
            className="p-2 hover:bg-hover-strong rounded-lg transition-colors"
          >
            <ChevronRight size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleToday}
            className="flex-1 text-2xs font-600 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
          >
            Hôm nay
          </button>
          {onShowHistory && (() => {
            const now = new Date();
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const hasOldBookings = bookings.some(b => new Date(b.booking_date) < sevenDaysAgo);
            return hasOldBookings ? (
              <button
                onClick={onShowHistory}
                className="flex items-center gap-1.5 text-2xs font-600 px-3 py-2 rounded-lg border border-line text-muted-foreground hover:text-foreground hover:bg-hover transition-colors whitespace-nowrap"
              >
                <span>📚</span>
                <span>Lịch Sử</span>
              </button>
            ) : null;
          })()}
        </div>
      </div>

      {/* Bookings List */}
      <div>
        {dayBookings.length === 0 ? (
          <div className="p-6 text-center">
            <CalendarIcon size={32} className="mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">Không có booking cho ngày này</p>
          </div>
        ) : (
          <div className="divide-y divide-line-subtle">
            {dayBookings.map((booking) => (
              <div
                key={booking.id}
                onClick={() => onBookingClick?.(booking)}
                className="p-4 hover:bg-hover transition-colors cursor-pointer"
              >
                {/* Time & Status */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-muted-foreground flex-shrink-0" />
                    <span className="font-600 text-foreground">
                      {booking.start_time} - {booking.end_time}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {booking.confirmed_at && (
                      <span className="px-2 py-1 rounded text-2xs font-600 bg-emerald-500/20 text-emerald-400 whitespace-nowrap">✅</span>
                    )}
                    {getStatusBadge(booking.status)}
                  </div>
                </div>

                {/* Room */}
                <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                  <MapPin size={14} className="flex-shrink-0" />
                  <span className="font-500">{booking.room_name}</span>
                </div>

                {/* Purpose */}
                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                  {booking.purpose}
                </p>

                {/* Person */}
                {booking.requested_by_name && (
                  <p className="text-2xs text-muted-foreground">
                    👤 {booking.requested_by_name}
                  </p>
                )}

                {/* Booked At */}
                {booking.created_at && (
                  <p className="text-2xs text-muted-foreground/70 mt-1">
                    🕒 Đặt lúc: {new Date(booking.created_at).toLocaleString('vi-VN')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      {dayBookings.length > 0 && (
        <div className="p-4 border-t border-line grid grid-cols-2 gap-2 text-2xs">
          {['approved', 'pending', 'rejected', 'cancelled'].map(status => {
            const config: any = {
              pending: { bg: 'bg-amber-500', label: 'Chờ Duyệt' },
              approved: { bg: 'bg-emerald-500', label: 'Đã Duyệt' },
              rejected: { bg: 'bg-red-500', label: 'Từ Chối' },
              cancelled: { bg: 'bg-slate-500', label: 'Đã Hủy' },
            };
            const cfg = config[status];
            return (
              <div key={status} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${cfg.bg}`} />
                <span className="text-muted-foreground">{cfg.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
