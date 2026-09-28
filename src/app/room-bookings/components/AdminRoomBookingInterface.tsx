'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePersistentView } from '@/hooks/usePersistentView';
import { createRoomBooking, fetchRoomBookings, fetchUsers, updateRoomBooking, deleteRoomBooking, fetchRooms, createRoom, cancelRoomBooking } from '@/lib/api-client';
import { useNotification } from '@/lib/useNotification';
import { Plus, X, LayoutGrid, LayoutList, Check, XCircle, Trash2, Calendar, Edit2 } from 'lucide-react';
import { RoomBookingDashboard } from './RoomBookingDashboard';
import { RoomBookingsList } from './RoomBookingsList';
import { RoomBookingsCalendar } from './RoomBookingsCalendar';
import { RoomBookingsDayView } from './RoomBookingsDayView';
import { RoomBookingSettingsPanel } from './RoomBookingSettingsPanel';
import { BookingDetailModal } from './BookingDetailModal';
import { RoomBookingFormModal } from './RoomBookingFormModal';
import { CancelBookingModal } from './CancelBookingModal';
import { AdminEditBookingModal } from './AdminEditBookingModal';
import { AdminCancelBookingModal } from './AdminCancelBookingModal';
import { AdminRoomBookingFormModal } from './AdminRoomBookingFormModal';
import DateInputVN from '@/components/ui/DateInputVN';

interface Room {
  id: string;
  name: string;
  capacity: number;
  location: string;
  amenities: string;
  status?: 'active' | 'maintenance' | 'closed';
}

