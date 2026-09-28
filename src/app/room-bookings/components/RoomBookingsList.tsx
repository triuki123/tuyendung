'use client';

import { useState, useMemo } from 'react';
import { Calendar, Clock, MapPin, Trash2, Edit2, Check, XCircle, History } from 'lucide-react';
import { BookingLegend } from './BookingLegend';

interface RoomBookingsListProps {
  bookings: any[];
  onDelete?: (id: string) => void;
  onEdit?: (booking: any) => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onBookingClick?: (booking: any) => void;
  onShowHistory?: () => void;
}

export function RoomBookingsList({ bookings, onDelete, onEdit, onApprove, onReject, onBookingClick, onShowHistory }: RoomBookingsListProps) {
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  // Filter to show only past 7 days (plus today)
  const filteredBookings = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return bookings.filter((booking) => {
      const bookingDate = new Date(booking.booking_date);
      const dateInRange = bookingDate >= sevenDaysAgo;

      // Apply status filter if set
      if (statusFilter && statusFilter !== 'all') {
        return dateInRange && booking.status === statusFilter;
      }

      return dateInRange;
    }).sort((a, b) => {
      // Parse dates with times
      const dateA = new Date(`${a.booking_date}T${a.start_time || '00:00'}`);
      const dateB = new Date(`${b.booking_date}T${b.start_time || '00:00'}`);

      // Calculate distance from now
      const distA = Math.abs(now.getTime() - dateA.getTime());
      const distB = Math.abs(now.getTime() - dateB.getTime());

      // If one is in future and one is in past, future comes first
      const isAFuture = dateA >= now;
      const isBFuture = dateB >= now;

      if (isAFuture && !isBFuture) return -1; // A is future, B is past → A comes first
      if (!isAFuture && isBFuture) return 1;  // A is past, B is future → B comes first

      // Both in future or both in past → sort by distance (nearest first)
      return distA - distB;
    });
  }, [bookings, statusFilter]);

  const hasOldBookings = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return bookings.some((booking) => {
      const bookingDate = new Date(booking.booking_date);
      return bookingDate < sevenDaysAgo;
    });
  }, [bookings]);

  const formatBookedAt = (value: string) => {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const getRequestedDateDisplay = (createdAt: string) => {
    if (!createdAt) return '—';
    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Hôm nay';
    if (diffDays === 1) return 'Hôm qua';
    if (diffDays < 7) return `${diffDays} ngày trước`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} tuần trước`;
    return `${Math.floor(diffDays / 30)} tháng trước`;
  };

  const statusCounts = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const recentBookings = bookings.filter((booking) => {
      const bookingDate = new Date(booking.booking_date);
      return bookingDate >= sevenDaysAgo;
    });

    return {
      all: recentBookings.length,
      pending: recentBookings.filter(b => b.status === 'pending').length,
      approved: recentBookings.filter(b => b.status === 'approved').length,
      rejected: recentBookings.filter(b => b.status === 'rejected').length,
    };
  }, [bookings]);

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
      <span className={`px-2 sm:px-3 py-1 rounded-full ${config.bg} ${config.text} text-2xs sm:text-xs font-600 whitespace-nowrap`}>
        {config.label}
      </span>
    );
  };

  if (bookings.length === 0) {
    return (
      <div className="bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6 rounded-lg sm:rounded-xl border border-line text-center">
        <Calendar size={32} className="mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-sm sm:text-base text-muted-foreground">Chưa có yêu cầu đặt phòng nào</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* History Button */}
      {hasOldBookings && onShowHistory && (
        <button
          onClick={onShowHistory}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-line text-2xs sm:text-xs font-600 text-muted-foreground hover:text-foreground hover:bg-hover transition-colors"
        >
          <History size={16} />
          <span>Lịch Sử Đặt Phòng</span>
        </button>
      )}

      {/* Status Filter Buttons */}
      <div className="flex flex-wrap gap-2">
        {[
          { value: null, label: `Tất Cả (${statusCounts.all})` },
          { value: 'pending', label: `Chờ Duyệt (${statusCounts.pending})` },
          { value: 'approved', label: `Đã Duyệt (${statusCounts.approved})` },
          { value: 'rejected', label: `Từ Chối (${statusCounts.rejected})` },
        ].map((option) => (
          <button
            key={option.value ?? 'all'}
            onClick={() => setStatusFilter(option.value)}
            className={`px-3 py-1.5 rounded-lg text-2xs sm:text-xs font-600 transition-all whitespace-nowrap ${
              statusFilter === option.value
                ? 'bg-indigo-500/30 border border-indigo-400 text-indigo-300'
                : 'bg-hover border border-line text-muted-foreground hover:bg-hover-strong'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Legend */}
      <BookingLegend variant="inline" className="mb-4" />

      {/* Bookings Table */}
      <div className="bg-slate-900/50 backdrop-blur-sm rounded-lg sm:rounded-xl border border-line overflow-hidden">
      {/* Table Header - Sticky */}
      <div className="hidden md:grid grid-cols-12 gap-4 p-4 border-b border-line-subtle bg-slate-900/95 backdrop-blur sticky top-0 z-10">
        <div className="col-span-2">
          <p className="text-2xs font-600 text-muted-foreground uppercase">Phòng</p>
        </div>
        <div className="col-span-2">
          <p className="text-2xs font-600 text-muted-foreground uppercase">Ngày</p>
        </div>
        <div className="col-span-2">
          <p className="text-2xs font-600 text-muted-foreground uppercase">Giờ</p>
        </div>
        <div className="col-span-2">
          <p className="text-2xs font-600 text-muted-foreground uppercase">Ngày Yêu Cầu</p>
        </div>
        <div className="col-span-1">
          <p className="text-2xs font-600 text-muted-foreground uppercase">Trạng Thái</p>
        </div>
        <div className="col-span-2">
          <p className="text-2xs font-600 text-muted-foreground uppercase">Hành Động</p>
        </div>
        <div className="col-span-1">
          <p className="text-2xs font-600 text-muted-foreground uppercase">Mục Đích</p>
        </div>
      </div>

      {/* Table Rows */}
      {filteredBookings.map((booking) => (
        <div key={booking.id} className="border-b border-line-subtle last:border-b-0 p-3 sm:p-4 hover:bg-hover transition-colors cursor-pointer" onClick={() => onBookingClick?.(booking)}>
          {/* Mobile Card Layout */}
          <div className="md:hidden">
            <div className="flex justify-between items-start mb-3 gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm sm:text-base font-600 text-foreground break-words">{booking.room_name}</h4>
                  {booking.confirmed_at && (
                    <span className="px-2 py-0.5 rounded text-2xs font-600 bg-emerald-500/20 text-emerald-400 whitespace-nowrap">✅</span>
                  )}
                </div>
                <p className="text-2xs sm:text-xs text-muted-foreground mt-1 line-clamp-2">{booking.purpose}</p>
              </div>
              {getStatusBadge(booking.status)}
            </div>

            <div className="space-y-2 mb-3 text-2xs sm:text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar size={14} className="flex-shrink-0" />
                <span>{booking.booking_date}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock size={14} className="flex-shrink-0" />
                <span>{booking.start_time} - {booking.end_time}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground/70">
                <History size={14} className="flex-shrink-0" />
                <span>Đặt lúc: {formatBookedAt(booking.created_at)}</span>
              </div>
            </div>

            <div className="flex gap-2 justify-end flex-wrap">
              {booking.status === 'pending' && onApprove && (
                <button
                  onClick={() => onApprove(booking.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-2xs font-600 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors"
                  title="Chấp nhận"
                >
                  <Check size={14} />
                  Duyệt
                </button>
              )}
              {booking.status === 'pending' && onReject && (
                <button
                  onClick={() => onReject(booking.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-2xs font-600 bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                  title="Từ chối"
                >
                  <XCircle size={14} />
                  Từ Chối
                </button>
              )}
              {onEdit && (
                <button
                  onClick={() => onEdit(booking)}
                  className="p-2 hover:bg-hover-strong rounded-lg transition-colors"
                  title="Chỉnh sửa"
                >
                  <Edit2 size={16} className="text-muted-foreground" />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => onDelete(booking.id)}
                  className="p-2 hover:bg-slate-500/20 rounded-lg transition-colors"
                  title="Hủy"
                >
                  <Trash2 size={16} className="text-ink-muted" />
                </button>
              )}
            </div>
          </div>

          {/* Desktop Grid Layout */}
          <div className="hidden md:grid grid-cols-12 gap-4 items-center">
            <div className="col-span-2 min-w-0 flex items-center gap-2">
              <p className="text-sm font-600 text-foreground truncate">{booking.room_name}</p>
              {booking.confirmed_at && (
                <span className="px-1.5 py-0.5 rounded text-2xs font-600 bg-emerald-500/20 text-emerald-400 whitespace-nowrap">✅</span>
              )}
            </div>
            <div className="col-span-2">
              <p className="text-sm text-muted-foreground">{booking.booking_date}</p>
            </div>
            <div className="col-span-2">
              <p className="text-sm text-muted-foreground">{booking.start_time} - {booking.end_time}</p>
            </div>
            <div className="col-span-2">
              <div className="text-2xs text-muted-foreground">
                <p>{getRequestedDateDisplay(booking.created_at)}</p>
                {booking.created_at && parseInt(getRequestedDateDisplay(booking.created_at)) >= 3 && (
                  <p className="text-amber-400 font-500">• Khẩn cấp</p>
                )}
              </div>
            </div>
            <div className="col-span-1">
              {getStatusBadge(booking.status)}
            </div>
            <div className="col-span-2 flex gap-1.5">
              {booking.status === 'pending' && onApprove && (
                <button
                  onClick={() => onApprove(booking.id)}
                  className="p-1.5 hover:bg-emerald-500/20 rounded-lg transition-colors"
                  title="Chấp nhận"
                >
                  <Check size={14} className="text-emerald-400" />
                </button>
              )}
              {booking.status === 'pending' && onReject && (
                <button
                  onClick={() => onReject(booking.id)}
                  className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors"
                  title="Từ chối"
                >
                  <XCircle size={14} className="text-red-400" />
                </button>
              )}
              {onEdit && (
                <button
                  onClick={() => onEdit(booking)}
                  className="p-1.5 hover:bg-hover-strong rounded-lg transition-colors"
                  title="Chỉnh sửa"
                >
                  <Edit2 size={14} className="text-muted-foreground" />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => onDelete(booking.id)}
                  className="p-1.5 hover:bg-slate-500/20 rounded-lg transition-colors"
                  title="Hủy"
                >
                  <Trash2 size={14} className="text-ink-muted" />
                </button>
              )}
            </div>
            <div className="col-span-1">
              <p className="text-sm text-muted-foreground truncate">{booking.purpose}</p>
            </div>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}
