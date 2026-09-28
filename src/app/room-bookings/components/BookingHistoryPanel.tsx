'use client';

import { useMemo } from 'react';
import { X, Clock, MapPin, Calendar, ChevronRight } from 'lucide-react';
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface BookingHistoryPanelProps {
  bookings: any[];
  isOpen: boolean;
  onClose: () => void;
  onSelectBooking: (booking: any) => void;
}

export function BookingHistoryPanel({
  bookings,
  isOpen,
  onClose,
  onSelectBooking,
}: BookingHistoryPanelProps) {
  useEscapeKey(onClose, isOpen);

  // Filter to show only old bookings (>7 days old from booking date)
  const archiveBookings = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return bookings.filter((booking) => {
      const bookingDate = new Date(booking.booking_date);
      // Include if booking date is more than 7 days ago (regardless of status)
      return bookingDate < sevenDaysAgo;
    }).sort((a, b) => new Date(b.booking_date).getTime() - new Date(a.booking_date).getTime());
  }, [bookings]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-900/95 backdrop-blur-sm border border-line rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-line">
            <h2 className="text-lg font-700 text-foreground flex items-center gap-2">
              📚 Lịch Sử Đặt Phòng
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-hover-strong rounded-lg transition-colors"
            >
              <X size={20} className="text-muted-foreground" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {archiveBookings.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm text-muted-foreground">Không có lịch sử đặt phòng</p>
              </div>
            ) : (
              <div className="p-6 space-y-3">
                {archiveBookings.map((booking) => (
                  <button
                    key={booking.id}
                    onClick={() => {
                      onSelectBooking(booking);
                      onClose();
                    }}
                    className="w-full p-4 rounded-lg border border-line bg-slate-800/30 hover:bg-slate-800/60 transition-colors text-left group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        {/* Room Name */}
                        <div className="flex items-center gap-2">
                          <MapPin size={16} className="text-indigo-400 flex-shrink-0" />
                          <p className="font-500 text-foreground text-sm group-hover:text-indigo-400 transition-colors">
                            {booking.room_name}
                          </p>
                        </div>

                        {/* Date and Time */}
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-ink-muted flex-shrink-0" />
                          <p className="text-2xs text-muted-foreground">
                            {new Date(booking.booking_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </p>
                          <Clock size={14} className="text-ink-muted flex-shrink-0" />
                          <p className="text-2xs text-muted-foreground">
                            {booking.start_time} - {booking.end_time}
                          </p>
                        </div>

                        {/* Booked At */}
                        {booking.created_at && (
                          <p className="text-2xs text-muted-foreground/70">
                            Đặt lúc: {new Date(booking.created_at).toLocaleString('vi-VN')}
                          </p>
                        )}

                        {/* Purpose */}
                        <p className="text-2xs text-muted-foreground line-clamp-2">
                          {booking.purpose}
                        </p>

                        {/* Participants */}
                        {booking.num_participants && (
                          <p className="text-2xs text-ink-muted">
                            👥 {booking.num_participants} người tham dự
                          </p>
                        )}

                        {/* Online Meeting & Setup */}
                        <div className="flex items-center gap-2 pt-1">
                          {booking.has_online_meeting && (
                            <span className="text-2xs text-blue-400">📹 Họp trực tuyến</span>
                          )}
                          {booking.needs_room_setup && (
                            <span className="text-2xs text-orange-400">🔧 Cần chuẩn bị phòng</span>
                          )}
                        </div>

                        {/* Status Badge */}
                        <div className="flex items-center gap-2 pt-1">
                          {booking.status === 'cancelled' && (
                            <span className="px-2 py-1 rounded text-2xs font-500 bg-red-500/20 text-red-300 border border-red-500/30">
                              Đã hủy
                            </span>
                          )}
                          {booking.status === 'completed' && (
                            <span className="px-2 py-1 rounded text-2xs font-500 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              Đã hoàn tất
                            </span>
                          )}
                          {booking.confirmed_at && (
                            <span className="px-2 py-1 rounded text-2xs font-500 bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                              ✅ Đã xác nhận
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Chevron */}
                      <ChevronRight size={20} className="text-muted-foreground group-hover:text-indigo-400 transition-colors flex-shrink-0 mt-1" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-line p-6 bg-slate-900/50">
            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 rounded-lg border border-line text-2xs font-600 text-foreground hover:bg-hover transition-colors"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
