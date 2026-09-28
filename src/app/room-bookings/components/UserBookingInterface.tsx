'use client';

import { useState, useEffect } from 'react';
import { usePersistentView } from '@/hooks/usePersistentView';
import { createRoomBooking, fetchRoomBookings, fetchRooms, createRoom, fetchUsers, fetchParticipants, updateRoomBooking, confirmRoomBooking, cancelRoomBooking } from '@/lib/api-client';
import { useNotification } from '@/lib/useNotification';
import { Plus, X, LayoutGrid, LayoutList, Calendar, History } from 'lucide-react';
import { RoomBookingDashboard } from './RoomBookingDashboard';
import { RoomBookingsList } from './RoomBookingsList';
import { RoomBookingsCalendar } from './RoomBookingsCalendar';
import { RoomBookingsDayView } from './RoomBookingsDayView';
import { RoomBookingFormModal } from './RoomBookingFormModal';
import { BookingDetailModal } from './BookingDetailModal';
import { CancelBookingModal } from './CancelBookingModal';
import { BookingHistoryPanel } from './BookingHistoryPanel';

interface Room {
  id: string;
  name: string;
  capacity: number;
  location: string;
  amenities: string;
}

export function UserBookingInterface() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFormModal, setShowFormModal] = useState(false);
  const [prefillRoom, setPrefillRoom] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [viewMode, setViewMode] = usePersistentView('room_booking_user_view_mode', ['table', 'grid', 'calendar'] as const, 'table');
  const [isMobileView, setIsMobileView] = useState(false);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const { showNotification } = useNotification();

  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobileView(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (userData) {
      const user = JSON.parse(userData);
      setCurrentUser(user);
      loadBookings(user.id);
      loadRooms();
      loadUsers();
    }
  }, []);

  // Đặt nhanh từ quét QR: /room-bookings?bookRoom=<tên phòng> → mở form prefill sẵn phòng.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const room = params.get('bookRoom');
    if (room) {
      setSelectedBooking(null);
      setPrefillRoom(room);
      setShowFormModal(true);
      params.delete('bookRoom');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, []);

  // Reload rooms and users whenever form modal is shown (to sync with RoomManagementInterface)
  useEffect(() => {
    if (showFormModal) {
      loadRooms();
      loadUsers();
    }
  }, [showFormModal]);

  // Auto-initialize default rooms if empty
  useEffect(() => {
    if (rooms.length === 0 && !showFormModal && !loading) {
      const timer = setTimeout(() => {
        initializeDefaultRooms();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [rooms.length, showFormModal, loading]);

  const loadBookings = async (userId: string) => {
    try {
      // Fetch only current user's bookings
      const data = await fetchRoomBookings({ requested_by: userId });
      setBookings(data);
    } catch (error) {
      console.error('Error loading bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRooms = async () => {
    try {
      const data = await fetchRooms();
      setRooms(data);
    } catch (error) {
      console.error('Error loading rooms:', error);
    }
  };

  const loadUsers = async () => {
    try {
      // Fetch participants for room booking (no permission restrictions)
      const data = await fetchParticipants();
      // Exclude only current user from participants list
      const filtered = data.filter((u: any) => u.id !== currentUser?.id);
      setUsers(filtered);
    } catch (error) {
      console.error('Error loading participants:', error);
    }
  };

  const initializeDefaultRooms = async () => {
    try {
      const defaultRooms = [
        {
          id: 'room_a101',
          name: 'Phòng A101',
          capacity: 10,
          location: 'Tầng 1',
          amenities: 'Projector, Whiteboard, WiFi',
        },
        {
          id: 'room_b202',
          name: 'Phòng B202',
          capacity: 20,
          location: 'Tầng 2',
          amenities: 'Projector, Video Conference, WiFi',
        },
        {
          id: 'room_c303',
          name: 'Phòng C303',
          capacity: 30,
          location: 'Tầng 3',
          amenities: 'Large Screen, Video Conference, WiFi, Catering',
        },
      ];

      for (const room of defaultRooms) {
        try {
          await createRoom(room);
        } catch (error) {
          // Room might already exist, continue
        }
      }

      await loadRooms();
    } catch (error) {
      console.error('Error initializing default rooms:', error);
    }
  };

  const checkRoomAvailability = (roomName: string, bookingDate: string, startTime: string, endTime: string): { available: boolean; conflicts: any[] } => {
    // Check if the room is already booked for the same date and overlapping time.
    // CHỈ tính các booking còn hiệu lực; booking ĐÃ HUỶ / BỊ TỪ CHỐI đã nhả khung giờ
    // nên KHÔNG được coi là trùng lịch.
    const conflicts = bookings.filter(booking => {
      if (booking.room_name !== roomName || booking.booking_date !== bookingDate) {
        return false;
      }
      if (booking.status === 'cancelled' || booking.status === 'rejected') {
        return false;
      }

      // Check for time overlap
      const existingStart = booking.start_time;
      const existingEnd = booking.end_time;

      // Time overlap check: !(endTime <= existingStart || startTime >= existingEnd)
      // If this is true, there's an overlap
      return !(endTime <= existingStart || startTime >= existingEnd);
    });

    return {
      available: conflicts.length === 0,
      conflicts: conflicts
    };
  };

  const handleBookingClick = (booking: any) => {
    setSelectedBooking(booking);
    setShowDetailModal(true);
  };

  const handleBookingConfirm = async (bookingId: string) => {
    if (!currentUser) return;

    try {
      setIsProcessing(true);
      await confirmRoomBooking(bookingId, currentUser.id);
      showNotification('✓ Xác nhận phòng họp thành công', 'success');
      setShowDetailModal(false);
      setSelectedBooking(null);
      if (currentUser) {
        loadBookings(currentUser.id);
      }
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Lỗi xác nhận phòng', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBookingEdit = (booking: any) => {
    setSelectedBooking(booking);
    setShowFormModal(true);
    setShowDetailModal(false);
  };

  const handleBookingCancel = (booking: any) => {
    setSelectedBooking(booking);
    setShowCancelModal(true);
    setShowDetailModal(false);
  };

  const handleBookingCancelConfirm = async (bookingId: string, reason: string) => {
    if (!currentUser) return;

    try {
      setIsProcessing(true);
      await cancelRoomBooking(bookingId, currentUser.id, reason);
      showNotification('✓ Hủy lịch họp thành công', 'success');
      setShowCancelModal(false);
      setSelectedBooking(null);
      if (currentUser) {
        loadBookings(currentUser.id);
      }
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Lỗi hủy lịch', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleModalSubmit = async (formData: any) => {
    if (!currentUser) return;

    const isEditMode = selectedBooking !== null;

    try {
      setIsSubmittingForm(true);

      if (isEditMode) {
        // Edit mode: Check for conflicts FIRST (excluding current booking)
        const otherBookings = bookings.filter(b => b.id !== selectedBooking.id);
        const availabilityCheck = otherBookings.filter(booking => {
          if (booking.room_name !== formData.room_name || booking.booking_date !== formData.booking_date) {
            return false;
          }
          const existingStart = booking.start_time;
          const existingEnd = booking.end_time;
          return !(formData.end_time <= existingStart || formData.start_time >= existingEnd);
        });

        if (availabilityCheck.length > 0) {
          const conflictDetails = availabilityCheck
            .map(c => `${c.start_time}-${c.end_time} (${c.status === 'Đã Duyệt' ? 'Đã duyệt' : c.status})`)
            .join(', ');
          const message = `⚠️ Trùng lịch họp!\n\nPhòng "${formData.room_name}" đã bị đặt trong khung giờ:\n${conflictDetails}\n\nVui lòng chọn phòng khác hoặc khung giờ khác.`;
          showNotification(message, 'error');
          throw new Error('Trùng lịch họp');
        }

        // Update booking and reset status to 'pending' for re-approval
        const updated = await updateRoomBooking(selectedBooking.id, {
          room_name: formData.room_name,
          booking_date: formData.booking_date,
          start_time: formData.start_time,
          end_time: formData.end_time,
          purpose: formData.purpose,
          num_participants: formData.num_participants || 1,
          has_online_meeting: formData.has_online_meeting || false,
          needs_room_setup: formData.needs_room_setup || false,
          participants: formData.participants || [],
          status: 'pending', // Reset to pending for re-approval
          confirmed_at: undefined, // Clear confirmation
        });

        // Update bookings in state
        setBookings(bookings.map(b => b.id === selectedBooking.id ? updated : b));
        setSelectedBooking(null);
        setShowFormModal(false);
        showNotification('✓ Cập nhật phòng họp thành công. Đang chờ duyệt lại.', 'success');
      } else {
        // Create mode: check availability and create new booking
        const availabilityCheck = checkRoomAvailability(formData.room_name, formData.booking_date, formData.start_time, formData.end_time);
        if (!availabilityCheck.available) {
          // Build detailed conflict message
          const conflictDetails = availabilityCheck.conflicts
            .map(c => `${c.start_time}-${c.end_time} (${c.status === 'Đã Duyệt' ? 'Đã duyệt' : c.status})`)
            .join(', ');
          const message = `⚠️ Trùng lịch họp!\n\nPhòng "${formData.room_name}" đã bị đặt trong khung giờ:\n${conflictDetails}\n\nVui lòng chọn phòng khác hoặc khung giờ khác.`;
          showNotification(message, 'error');
          throw new Error('Trùng lịch họp');
        }

        const newBooking = {
          room_name: formData.room_name,
          booking_date: formData.booking_date,
          start_time: formData.start_time,
          end_time: formData.end_time,
          purpose: formData.purpose,
          num_participants: formData.num_participants || 1,
          has_online_meeting: formData.has_online_meeting || false,
          needs_room_setup: formData.needs_room_setup || false,
          participants: formData.participants || [],
          requested_by: currentUser.id,
          requested_by_name: currentUser.name,
          status: 'pending' as const,
        };

        const created = await createRoomBooking(newBooking);
        setBookings([...bookings, created]);

        // Notifications are sent from the API endpoint
        setShowFormModal(false);
        showNotification('✓ Đặt phòng thành công', 'success');
      }
    } catch (error) {
      console.error('Error with booking:', error);
      showNotification(error instanceof Error ? error.message : 'Lỗi xử lý đặt phòng', 'error');
      throw error;
    } finally {
      setIsSubmittingForm(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-700 text-foreground">Đặt Phòng Họp</h1>
          <p className="text-2xs sm:text-xs text-muted-foreground mt-1">
            {bookings.length} yêu cầu của bạn
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* View Toggle */}
          <div className="flex bg-slate-900/50 border border-line rounded-lg p-1">
            <button
              onClick={() => setViewMode('table')}
              className={`h-9 px-2 sm:px-3 rounded transition-colors flex items-center gap-1.5 text-2xs sm:text-xs font-600 min-h-[44px] sm:min-h-auto ${
                viewMode === 'table'
                  ? 'bg-hover-strong text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LayoutList size={16} className="sm:hidden" />
              <LayoutList size={14} className="hidden sm:block" />
              <span className="hidden sm:inline">Bảng</span>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`h-9 px-2 sm:px-3 rounded transition-colors flex items-center gap-1.5 text-2xs sm:text-xs font-600 min-h-[44px] sm:min-h-auto ${
                viewMode === 'grid'
                  ? 'bg-hover-strong text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LayoutGrid size={16} className="sm:hidden" />
              <LayoutGrid size={14} className="hidden sm:block" />
              <span className="hidden sm:inline">Lưới</span>
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`h-9 px-2 sm:px-3 rounded transition-colors flex items-center gap-1.5 text-2xs sm:text-xs font-600 min-h-[44px] sm:min-h-auto ${
                viewMode === 'calendar'
                  ? 'bg-hover-strong text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Calendar size={16} className="sm:hidden" />
              <Calendar size={14} className="hidden sm:block" />
              <span className="hidden sm:inline">Lịch</span>
            </button>
          </div>

          {/* Create Button */}
          <button
            onClick={() => setShowFormModal(true)}
            className="flex items-center justify-center gap-2 h-10 px-3 sm:px-4 rounded-lg text-2xs sm:text-xs font-600 bg-indigo-600 hover:bg-indigo-700 text-white transition-colors min-h-[44px]"
          >
            <Plus size={18} className="sm:hidden" />
            <Plus size={16} className="hidden sm:block" />
            <span>Đặt Phòng</span>
          </button>
        </div>
      </div>

      {/* Room Booking Form Modal */}
      <RoomBookingFormModal
        isOpen={showFormModal}
        onClose={() => {
          setShowFormModal(false);
          setSelectedBooking(null);
          setPrefillRoom(null);
        }}
        onSubmit={handleModalSubmit}
        mode={selectedBooking ? 'edit' : 'create'}
        initialData={selectedBooking ?? (prefillRoom ? { room_name: prefillRoom } : undefined)}
        rooms={rooms}
        allUsers={users}
        isLoading={isSubmittingForm}
      />

      {/* Dashboard Cards */}
      {!loading && currentUser && (
        <RoomBookingDashboard bookings={bookings} currentUser={currentUser} />
      )}

      {/* Bookings List/Grid/Calendar */}
      <div>
        <h2 className="text-base sm:text-lg font-600 text-foreground mb-4">
          {viewMode === 'calendar' ? 'Lịch Đặt Phòng' : 'Các Yêu Cầu Của Tôi'}
        </h2>
        {loading ? (
          <div className="flex items-center justify-center h-32 bg-slate-900/50 backdrop-blur-sm rounded-lg border border-line">
            <p className="text-2xs sm:text-xs text-muted-foreground">Đang tải...</p>
          </div>
        ) : (
          <>
            {viewMode === 'calendar' ? (
              isMobileView ? (
                <RoomBookingsDayView
                  bookings={bookings}
                  onBookingClick={handleBookingClick}
                  onShowHistory={() => setShowHistoryPanel(true)}
                />
              ) : (
                <RoomBookingsCalendar
                  bookings={bookings}
                  rooms={rooms}
                  onBookingClick={handleBookingClick}
                  onShowHistory={() => setShowHistoryPanel(true)}
                />
              )
            ) : viewMode === 'table' ? (
              <RoomBookingsList
                bookings={bookings}
                onBookingClick={handleBookingClick}
                onShowHistory={() => setShowHistoryPanel(true)}
              />
            ) : (
              <div className="space-y-4">
                {/* History Button */}
                {bookings.some((b) => {
                  const now = new Date();
                  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                  return new Date(b.booking_date) < sevenDaysAgo;
                }) && (
                  <button
                    onClick={() => setShowHistoryPanel(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-line text-2xs sm:text-xs font-600 text-muted-foreground hover:text-foreground hover:bg-hover transition-colors"
                  >
                    <History size={16} />
                    <span>Lịch Sử Đặt Phòng</span>
                  </button>
                )}

                {/* Grid View */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {bookings.length === 0 ? (
                    <div className="col-span-full bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6 rounded-lg sm:rounded-xl border border-line text-center">
                      <p className="text-2xs sm:text-xs text-muted-foreground">Chưa có yêu cầu đặt phòng nào</p>
                    </div>
                  ) : (
                    bookings.map((booking) => (
                      <div
                        key={booking.id}
                        onClick={() => handleBookingClick(booking)}
                        className="bg-slate-900/50 backdrop-blur-sm p-4 rounded-lg sm:rounded-xl border border-line hover:border-line-strong transition-all flex flex-col cursor-pointer"
                      >
                      <div className="flex justify-between items-start mb-3 gap-2">
                        <h4 className="text-sm font-600 text-foreground flex-1 break-words">{booking.room_name}</h4>
                        <div className="flex flex-col items-end gap-1">
                          {booking.status === 'approved' && booking.confirmed_at && (
                            <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-2xs font-600 whitespace-nowrap">
                              ✓ Đã Xác Nhận
                            </span>
                          )}
                          {booking.status === 'approved' && !booking.confirmed_at && (
                            <span className="px-2 py-1 rounded-full bg-green-500/10 text-green-400 text-2xs font-600 whitespace-nowrap">
                              ✓ Đã Duyệt
                            </span>
                          )}
                          {booking.status === 'pending' && (
                            <span className="px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 text-2xs font-600 whitespace-nowrap">
                              Chờ Duyệt
                            </span>
                          )}
                          {booking.status === 'rejected' && (
                            <span className="px-2 py-1 rounded-full bg-red-500/10 text-red-400 text-2xs font-600 whitespace-nowrap">
                              ✗ Từ Chối
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-2xs sm:text-xs text-muted-foreground line-clamp-2 mb-3">{booking.purpose}</p>
                      <div className="space-y-2 text-2xs sm:text-xs text-muted-foreground border-t border-line-subtle pt-3 flex-1">
                        <p>📅 {booking.booking_date}</p>
                        <p>🕐 {booking.start_time} - {booking.end_time}</p>
                        {booking.created_at && (
                          <p className="text-muted-foreground/70">🕒 Đặt lúc: {new Date(booking.created_at).toLocaleString('vi-VN')}</p>
                        )}
                        {booking.confirmed_at && (
                          <p className="text-emerald-400">✓ Xác nhận: {new Date(booking.confirmed_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                        )}
                      </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Booking Detail Modal */}
      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          isOpen={showDetailModal}
          isAdmin={false}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedBooking(null);
          }}
          onEdit={handleBookingEdit}
          onConfirm={handleBookingConfirm}
          onCancel={handleBookingCancel}
          currentUser={currentUser}
        />
      )}

      {/* Cancel Booking Modal */}
      {selectedBooking && (
        <CancelBookingModal
          booking={selectedBooking}
          isOpen={showCancelModal}
          onClose={() => {
            setShowCancelModal(false);
            setSelectedBooking(null);
          }}
          onConfirm={handleBookingCancelConfirm}
          currentUser={currentUser}
        />
      )}

      {/* Booking History Panel */}
      <BookingHistoryPanel
        bookings={bookings}
        isOpen={showHistoryPanel}
        onClose={() => setShowHistoryPanel(false)}
        onSelectBooking={handleBookingClick}
      />
    </div>
  );
}