export function AdminRoomBookingInterface() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showAdminFormModal, setShowAdminFormModal] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showRoomManagement, setShowRoomManagement] = useState(false);
  const [editingBooking, setEditingBooking] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  // Nhớ chế độ xem đã chọn (Lịch/Bảng/Lưới) qua localStorage
  const [viewMode, setViewMode] = usePersistentView('room_booking_view_mode', ['table', 'grid', 'calendar'] as const, 'calendar');
  const [isMobileView, setIsMobileView] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const { showNotification } = useNotification();

  const [formData, setFormData] = useState({
    room_name: '',
    booking_date: '',
    start_time: '',
    end_time: '',
    purpose: '',
    requested_by: '', // Admin can select who to book for
  });

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
      setFormData(prev => ({ ...prev, requested_by: user.id }));
      loadBookings();
      loadUsers();
      loadRooms();
    }
  }, []);

  // Đặt nhanh từ quét QR: /room-bookings?bookRoom=<tên phòng> → mở form prefill sẵn phòng.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const room = params.get('bookRoom');
    if (room) {
      setFormData(prev => ({ ...prev, room_name: room }));
      setShowForm(true);
      params.delete('bookRoom');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, []);

  // Auto-initialize default rooms if empty
  useEffect(() => {
    if (rooms.length === 0 && !showForm && !loading) {
      const timer = setTimeout(() => {
        initializeDefaultRooms();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [rooms.length, showForm, loading]);

  // Reload rooms whenever form is shown (to sync with RoomManagementInterface)
  useEffect(() => {
    if (showForm) {
      loadRooms();
    }
  }, [showForm]);

  const loadRooms = async () => {
    try {
      const data = await fetchRooms();
      setRooms(data);
    } catch (error) {
      console.error('Error loading rooms:', error);
    }
  };

  const checkRoomAvailability = (roomName: string, bookingDate: string, startTime: string, endTime: string): { available: boolean; conflicts: any[] } => {
    // Booking ĐÃ HUỶ / BỊ TỪ CHỐI đã nhả khung giờ → KHÔNG tính là trùng lịch.
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

  const loadBookings = async () => {
    try {
      // Admin sees all bookings
      const data = await fetchRoomBookings({});
      setBookings(data);
    } catch (error) {
      console.error('Error loading bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await fetchUsers?.();
      if (data) {
        setUsers(data);
      }
    } catch (error) {
      console.error('Error loading users:', error);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.requested_by) {
      showNotification('Vui lòng chọn người đặt phòng', 'error');
      return;
    }

    // Check room availability with detailed conflict information
    const availabilityCheck = checkRoomAvailability(formData.room_name, formData.booking_date, formData.start_time, formData.end_time);
    if (!availabilityCheck.available) {
      // Build detailed conflict message
      const conflictDetails = availabilityCheck.conflicts
        .map(c => `${c.start_time}-${c.end_time} (${c.status === 'Đã Duyệt' ? 'Đã duyệt' : c.status})`)
        .join(', ');
      const message = `⚠️ Trùng lịch họp!\n\nPhòng "${formData.room_name}" đã bị đặt trong khung giờ:\n${conflictDetails}\n\nVui lòng chọn phòng khác hoặc khung giờ khác.`;
      showNotification(message, 'error');
      return;
    }

    try {
      const selectedUser = users.find(u => u.id === formData.requested_by) || currentUser;

      const newBooking = {
        ...formData,
        requested_by: formData.requested_by,
        requested_by_name: selectedUser?.name || 'Unknown',
        status: 'approved' as const, // Admin booking auto-approved
      };

      const created = await createRoomBooking(newBooking);
      setBookings([...bookings, created]);
      setFormData({
        room_name: '',
        booking_date: '',
        start_time: '',
        end_time: '',
        purpose: '',
        requested_by: currentUser?.id || '',
      });
      setShowForm(false);
      showNotification('Đặt phòng thành công', 'success');
    } catch (error) {
      showNotification('Lỗi đặt phòng', 'error');
    }
  };

  const handleApproveBooking = async (id: string) => {
    try {
      await updateRoomBooking(id, { status: 'approved' });
      setBookings(bookings.map(b => (b.id === id ? { ...b, status: 'approved' } : b)));
      showNotification('Đã chấp nhận lệnh đặt phòng', 'success');
    } catch (error) {
      showNotification('Lỗi khi chấp nhận lệnh đặt phòng', 'error');
    }
  };

  const handleRejectBooking = async (id: string) => {
    try {
      await updateRoomBooking(id, { status: 'rejected' });
      setBookings(bookings.map(b => (b.id === id ? { ...b, status: 'rejected' } : b)));
      showNotification('Đã từ chối lệnh đặt phòng', 'success');
    } catch (error) {
      showNotification('Lỗi khi từ chối lệnh đặt phòng', 'error');
    }
  };

  // Xóa CỨNG lệnh đặt phòng (DELETE vĩnh viễn khỏi DB, không lưu history).
  const handleCancelBooking = async (id: string) => {
    if (confirm('Xóa vĩnh viễn lệnh đặt phòng này? Hành động không thể hoàn tác.')) {
      try {
        await deleteRoomBooking(id);
        setBookings(bookings.filter(b => b.id !== id));
        showNotification('Đã xóa lệnh đặt phòng', 'success');
      } catch (error) {
        showNotification(error instanceof Error ? error.message : 'Lỗi khi xóa lệnh đặt phòng', 'error');
      }
    }
  };

  // Xóa VĨNH VIỄN booking đã hủy (cancelled). API yêu cầu super_admin.
  const handleDeleteCancelledBooking = async (id: string) => {
    if (confirm('Xóa vĩnh viễn lệnh đặt phòng đã hủy này? Hành động không thể hoàn tác.')) {
      try {
        await deleteRoomBooking(id);
        setBookings(bookings.filter(b => b.id !== id));
        showNotification('Đã xóa vĩnh viễn lệnh đặt phòng đã hủy', 'success');
      } catch (error) {
        showNotification(error instanceof Error ? error.message : 'Lỗi khi xóa lệnh đặt phòng', 'error');
      }
    }
  };

  const handleEditBooking = (booking: any) => {
    setEditingBooking(booking);
    setFormData({
      room_name: booking.room_name,
      booking_date: booking.booking_date,
      start_time: booking.start_time,
      end_time: booking.end_time,
      purpose: booking.purpose,
      requested_by: booking.requested_by,
    });
    setShowForm(true);
  };

  // Modal handlers for BookingDetailModal
  const handleDetailModalClose = () => {
    setSelectedBooking(null);
    setIsDetailModalOpen(false);
  };

  const handleDetailCancel = (booking: any) => {
    setSelectedBooking(booking);
    setShowCancelModal(true);
    setIsDetailModalOpen(false);
  };

  const handleDetailEdit = (booking: any) => {
    setSelectedBooking(booking);
    setShowFormModal(true);
    setIsDetailModalOpen(false);
  };

  const handleDetailApprove = async (bookingId: string, adminName: string) => {
    try {
      await updateRoomBooking(bookingId, {
        status: 'approved',
        approved_by: adminName
      });
      setBookings(bookings.map(b =>
        b.id === bookingId
          ? { ...b, status: 'approved', approved_by: adminName }
          : b
      ));
      showNotification('Đã chấp nhận lệnh đặt phòng', 'success');
    } catch (error) {
      showNotification('Lỗi khi chấp nhận lệnh đặt phòng', 'error');
    }
  };

  const handleDetailReject = async (bookingId: string, adminName: string, reason?: string) => {
    try {
      await updateRoomBooking(bookingId, {
        status: 'rejected',
        approved_by: adminName,
        cancellation_reason: reason
      });
      setBookings(bookings.map(b =>
        b.id === bookingId
          ? { ...b, status: 'rejected', approved_by: adminName, cancellation_reason: reason }
          : b
      ));
      showNotification('Đã từ chối lệnh đặt phòng', 'success');
    } catch (error) {
      showNotification('Lỗi khi từ chối lệnh đặt phòng', 'error');
    }
  };

  const handleDetailRefresh = async () => {
    // Refresh booking list to get updated data
    try {
      const updated = await fetchRoomBookings();
      setBookings(updated);
      if (selectedBooking) {
        const refreshed = updated.find((b: any) => b.id === selectedBooking.id);
        if (refreshed) {
          setSelectedBooking(refreshed);
        }
      }
    } catch (error) {
      console.error('Error refreshing bookings:', error);
    }
  };

  // Admin Edit Booking Handlers
  const handleAdminSaveAndApprove = async (formData: any) => {
    if (!selectedBooking || !currentUser) return;
    try {
      await updateRoomBooking(selectedBooking.id, {
        ...formData,
        status: 'approved',
        approved_by: currentUser.name,
      });
      showNotification('✓ Cập nhật và duyệt lịch họp thành công', 'success');
      setShowFormModal(false);
      setSelectedBooking(null);
      loadBookings();
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Lỗi cập nhật và duyệt lịch họp', 'error');
    }
  };

  const handleAdminSave = async (formData: any) => {
    if (!selectedBooking || !currentUser) return;
    try {
      await updateRoomBooking(selectedBooking.id, formData);
      showNotification('✓ Cập nhật lịch họp thành công (chờ xác nhận)', 'success');
      setShowFormModal(false);
      setSelectedBooking(null);
      loadBookings();
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Lỗi cập nhật lịch họp', 'error');
    }
  };

  const handleAdminRejectWithNote = async (formData: any, reason: string) => {
    if (!selectedBooking || !currentUser) return;
    try {
      await updateRoomBooking(selectedBooking.id, {
        ...formData,
        status: 'rejected',
        approved_by: currentUser.name,
        cancellation_reason: reason,
      });
      showNotification('✓ Từ chối và cập nhật lịch họp thành công', 'success');
      setShowFormModal(false);
      setSelectedBooking(null);
      loadBookings();
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Lỗi từ chối lịch họp', 'error');
    }
  };

  // Admin Cancel Booking Handler
  const handleAdminCancelBooking = async (reason: string) => {
    if (!selectedBooking || !currentUser) return;
    try {
      await updateRoomBooking(selectedBooking.id, {
        status: 'cancelled',
        cancellation_reason: reason,
      });
      showNotification('✓ Hủy lịch họp thành công', 'success');
      setShowCancelModal(false);
      setSelectedBooking(null);
      loadBookings();
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Lỗi hủy lịch họp', 'error');
    }
  };

  // Admin Create Booking Handler
  const handleAdminCreateBooking = async (formData: any) => {
    try {
      const payload = {
        ...formData,
        requested_by: formData.requested_by || currentUser?.id,
        requested_by_name: users.find(u => u.id === formData.requested_by)?.name || currentUser?.name,
      };
      await createRoomBooking(payload);
      showNotification('✓ Đặt phòng họp thành công (chờ duyệt)', 'success');
      setShowAdminFormModal(false);
      loadBookings();
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Lỗi khi đặt phòng', 'error');
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBooking) return;

    // Check room availability (excluding current booking) with detailed conflict information
    const conflicts = bookings.filter(booking => {
      if (booking.id === editingBooking.id) return false; // Skip current booking
      if (booking.room_name !== formData.room_name || booking.booking_date !== formData.booking_date) {
        return false;
      }
      return !(formData.end_time <= booking.start_time || formData.start_time >= booking.end_time);
    });

    if (conflicts.length > 0) {
      // Build detailed conflict message
      const conflictDetails = conflicts
        .map(c => `${c.start_time}-${c.end_time} (${c.status === 'Đã Duyệt' ? 'Đã duyệt' : c.status})`)
        .join(', ');
      const message = `⚠️ Trùng lịch họp!\n\nPhòng "${formData.room_name}" đã bị đặt trong khung giờ:\n${conflictDetails}\n\nVui lòng chọn phòng khác hoặc khung giờ khác.`;
      showNotification(message, 'error');
      return;
    }

    try {
      await updateRoomBooking(editingBooking.id, {
        room_name: formData.room_name,
        booking_date: formData.booking_date,
        start_time: formData.start_time,
        end_time: formData.end_time,
        purpose: formData.purpose,
      });

      setBookings(
        bookings.map(b =>
          b.id === editingBooking.id
            ? { ...b, ...formData }
            : b
        )
      );

      setEditingBooking(null);
      setFormData({
        room_name: '',
        booking_date: '',
        start_time: '',
        end_time: '',
        purpose: '',
        requested_by: currentUser?.id || '',
      });
      setShowForm(false);
      showNotification('Đã cập nhật lệnh đặt phòng', 'success');
    } catch (error) {
      showNotification('Lỗi khi cập nhật lệnh đặt phòng', 'error');
    }
  };

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-700 text-foreground">Quản Lý Đặt Phòng Họp</h1>
          <p className="text-2xs sm:text-xs text-muted-foreground mt-1">
            {bookings.length} phòng đặt
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* View Toggle */}
          <div className="flex bg-slate-900/50 border border-line rounded-lg p-1">
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
          </div>

          {/* Create Button */}
          <button
            onClick={() => setShowAdminFormModal(true)}
            className="flex items-center justify-center gap-2 h-10 px-3 sm:px-4 rounded-lg text-2xs sm:text-xs font-600 bg-indigo-600 hover:bg-indigo-700 text-white transition-colors min-h-[44px]"
          >
            <Plus size={18} className="sm:hidden" />
            <Plus size={16} className="hidden sm:block" />
            <span>Đặt Phòng</span>
          </button>
        </div>
      </div>

      {/* Form Section */}
      {showForm && (
        <div className="bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6 rounded-lg sm:rounded-xl border border-line">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base sm:text-lg font-600 text-foreground">
              {editingBooking ? 'Sửa Lệnh Đặt Phòng' : 'Đặt Phòng Họp'}
            </h3>
            <button
              onClick={() => {
                setShowForm(false);
                setEditingBooking(null);
                setFormData({
                  room_name: '',
                  booking_date: '',
                  start_time: '',
                  end_time: '',
                  purpose: '',
                  requested_by: currentUser?.id || '',
                });
              }}
              className="p-1 hover:bg-hover-strong rounded-lg transition-colors"
            >
              <X size={18} className="text-muted-foreground" />
            </button>
          </div>

          <form onSubmit={editingBooking ? handleSaveEdit : handleSubmit} className="space-y-4">
            {/* Select User (Admin Feature) - Only when creating new booking */}
            {!editingBooking && (
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">
                  Đặt Cho (Ai)
                </label>
                <select
                  value={formData.requested_by}
                  onChange={(e) => setFormData({ ...formData, requested_by: e.target.value })}
                  className="w-full h-9 sm:h-8 px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500 min-h-[44px] sm:min-h-auto"
                >
                  <option value="">-- Chọn người dùng --</option>
                  <option value={currentUser?.id}>Chính tôi ({currentUser?.name})</option>
                  {users
                    .filter(u => u.id !== currentUser?.id)
                    .map(user => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.role})
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Room Name - Dropdown */}
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Tên Phòng</label>
                <select
                  value={formData.room_name}
                  onChange={(e) => setFormData({ ...formData, room_name: e.target.value })}
                  required
                  className="w-full h-9 sm:h-8 px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500 min-h-[44px] sm:min-h-auto"
                >
                  <option value="">-- Chọn phòng --</option>
                  {rooms.map(room => (
                    <option key={room.id} value={room.name}>
                      {room.name} (Sức chứa: {room.capacity})
                    </option>
                  ))}
                </select>
              </div>

              {/* Booking Date */}
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Ngày Đặt</label>
                <DateInputVN
                  value={formData.booking_date}
                  onChange={(e) => setFormData({ ...formData, booking_date: e.target.value })}
                  required
                  className="w-full h-9 sm:h-8 px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500 min-h-[44px] sm:min-h-auto"
                />
              </div>

              {/* Start Time */}
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Giờ Bắt Đầu</label>
                <input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  required
                  className="w-full h-9 sm:h-8 px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500 min-h-[44px] sm:min-h-auto"
                />
              </div>

              {/* End Time */}
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Giờ Kết Thúc</label>
                <input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  required
                  className="w-full h-9 sm:h-8 px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500 min-h-[44px] sm:min-h-auto"
                />
              </div>
            </div>

            {/* Purpose */}
            <div>
              <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Mục Đích</label>
              <textarea
                value={formData.purpose}
                onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                required
                rows={3}
                className="w-full px-3 py-2 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500 placeholder-muted-foreground/50 resize-none"
                placeholder="Mô tả mục đích sử dụng phòng"
              />
            </div>

            {/* Availability Status */}
            {formData.room_name && formData.booking_date && formData.start_time && formData.end_time && (
              <div>
                {(() => {
                  const availabilityCheck = editingBooking
                    ? (() => {
                        // For edit mode, exclude the current booking being edited
                        const conflicts = bookings.filter(booking => {
                          if (booking.id === editingBooking.id) return false;
                          if (booking.room_name !== formData.room_name || booking.booking_date !== formData.booking_date) {
                            return false;
                          }
                          return !(formData.end_time <= booking.start_time || formData.start_time >= booking.end_time);
                        });
                        return { available: conflicts.length === 0, conflicts: conflicts };
                      })()
                    : checkRoomAvailability(formData.room_name, formData.booking_date, formData.start_time, formData.end_time);

                  if (availabilityCheck.available) {
                    return (
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 flex items-start gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                        <p className="text-2xs sm:text-xs text-emerald-400">✓ Phòng còn trống trong khung giờ này</p>
                      </div>
                    );
                  } else {
                    const conflictDetails = availabilityCheck.conflicts
                      .map(c => `${c.start_time}-${c.end_time}`)
                      .join(', ');
                    return (
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
                        <div className="w-2 h-2 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                        <div className="text-2xs sm:text-xs text-red-400">
                          <p>⚠️ Trùng lịch với các booking: {conflictDetails}</p>
                        </div>
                      </div>
                    );
                  }
                })()}
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="h-10 px-4 rounded-lg text-2xs sm:text-xs font-600 border border-line text-muted-foreground hover:text-foreground hover:bg-hover transition-colors min-h-[44px]"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="h-10 px-4 rounded-lg text-2xs sm:text-xs font-600 bg-indigo-600 hover:bg-indigo-700 text-white transition-colors min-h-[44px]"
              >
                Đặt Phòng
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Dashboard Cards - Show all bookings stats */}
      {!loading && (
        <div className="bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6 rounded-lg sm:rounded-xl border border-line">
          <h2 className="text-base sm:text-lg font-600 text-foreground mb-4">Thống Kê Chung</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            <div className="p-3 rounded-lg bg-blue-500/10 border border-line-subtle">
              <p className="text-2xs font-600 text-muted-foreground uppercase">Tổng Booking</p>
              <p className="text-xl sm:text-2xl font-700 text-blue-400 mt-1">{bookings.length}</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/10 border border-line-subtle">
              <p className="text-2xs font-600 text-muted-foreground uppercase">Chờ Duyệt</p>
              <p className="text-xl sm:text-2xl font-700 text-amber-400 mt-1">
                {bookings.filter(b => b.status === 'pending').length}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-line-subtle">
              <p className="text-2xs font-600 text-muted-foreground uppercase">Đã Duyệt</p>
              <p className="text-xl sm:text-2xl font-700 text-emerald-400 mt-1">
                {bookings.filter(b => b.status === 'approved').length}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-500/10 border border-line-subtle">
              <p className="text-2xs font-600 text-muted-foreground uppercase">Hoàn Tất</p>
              <p className="text-xl sm:text-2xl font-700 text-ink-muted mt-1">
                {bookings.filter(b => b.status === 'completed').length}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-red-500/10 border border-line-subtle">
              <p className="text-2xs font-600 text-muted-foreground uppercase">Từ Chối</p>
              <p className="text-xl sm:text-2xl font-700 text-red-400 mt-1">
                {bookings.filter(b => b.status === 'rejected').length}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-violet-500/10 border border-line-subtle">
              <p className="text-2xs font-600 text-muted-foreground uppercase">Đã Hủy</p>
              <p className="text-xl sm:text-2xl font-700 text-violet-400 mt-1">
                {bookings.filter(b => b.status === 'cancelled').length}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Bookings List/Grid/Calendar */}
      <div>
        <h2 className="text-base sm:text-lg font-600 text-foreground mb-4">Tất Cả Phòng Đặt</h2>
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
                  onBookingClick={(booking) => {
                    setSelectedBooking(booking);
                    setIsDetailModalOpen(true);
                  }}
                />
              ) : (
                <RoomBookingsCalendar
                  bookings={bookings}
                  rooms={rooms}
                  onBookingClick={(booking) => {
                    setSelectedBooking(booking);
                    setIsDetailModalOpen(true);
                  }}
                />
              )
            ) : viewMode === 'table' ? (
              <RoomBookingsList
                bookings={bookings}
                onApprove={handleApproveBooking}
                onReject={handleRejectBooking}
                onDelete={handleCancelBooking}
                /* Bấm "Sửa" hoặc click cả dòng → mở BookingDetailModal (giống Lịch/Lưới),
                   không còn mở AdminRoomBookingFormModal cũ. */
                onEdit={(b) => { setSelectedBooking(b); setIsDetailModalOpen(true); }}
                onBookingClick={(b) => { setSelectedBooking(b); setIsDetailModalOpen(true); }}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {bookings.length === 0 ? (
                  <div className="col-span-full bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6 rounded-lg sm:rounded-xl border border-line text-center">
                    <p className="text-2xs sm:text-xs text-muted-foreground">Chưa có phòng nào được đặt</p>
                  </div>
                ) : (
                  bookings.map((booking) => (
                    <div
                      key={booking.id}
                      className="bg-slate-900/50 backdrop-blur-sm p-4 rounded-lg sm:rounded-xl border border-line hover:border-line-strong transition-all"
                    >
                      <div className="flex justify-between items-start mb-3 gap-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-600 text-foreground break-words">{booking.room_name}</h4>
                          <p className="text-2xs sm:text-xs text-muted-foreground mt-0.5">👤 {booking.requested_by_name}</p>
                        </div>
                        {getStatusBadge(booking.status)}
                      </div>
                      <p className="text-2xs sm:text-xs text-muted-foreground line-clamp-2 mb-3">{booking.purpose}</p>
                      <div className="space-y-2 text-2xs sm:text-xs text-muted-foreground border-t border-line-subtle pt-3 mb-3">
                        <p>📅 {booking.booking_date}</p>
                        <p>🕐 {booking.start_time} - {booking.end_time}</p>
                        {booking.created_at && (
                          <p className="text-muted-foreground/70">🕒 Đặt lúc: {new Date(booking.created_at).toLocaleString('vi-VN')}</p>
                        )}
                      </div>

                      {/* Action Buttons */}
                      {booking.status === 'pending' && (
                        <div className="flex gap-2 justify-end mb-2">
                          <button
                            onClick={() => handleApproveBooking(booking.id)}
                            className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-2xs font-600 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors min-h-[36px]"
                            title="Chấp nhận"
                          >
                            <Check size={14} />
                            <span className="hidden sm:inline">Duyệt</span>
                          </button>
                          <button
                            onClick={() => handleRejectBooking(booking.id)}
                            className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-2xs font-600 bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors min-h-[36px]"
                            title="Từ chối"
                          >
                            <XCircle size={14} />
                            <span className="hidden sm:inline">Từ Chối</span>
                          </button>
                        </div>
                      )}

                      {booking.status !== 'cancelled' && (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => {
                              setSelectedBooking(booking);
                              setIsDetailModalOpen(true);
                            }}
                            className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-2xs font-600 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-colors min-h-[36px]"
                            title="Xem chi tiết"
                          >
                            <Edit2 size={14} />
                            <span className="hidden sm:inline">Chi Tiết</span>
                          </button>
                          <button
                            onClick={() => handleCancelBooking(booking.id)}
                            className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-2xs font-600 bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors min-h-[36px]"
                            title="Xóa vĩnh viễn"
                          >
                            <Trash2 size={14} />
                            <span className="hidden sm:inline">Xóa</span>
                          </button>
                        </div>
                      )}

                      {/* Booking đã hủy: cho phép super_admin xóa vĩnh viễn */}
                      {booking.status === 'cancelled' && currentUser?.role === 'super_admin' && (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleDeleteCancelledBooking(booking.id)}
                            className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-2xs font-600 bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors min-h-[36px]"
                            title="Xóa vĩnh viễn"
                          >
                            <Trash2 size={14} />
                            <span className="hidden sm:inline">Xóa</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Cấu Hình Phòng Họp — chỉ Super Admin (gộp Người Nhận Thông Báo + Quản Lý Phòng) */}
      {currentUser?.role === 'super_admin' && (
        <div className="border-t border-line pt-6">
          <button
            onClick={() => setShowRoomManagement(!showRoomManagement)}
            className="flex items-center justify-center gap-2 h-10 px-4 rounded-lg text-2xs sm:text-xs font-600 bg-slate-900/50 border border-line hover:bg-slate-900/80 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] mb-4"
          >
            {showRoomManagement ? '▼ Ẩn Cấu Hình Phòng Họp' : '⚙️ Cấu Hình Phòng Họp'}
          </button>

          {showRoomManagement && (
            <div className="mt-4">
              <RoomBookingSettingsPanel />
            </div>
          )}
        </div>
      )}

      {/* Booking Detail Modal */}
      {isDetailModalOpen && selectedBooking && (
        <BookingDetailModal
          isOpen={isDetailModalOpen}
          booking={selectedBooking}
          isAdmin={true}
          onClose={handleDetailModalClose}
          onEdit={handleDetailEdit}
          onCancel={handleDetailCancel}
          onApprove={handleDetailApprove}
          onReject={handleDetailReject}
          onRefresh={handleDetailRefresh}
          onConfirm={async () => {}}
          allBookings={bookings}
          currentUser={currentUser}
        />
      )}

      {/* Admin Create Booking Modal */}
      {showAdminFormModal && currentUser && (
        <AdminRoomBookingFormModal
          isOpen={showAdminFormModal}
          onClose={() => setShowAdminFormModal(false)}
          onSubmit={handleAdminCreateBooking}
          mode="create"
          rooms={rooms}
          users={users}
          allUsers={users}
          currentUser={currentUser}
        />
      )}

      {/* Admin Edit Booking Modal */}
      {showFormModal && selectedBooking && currentUser && (
        <AdminEditBookingModal
          isOpen={showFormModal}
          booking={selectedBooking}
          rooms={rooms}
          allUsers={users}
          onClose={() => {
            setShowFormModal(false);
            setSelectedBooking(null);
          }}
          onSaveAndApprove={handleAdminSaveAndApprove}
          onSave={handleAdminSave}
          onRejectWithNote={handleAdminRejectWithNote}
        />
      )}

      {/* Admin Cancel Booking Modal */}
      {showCancelModal && selectedBooking && currentUser && (
        <AdminCancelBookingModal
          isOpen={showCancelModal}
          booking={selectedBooking}
          onClose={() => {
            setShowCancelModal(false);
            setSelectedBooking(null);
          }}
          onConfirm={handleAdminCancelBooking}
        />
      )}
    </div>
  );
}
