'use client';

import { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Clock, MapPin, History } from 'lucide-react';
import { BookingLegend } from './BookingLegend';

interface RoomBookingsCalendarProps {
  bookings: any[];
  rooms?: { id: string; name: string }[];
  onBookingClick?: (booking: any) => void;
  onShowHistory?: () => void;
}

export function RoomBookingsCalendar({ bookings, rooms = [], onBookingClick, onShowHistory }: RoomBookingsCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedRooms, setSelectedRooms] = useState<string[]>([]);
  const [isMobileView, setIsMobileView] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobileView(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Get unique rooms from bookings or use provided rooms
  const uniqueRooms = useMemo(() => {
    const roomSet = new Set<string>();
    bookings.forEach(b => roomSet.add(b.room_name));
    const bookingRooms = Array.from(roomSet);
    const providedRoomNames = rooms.map(r => r.name);
    return [...new Set([...bookingRooms, ...providedRoomNames])];
  }, [bookings, rooms]);

  // Auto-select first room if none selected
  const displayRooms = useMemo(() => {
    if (selectedRooms.length === 0 && uniqueRooms.length > 0) {
      setSelectedRooms([uniqueRooms[0]]);
      return [uniqueRooms[0]];
    }
    return selectedRooms.length > 0 ? selectedRooms : uniqueRooms;
  }, [selectedRooms, uniqueRooms]);

  // Get week start (Monday)
  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  };

  const weekStart = getWeekStart(currentDate);

  // Show 1 day on mobile (today), 6 working days on desktop (Mon-Sat, exclude Sunday)
  let weekDays: Date[] = [];

  if (isMobileView) {
    // Mobile: show only today
    weekDays = [new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate())];
  } else {
    // Desktop: show 6 working days (Mon-Sat), always 6 days regardless of weekends
    weekDays = Array.from({ length: 6 }, (_, i) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      return date;
    });
  }

  // Time blocks: Sáng (8-12), Chiều (13-18) - no Trưa to save space
  const timeBlocks = [
    { label: 'Sáng', startHour: 8, endHour: 12 },
    { label: 'Chiều', startHour: 13, endHour: 18 },
  ];

  // All hours for the day (8-12 and 13-18)
  const morningHours = Array.from({ length: 4 }, (_, i) => {
    const hour = 8 + i;
    return `${String(hour).padStart(2, '0')}:00`;
  });

  const afternoonHours = Array.from({ length: 5 }, (_, i) => {
    const hour = 13 + i;
    return `${String(hour).padStart(2, '0')}:00`;
  });

  const allHours = [...morningHours, ...afternoonHours];

  // Slot height in pixels (compact: 30px per hour)
  const slotHeight = 30;

  // Get bookings for a specific room and day
  const getBookingsForSlot = (roomName: string, date: Date) => {
    // Use local date instead of UTC to match booking_date format in database
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const filtered = bookings.filter(
      b => b.room_name === roomName && b.booking_date === dateStr
    );
    return filtered;
  };

  const getStatusColor = (status: string) => {
    const colors: any = {
      pending: 'bg-amber-500/30 border-amber-400',
      approved: 'bg-emerald-500/30 border-emerald-400',
      confirmed: 'bg-emerald-500/30 border-emerald-400',
      checked_in: 'bg-indigo-500/30 border-indigo-400',
      completed: 'bg-slate-500/30 border-slate-400',
      rejected: 'bg-red-500/30 border-red-400',
      cancelled: 'bg-slate-500/30 border-slate-400',
    };
    return colors[status] || colors.pending;
  };

  const getStatusTextColor = (status: string) => {
    const colors: any = {
      pending: 'text-amber-400',
      approved: 'text-emerald-400',
      confirmed: 'text-emerald-400',
      checked_in: 'text-indigo-300',
      completed: 'text-ink-muted',
      rejected: 'text-red-400',
      cancelled: 'text-ink-muted',
    };
    return colors[status] || colors.pending;
  };

  const getStatusLabel = (status: string) => {
    const labels: any = {
      pending: 'Chờ Duyệt',
      approved: 'Đã Duyệt',
      confirmed: 'Đã Xác Nhận',
      checked_in: 'Đã Nhận Phòng',
      completed: 'Hoàn Tất',
      rejected: 'Từ Chối',
      cancelled: 'Đã Hủy',
    };
    return labels[status] || status;
  };

  const formatTime = (timeStr: string) => {
    return timeStr ? timeStr.slice(0, 5) : '';
  };

  const timeToMinutes = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const calculateBookingHeight = (startTime: string, endTime: string) => {
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    return ((end - start) / 60) * slotHeight;
  };

  const calculateBookingTop = (startTime: string) => {
    const startMinutes = timeToMinutes(startTime);
    const firstSlotStart = timeToMinutes('08:00');
    return ((startMinutes - firstSlotStart) / 60) * slotHeight;
  };

  if (uniqueRooms.length === 0) {
    return (
      <div className="bg-slate-900/50 backdrop-blur-sm p-6 rounded-xl border border-line text-center">
        <MapPin size={32} className="mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">Chưa có phòng nào để hiển thị</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-line overflow-hidden flex flex-col">
      {/* Header with navigation and room selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-line">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              const newDate = new Date(currentDate);
              if (isMobileView) {
                // Mobile: navigate by day
                newDate.setDate(newDate.getDate() - 1);
              } else {
                // Desktop: navigate by week
                newDate.setDate(newDate.getDate() - 7);
              }
              setCurrentDate(newDate);
            }}
            className="p-2 hover:bg-hover-strong rounded-lg transition-colors"
          >
            <ChevronLeft size={18} className="text-muted-foreground" />
          </button>
          <h3 className="text-sm font-600 text-foreground min-w-[200px]">
            {isMobileView ? (
              currentDate.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric' })
            ) : (
              <>
                {weekStart.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' })} -
                {weekDays[weekDays.length - 1]?.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric' })}
              </>
            )}
          </h3>
          <button
            onClick={() => {
              const newDate = new Date(currentDate);
              if (isMobileView) {
                // Mobile: navigate by day
                newDate.setDate(newDate.getDate() + 1);
              } else {
                // Desktop: navigate by week
                newDate.setDate(newDate.getDate() + 7);
              }
              setCurrentDate(newDate);
            }}
            className="p-2 hover:bg-hover-strong rounded-lg transition-colors"
          >
            <ChevronRight size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Room Selector */}
          <select
            value={displayRooms[0] || ''}
            onChange={(e) => setSelectedRooms([e.target.value])}
            className="h-9 px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500"
          >
            {uniqueRooms.map(room => (
              <option key={room} value={room}>
                {room}
              </option>
            ))}
          </select>

          {onShowHistory && (
            <button
              onClick={onShowHistory}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-2xs sm:text-xs font-600 border border-line text-muted-foreground hover:text-foreground hover:bg-hover transition-colors whitespace-nowrap"
              title="Lịch sử đặt phòng"
            >
              <History size={14} />
              <span className="hidden sm:inline">Lịch Sử</span>
            </button>
          )}

          <button
            onClick={() => setCurrentDate(new Date())}
            className="text-2xs font-600 px-3 py-1.5 rounded-lg bg-hover-strong hover:bg-white/20 text-muted-foreground transition-colors whitespace-nowrap"
          >
            Hôm nay
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-full">
          {/* Days Header */}
          <div className="flex border-b border-line">
            {/* Room Names Column */}
            <div className="w-24 flex-shrink-0 border-r border-line bg-slate-900/80 p-1.5">
              <div className="text-2xs font-600 text-muted-foreground uppercase line-clamp-1">Phòng</div>
            </div>

            {/* Day Headers */}
            {weekDays.map((date, idx) => {
              const isToday = date.toDateString() === new Date().toDateString();
              return (
                <div
                  key={idx}
                  className={`flex-1 min-w-[128px] border-r border-line p-1.5 text-center ${
                    isToday ? 'bg-indigo-500/10 border-l-2 border-indigo-500' : 'bg-slate-900/50'
                  }`}
                >
                  <div className="text-2xs font-600 text-muted-foreground line-clamp-1 flex items-center justify-center gap-1">
                    {isToday && <span className="text-indigo-400 font-bold">📍</span>}
                    {date.toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric' })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rooms & Time Slots */}
          {displayRooms.map((roomName, roomIdx) => (
            <div key={roomIdx} className="flex border-b border-line last:border-b-0">
              {/* Room Name */}
              <div className="w-24 flex-shrink-0 border-r border-line bg-slate-900/80 p-1.5 sticky left-0 z-10">
                <p className="text-2xs font-600 text-foreground line-clamp-1">{roomName}</p>
              </div>

              {/* Days */}
              {weekDays.map((date, dayIdx) => {
                const today = new Date();
                const isToday = date.toDateString() === today.toDateString();

                return (
                <div
                  key={dayIdx}
                  className={`flex-1 min-w-[128px] border-r border-line relative ${
                    isToday ? 'bg-indigo-500/10 border-l-2 border-l-indigo-500' : ''
                  }`}
                  style={{ minHeight: `${allHours.length * slotHeight}px` }}
                >
                  {/* Time grid background with session labels */}
                  {allHours.map((hour, hourIdx) => {
                    const hourNum = parseInt(hour.split(':')[0]);
                    const blockLabel = timeBlocks.find(
                      block => hourNum >= block.startHour && hourNum < block.endHour
                    )?.label;
                    const isBlockStart = timeBlocks.some(
                      block => hourNum === block.startHour
                    );

                    return (
                      <div
                        key={hourIdx}
                        className={`relative group ${
                          isBlockStart ? 'border-t-2 border-indigo-500/50' : 'border-b border-line-subtle'
                        }`}
                        style={{ height: `${slotHeight}px` }}
                      >
                        {isBlockStart && (
                          <div className="absolute top-0.5 left-0 text-2xs font-600 text-indigo-400 px-1 py-0.5 bg-slate-900/80 rounded">
                            {blockLabel}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Bookings for this room & day */}
                  <div className="absolute inset-0 p-1">
                    {getBookingsForSlot(roomName, date).map((booking, bookingIdx) => {
                      const top = calculateBookingTop(booking.start_time);
                      const height = calculateBookingHeight(booking.start_time, booking.end_time);

                      return (
                        <div
                          key={bookingIdx}
                          onClick={() => onBookingClick?.(booking)}
                          style={{
                            top: `${top}px`,
                            height: `${Math.max(height, 40)}px`,
                          }}
                          className={`absolute left-1 right-1 rounded-lg border border-line-strong p-1.5 cursor-pointer hover:border-white/40 transition-all overflow-hidden ${getStatusColor(
                            booking.status
                          )} ${booking.status === 'pending' ? 'shadow-lg shadow-amber-500/20' : ''}`}
                          title={`${booking.purpose}\n${booking.start_time}-${booking.end_time}${booking.created_at ? `\nĐặt lúc: ${new Date(booking.created_at).toLocaleString('vi-VN')}` : ''}${booking.confirmed_at ? '\n✅ Đã xác nhận' : ''}`}
                        >
                          <div className="text-2xs font-600 leading-tight break-words">
                            <div className={`${getStatusTextColor(booking.status)} font-bold flex items-center justify-between gap-1`}>
                              <span>{formatTime(booking.start_time)} - {formatTime(booking.end_time)}</span>
                              {booking.confirmed_at && <span className="text-emerald-400 bg-emerald-500/20 px-1 py-0 rounded text-2xs">✅</span>}
                            </div>
                            <div className="text-white/80 mt-0.5 line-clamp-2">{booking.purpose}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend - using BookingLegend component */}
      <BookingLegend variant="grid" />
    </div>
  );
}
