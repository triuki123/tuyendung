'use client';

import React from 'react';
import { AlertTriangle, CheckCircle, Clock } from 'lucide-react';

interface TimeSlot {
  start: number;
  end: number;
  label: string;
}

interface ConflictCheckerProps {
  currentBooking: any;
  allBookings: any[];
  onConflictChange?: (hasConflict: boolean) => void;
}

export function ConflictChecker({
  currentBooking,
  allBookings,
  onConflictChange,
}: ConflictCheckerProps) {
  // Parse time string to minutes since midnight
  const timeToMinutes = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Get conflicts for current room on current date
  const getConflicts = () => {
    const currentStart = timeToMinutes(currentBooking.start_time);
    const currentEnd = timeToMinutes(currentBooking.end_time);

    const conflicts = allBookings.filter((booking) => {
      // Skip current booking
      if (booking.id === currentBooking.id) return false;

      // Only check same room and same date
      if (
        booking.room_name !== currentBooking.room_name ||
        booking.booking_date !== currentBooking.booking_date
      ) {
        return false;
      }

      // Skip cancelled and rejected bookings
      if (booking.status === 'cancelled' || booking.status === 'rejected') {
        return false;
      }

      // Check for time overlap
      const bookingStart = timeToMinutes(booking.start_time);
      const bookingEnd = timeToMinutes(booking.end_time);

      // Overlap if: (start < other.end) AND (end > other.start)
      const hasOverlap = currentStart < bookingEnd && currentEnd > bookingStart;
      return hasOverlap;
    });

    return conflicts;
  };

  // Get all bookings for timeline visualization
  const getTimelineSlots = (): TimeSlot[] => {
    const slots: TimeSlot[] = [];
    const relevantBookings = allBookings.filter(
      (b) =>
        b.room_name === currentBooking.room_name &&
        b.booking_date === currentBooking.booking_date &&
        b.status !== 'cancelled' &&
        b.status !== 'rejected'
    );

    // Add current booking
    slots.push({
      start: timeToMinutes(currentBooking.start_time),
      end: timeToMinutes(currentBooking.end_time),
      label: `📌 Yêu cầu hiện tại (${currentBooking.start_time} - ${currentBooking.end_time})`,
    });

    // Add other bookings
    relevantBookings.forEach((booking) => {
      if (booking.id !== currentBooking.id) {
        slots.push({
          start: timeToMinutes(booking.start_time),
          end: timeToMinutes(booking.end_time),
          label: `${booking.status === 'pending' ? '⏳' : '✅'} ${booking.start_time} - ${booking.end_time}`,
        });
      }
    });

    // Sort by start time
    return slots.sort((a, b) => a.start - b.start);
  };

  const conflicts = getConflicts();
  const timelineSlots = getTimelineSlots();

  // Notify parent of conflict status
  React.useEffect(() => {
    onConflictChange?.(conflicts.length > 0);
  }, [conflicts.length, onConflictChange]);

  // Generate timeline visualization (24 hours)
  const TimelineBar = () => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const minutesInDay = 24 * 60;

    return (
      <div className="space-y-2 min-w-0">
        {/* Hour markers — nhãn thưa (mỗi 3 giờ) + cho co lại để KHÔNG tràn ngang */}
        <div className="flex text-2xs text-muted-foreground overflow-hidden">
          {hours.map((h) => (
            <div key={h} className="flex-1 min-w-0 text-center truncate">
              {h % 3 === 0 ? `${h.toString().padStart(2, '0')}h` : ''}
            </div>
          ))}
        </div>

        {/* Timeline bar */}
        <div className="relative h-12 bg-slate-800 rounded-lg border border-line overflow-hidden">
          {/* Hour dividers */}
          {hours.map((h) => (
            <div
              key={`divider-${h}`}
              className="absolute top-0 bottom-0 w-px bg-hover"
              style={{ left: `${(h / 24) * 100}%` }}
            />
          ))}

          {/* Booking slots */}
          {timelineSlots.map((slot, idx) => {
            const startPercent = (slot.start / minutesInDay) * 100;
            const widthPercent = ((slot.end - slot.start) / minutesInDay) * 100;
            const isCurrentBooking = slot.label.includes('📌');
            const hasConflict = conflicts.some(
              (c) =>
                timeToMinutes(c.start_time) === slot.start &&
                timeToMinutes(c.end_time) === slot.end
            );

            return (
              <div
                key={idx}
                className={`absolute top-0 bottom-0 border-l-2 flex items-center px-1 text-2xs font-600 text-white overflow-hidden ${
                  isCurrentBooking
                    ? 'bg-indigo-500/30 border-indigo-500'
                    : hasConflict
                      ? 'bg-red-500/40 border-red-500'
                      : 'bg-emerald-500/30 border-emerald-500'
                }`}
                style={{
                  left: `${startPercent}%`,
                  width: `${widthPercent}%`,
                }}
                title={slot.label}
              >
                <span className="truncate">{slot.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="border-t border-line pt-4">
      {/* Title */}
      <div className="flex items-center gap-2 mb-3">
        <Clock size={16} className="text-indigo-400" />
        <h3 className="text-sm font-700 text-white">Kiểm Tra Xung Đột Phòng</h3>
      </div>

      {/* Conflict Alert */}
      {conflicts.length > 0 ? (
        <div className="mb-4 p-3 rounded-lg border border-red-500/30 bg-red-500/10">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-2xs font-600 text-red-400 mb-1.5">
                ⚠️ Phát hiện {conflicts.length} xung đột thời gian:
              </p>
              <div className="space-y-1">
                {conflicts.map((conflict, idx) => (
                  <p key={idx} className="text-2xs text-red-300">
                    • <span className="font-500">{conflict.start_time} - {conflict.end_time}</span> ({conflict.status === 'pending' ? 'Chờ duyệt' : 'Đã duyệt'})
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-4 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-emerald-400" />
            <p className="text-2xs font-600 text-emerald-400">✅ Không có xung đột - Phòng khả dụng</p>
          </div>
        </div>
      )}

      {/* Timeline */}
      {timelineSlots.length > 0 && (
        <div className="space-y-2">
          <p className="text-2xs text-muted-foreground font-600">Timeline ngày {currentBooking.booking_date}:</p>
          <TimelineBar />
          <p className="text-2xs text-muted-foreground mt-2">
            Huyền: 📌 Yêu cầu hiện tại • ✅ Đã duyệt • ⏳ Chờ duyệt
          </p>
        </div>
      )}

      {/* No other bookings */}
      {timelineSlots.length === 1 && (
        <p className="text-2xs text-muted-foreground italic">
          Phòng {currentBooking.room_name} không có lịch đặt khác vào ngày này.
        </p>
      )}
    </div>
  );
}
