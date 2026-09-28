'use client';

import { useState, useEffect } from 'react';
import { Calendar, Clock, User, FileText } from 'lucide-react';
import { fetchRoomBookings } from '@/lib/api-client';
import { useNotification } from '@/lib/useNotification';

interface RoomUsageHistoryProps {
  currentUser?: any;
  isAdmin?: boolean;
}

export function RoomUsageHistory({ currentUser, isAdmin = false }: RoomUsageHistoryProps) {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'completed' | 'all'>('completed');
  const { showNotification } = useNotification();

  useEffect(() => {
    loadBookings();
  }, [currentUser, filter]);

  const loadBookings = async () => {
    try {
      setLoading(true);
      let filters: any = { status: 'completed' };

      // If not admin, only show user's own completed bookings
      if (!isAdmin && currentUser?.id) {
        filters.requested_by = currentUser.id;
      }

      const data = await fetchRoomBookings(filters);
      setBookings(data);
    } catch (error) {
      console.error('Error loading usage history:', error);
      showNotification('Lỗi tải lịch sử sử dụng phòng', 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const stats = {
    total: bookings.length,
    confirmed: bookings.filter(b => b.confirmed_at).length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-700 text-foreground">Lịch Sử Sử Dụng Phòng</h2>
          <p className="text-2xs sm:text-xs text-muted-foreground mt-1">
            {stats.total} phòng đã sử dụng ({stats.confirmed} đã xác nhận)
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-slate-900/50 backdrop-blur-sm p-3 sm:p-4 rounded-lg sm:rounded-xl border border-line">
            <p className="text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-1">Tổng Sử Dụng</p>
            <p className="text-lg sm:text-2xl font-700 text-foreground">{stats.total}</p>
          </div>
          <div className="bg-slate-900/50 backdrop-blur-sm p-3 sm:p-4 rounded-lg sm:rounded-xl border border-line">
            <p className="text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-1">Đã Xác Nhận</p>
            <p className="text-lg sm:text-2xl font-700 text-emerald-400">{stats.confirmed}</p>
          </div>
          <div className="bg-slate-900/50 backdrop-blur-sm p-3 sm:p-4 rounded-lg sm:rounded-xl border border-line">
            <p className="text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-1">Tỷ Lệ Xác Nhận</p>
            <p className="text-lg sm:text-2xl font-700 text-blue-400">
              {stats.total > 0 ? Math.round((stats.confirmed / stats.total) * 100) : 0}%
            </p>
          </div>
        </div>
      )}

      {/* Bookings List */}
      <div>
        {loading ? (
          <div className="flex items-center justify-center h-32 bg-slate-900/50 backdrop-blur-sm rounded-lg border border-line">
            <p className="text-2xs sm:text-xs text-muted-foreground">Đang tải...</p>
          </div>
        ) : bookings.length === 0 ? (
          <div className="bg-slate-900/50 backdrop-blur-sm p-6 rounded-lg sm:rounded-xl border border-line text-center">
            <Calendar size={32} className="mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm sm:text-base text-muted-foreground">Chưa có lịch sử sử dụng phòng</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map((booking) => (
              <div
                key={booking.id}
                className="bg-slate-900/50 backdrop-blur-sm p-4 sm:p-5 rounded-lg sm:rounded-xl border border-line hover:border-line-strong transition-all"
              >
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm sm:text-base font-600 text-foreground break-words">{booking.room_name}</h4>
                    <p className="text-2xs sm:text-xs text-muted-foreground mt-0.5">{booking.purpose}</p>
                  </div>
                  <div className="flex gap-2">
                    {booking.confirmed_at && (
                      <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-2xs font-600 whitespace-nowrap">
                        ✓ Đã Xác Nhận
                      </span>
                    )}
                    {booking.status === 'completed' && !booking.confirmed_at && (
                      <span className="px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 text-2xs font-600 whitespace-nowrap">
                        ⏳ Chờ Xác Nhận
                      </span>
                    )}
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-line-subtle pt-3">
                  <div className="flex items-center gap-2 text-2xs sm:text-xs text-muted-foreground">
                    <Calendar size={14} className="flex-shrink-0" />
                    <span>{booking.booking_date}</span>
                  </div>
                  <div className="flex items-center gap-2 text-2xs sm:text-xs text-muted-foreground">
                    <Clock size={14} className="flex-shrink-0" />
                    <span>{booking.start_time} - {booking.end_time}</span>
                  </div>

                  {isAdmin && booking.requested_by_name && (
                    <div className="flex items-center gap-2 text-2xs sm:text-xs text-muted-foreground">
                      <User size={14} className="flex-shrink-0" />
                      <span>{booking.requested_by_name}</span>
                    </div>
                  )}

                  {booking.confirmed_at && (
                    <div className="flex items-center gap-2 text-2xs sm:text-xs text-emerald-400">
                      <Calendar size={14} className="flex-shrink-0" />
                      <span>Xác nhận: {formatDate(booking.confirmed_at)}</span>
                    </div>
                  )}

                  {booking.confirmation_note && (
                    <div className="col-span-full flex items-start gap-2 text-2xs sm:text-xs text-muted-foreground bg-hover p-2 rounded">
                      <FileText size={14} className="flex-shrink-0 mt-0.5" />
                      <span className="break-words">{booking.confirmation_note}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
