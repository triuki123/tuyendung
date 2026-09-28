'use client';

import { Clock, AlertTriangle, Calendar, User } from 'lucide-react';

interface BookingDetailHeaderProps {
  booking: any;
  onClose: () => void;
}

export function BookingDetailHeader({ booking, onClose }: BookingDetailHeaderProps) {
  // Calculate urgency - if pending and >24 hours old
  const getUrgencyStatus = () => {
    if (booking.status !== 'pending') return null;

    const created = new Date(booking.created_at);
    const now = new Date();
    const hoursAgo = (now.getTime() - created.getTime()) / (1000 * 60 * 60);

    if (hoursAgo >= 24) {
      return {
        level: 'critical',
        label: `⚠️ KHẨN CẤP (${Math.floor(hoursAgo)}h)`,
        color: 'text-red-400 bg-red-500/10 border-red-500/30',
      };
    } else if (hoursAgo >= 6) {
      return {
        level: 'high',
        label: `⏰ SẮP HẾT HẠN (${Math.floor(hoursAgo)}h)`,
        color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
      };
    }

    return null;
  };

  // Calculate duration in minutes
  const getDuration = () => {
    const [startHour, startMinute] = booking.start_time.split(':').map(Number);
    const [endHour, endMinute] = booking.end_time.split(':').map(Number);

    const startTotalMinutes = startHour * 60 + startMinute;
    const endTotalMinutes = endHour * 60 + endMinute;

    const durationMinutes = endTotalMinutes - startTotalMinutes;
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;

    if (hours > 0 && minutes > 0) {
      return `${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours} giờ`;
    } else {
      return `${minutes} phút`;
    }
  };

  // Get status color and label
  const getStatusConfig = (status: string) => {
    const configs: any = {
      pending: {
        bg: 'bg-amber-500/20',
        border: 'border-amber-500/30',
        text: 'text-amber-400',
        label: '⏳ Chờ Duyệt',
      },
      approved: {
        bg: 'bg-emerald-500/20',
        border: 'border-emerald-500/30',
        text: 'text-emerald-400',
        label: '✅ Đã Duyệt',
      },
      confirmed: {
        bg: 'bg-emerald-500/20',
        border: 'border-emerald-500/30',
        text: 'text-emerald-400',
        label: '✅ Đã Xác Nhận',
      },
      checked_in: {
        bg: 'bg-indigo-500/20',
        border: 'border-indigo-500/30',
        text: 'text-indigo-300',
        label: '🚪 Đã Nhận Phòng',
      },
      completed: {
        bg: 'bg-slate-500/20',
        border: 'border-slate-500/30',
        text: 'text-ink-muted',
        label: '✔️ Hoàn Tất',
      },
      rejected: {
        bg: 'bg-red-500/20',
        border: 'border-red-500/30',
        text: 'text-red-400',
        label: '❌ Từ Chối',
      },
      cancelled: {
        bg: 'bg-slate-500/20',
        border: 'border-slate-500/30',
        text: 'text-ink-muted',
        label: '✖️ Đã Hủy',
      },
    };

    return configs[status] || configs.pending;
  };

  const urgency = getUrgencyStatus();
  const statusConfig = getStatusConfig(booking.status);
  const duration = getDuration();

  return (
    <div className="sticky top-0 z-20 border-b border-line bg-gradient-to-b from-slate-900/95 to-slate-900/85 backdrop-blur-sm">
      {/* Main Header */}
      <div className="flex items-start justify-between gap-4 p-6">
        <div className="flex-1 min-w-0">
          {/* Room Name */}
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-lg sm:text-xl font-700 text-foreground truncate">
              {booking.room_name}
            </h2>
          </div>

          {/* Date, Time, Duration Row */}
          <div className="flex flex-wrap gap-3 items-center text-2xs sm:text-xs text-muted-foreground mb-3">
            <div className="flex items-center gap-1.5">
              <Calendar size={14} />
              <span>{new Date(booking.booking_date).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <Clock size={14} />
              <span>{booking.start_time} - {booking.end_time}</span>
            </div>

            <div className="px-2 py-1 rounded-full bg-slate-800/50 border border-line">
              <span className="font-500">⏱️ {duration}</span>
            </div>
          </div>

          {/* Requester Info — hiện TÊN người yêu cầu, không hiện UUID */}
          {(booking.requested_by_name || booking.requested_by) && (
            <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              <User size={13} />
              <span>Yêu cầu bởi: <span className="text-foreground font-500">{booking.requested_by_name || booking.requested_by}</span></span>
            </div>
          )}
        </div>

        {/* Status Badge & Close Button */}
        <div className="flex flex-col items-end gap-3">
          <button
            onClick={onClose}
            className="p-2 hover:bg-hover-strong rounded-lg transition-colors text-muted-foreground hover:text-foreground"
            title="Đóng"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          {/* Status Badge */}
          <div className={`px-3 py-1.5 rounded-lg border text-2xs font-600 whitespace-nowrap ${statusConfig.bg} ${statusConfig.border} ${statusConfig.text}`}>
            {statusConfig.label}
          </div>
        </div>
      </div>

      {/* Urgency Indicator */}
      {urgency && (
        <div className={`px-6 py-2.5 border-t border-line flex items-center gap-2 text-2xs font-600 ${urgency.color} bg-slate-800/30`}>
          <AlertTriangle size={16} className="flex-shrink-0" />
          <span>{urgency.label}</span>
        </div>
      )}
    </div>
  );
}
