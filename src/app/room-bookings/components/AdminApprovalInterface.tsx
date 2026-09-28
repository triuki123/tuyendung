'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePersistentView } from '@/hooks/usePersistentView';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { fetchRoomBookings, updateRoomBookingStatus, confirmRoomBookingUsage, fetchRooms, fetchUsers, fetchParticipants, updateRoomBooking, confirmRoomBooking, cancelRoomBooking } from '@/lib/api-client';
import { useNotification } from '@/lib/useNotification';
import { BookingHistoryPanel } from './BookingHistoryPanel';
import { BookingDetailModal } from './BookingDetailModal';
import { CancelBookingModal } from './CancelBookingModal';
import { RoomBookingFormModal } from './RoomBookingFormModal';
import { BookingLegend } from './BookingLegend';
import { Calendar, Clock, MapPin, Check, X, LayoutGrid, LayoutList, History, Loader2 } from 'lucide-react';
import ErrorState from '@/components/ui/ErrorState';

export function AdminApprovalInterface() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [allBookings, setAllBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [viewMode, setViewMode] = usePersistentView('room_approval_view_mode', ['table', 'grid'] as const, 'grid');
  const [activeTab, setActiveTab] = useState<'approval' | 'confirmed'>('approval');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [confirmationNote, setConfirmationNote] = useState('');
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [rooms, setRooms] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const { showNotification } = useNotification();

  useEffect(() => {
    const userData = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (userData) {
      setCurrentUser(JSON.parse(userData));
    }
  }, []);

  useEffect(() => {
    loadBookings();
    loadRooms();
    loadUsers();
  }, [activeTab]);

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
      const data = await fetchParticipants();
      const filtered = data.filter((u: any) => u.id !== currentUser?.id);
      setUsers(filtered);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const loadBookings = async () => {
    try {
      setLoading(true);
      setLoadError(false);
      // Fetch all bookings first
      const allData = await fetchRoomBookings({});
      setAllBookings(allData);

      // Then filter based on active tab
      if (activeTab === 'approval') {
        // For approval tab, show both pending and approved bookings
        // Super Admin can approve pending bookings or edit/cancel already-approved ones
        const pendingData = await fetchRoomBookings({ status: 'pending' });
        const approvedData = await fetchRoomBookings({ status: 'approved' });
        setBookings([...pendingData, ...approvedData].sort((a, b) => {
          // Sort by date descending (newest first)
          return new Date(b.booking_date).getTime() - new Date(a.booking_date).getTime();
        }));
      } else {
        // For confirmed tab, show completed bookings
        const completedData = await fetchRoomBookings({ status: 'completed' });
        setBookings(completedData);
      }
    } catch (error) {
      console.error('Error loading bookings:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (bookingId: string) => {
    try {
      await updateRoomBookingStatus(bookingId, 'approved', approvalNotes);
      setBookings(bookings.filter(b => b.id !== bookingId));
      setSelectedBooking(null);
      setApprovalNotes('');
      showNotification('Đã duyệt yêu cầu', 'success');
    } catch (error) {
      showNotification('Lỗi khi duyệt yêu cầu', 'error');
    }
  };

  const handleReject = async (bookingId: string) => {
    try {
      await updateRoomBookingStatus(bookingId, 'rejected', approvalNotes);
      setBookings(bookings.filter(b => b.id !== bookingId));
      setSelectedBooking(null);
      setApprovalNotes('');
      showNotification('Đã từ chối yêu cầu', 'success');
    } catch (error) {
      showNotification('Lỗi khi từ chối yêu cầu', 'error');
    }
  };

  const handleConfirmUsage = async (bookingId: string) => {
    if (!currentUser) return;
    try {
      await confirmRoomBookingUsage(bookingId, currentUser.id, confirmationNote);
      setBookings(bookings.filter(b => b.id !== bookingId));
      setSelectedBooking(null);
      setConfirmationNote('');
      showNotification('✓ Đã xác nhận sử dụng phòng', 'success');
      // Reload bookings to update counts
      loadBookings();
    } catch (error) {
      console.error('Error confirming usage:', error);
      showNotification('Lỗi xác nhận sử dụng phòng', 'error');
    }
  };

  // Đóng modal duyệt/xác nhận nội tuyến (X / backdrop / ESC)
  const closeInlineModal = useCallback(() => {
    setSelectedBooking(null);
    setApprovalNotes('');
    setConfirmationNote('');
  }, []);

  // ESC chỉ áp cho 2 modal nội tuyến (duyệt/xác nhận); các modal con tự xử lý ESC riêng.
  const inlineModalOpen = !!selectedBooking && !showDetailModal && !showCancelModal && !showFormModal;
  useEscapeKey(closeInlineModal, inlineModalOpen);

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
      loadBookings();
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
      loadBookings();
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Lỗi hủy lịch', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleModalSubmit = async (formData: any) => {
    if (!currentUser || !selectedBooking) return;

    try {
      setIsProcessing(true);
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
      });

      setBookings(bookings.map(b => b.id === selectedBooking.id ? updated : b));
      setSelectedBooking(null);
      setShowFormModal(false);
      showNotification('✓ Cập nhật phòng họp thành công', 'success');
    } catch (error) {
      console.error('Error updating booking:', error);
      showNotification(error instanceof Error ? error.message : 'Lỗi cập nhật phòng', 'error');
      throw error;
    } finally {
      setIsProcessing(false);
    }
  };

  const pendingCount = bookings.filter(b => b.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-700 text-foreground">Quản Lý Đặt Phòng</h1>
          <p className="text-2xs sm:text-xs text-muted-foreground mt-1">
            {activeTab === 'approval' ? `${pendingCount} yêu cầu chờ duyệt` : 'Các phòng đã xác nhận'}
          </p>
        </div>

        {/* View Toggle & History Button */}
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          {/* History Button */}
          {allBookings.some((b) => {
            const now = new Date();
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            return new Date(b.booking_date) < sevenDaysAgo;
          }) && (
            <button
              onClick={() => setShowHistoryPanel(true)}
              className="flex items-center gap-2 h-10 px-3 sm:px-4 rounded-lg text-2xs sm:text-xs font-600 border border-line text-muted-foreground hover:text-foreground hover:bg-hover transition-colors whitespace-nowrap min-h-[44px] sm:min-h-auto"
            >
              <History size={16} />
              <span className="hidden sm:inline">Lịch Sử</span>
            </button>
          )}

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
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-line">
        <button
          onClick={() => setActiveTab('approval')}
          className={`px-3 sm:px-4 py-2 text-2xs sm:text-xs font-600 border-b-2 transition-colors ${
            activeTab === 'approval'
              ? 'border-indigo-500 text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Chờ Duyệt ({bookings.length})
        </button>
        <button
          onClick={() => setActiveTab('confirmed')}
          className={`px-3 sm:px-4 py-2 text-2xs sm:text-xs font-600 border-b-2 transition-colors ${
            activeTab === 'confirmed'
              ? 'border-indigo-500 text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Đã Xác Nhận
        </button>
      </div>

      {/* Legend */}
      <BookingLegend variant="inline" className="mt-4" />

      {/* Bookings Grid/Table */}
      {loading ? (
        <div className="flex items-center justify-center h-32 bg-slate-900/50 backdrop-blur-sm rounded-lg border border-line">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : loadError ? (
        <div className="bg-slate-900/50 backdrop-blur-sm rounded-lg sm:rounded-xl border border-line">
          <ErrorState onRetry={loadBookings} />
        </div>
      ) : bookings.length === 0 ? (
        <div className="bg-slate-900/50 backdrop-blur-sm p-6 rounded-lg sm:rounded-xl border border-line text-center">
          <Calendar size={32} className="mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm sm:text-base text-muted-foreground">Không có yêu cầu nào chờ duyệt</p>
        </div>
      ) : (
        <div className={viewMode === 'table' ? '' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'}>
          {bookings.map((booking) => (
            <div
              key={booking.id}
              onClick={() => {
                // For pending bookings in approval tab, use old modal
                // For approved bookings, use detail modal with edit/cancel options
                if (activeTab === 'approval' && booking.status === 'pending') {
                  setSelectedBooking(booking);
                } else {
                  handleBookingClick(booking);
                }
              }}
              className={`bg-slate-900/50 backdrop-blur-sm p-4 rounded-lg sm:rounded-xl border transition-all cursor-pointer ${
                selectedBooking?.id === booking.id
                  ? 'border-indigo-500 ring-1 ring-indigo-500/50'
                  : 'border-line hover:border-line-strong'
              }`}
            >
              <div className="flex justify-between items-start gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-600 text-foreground break-words">{booking.room_name}</h4>
                  <p className="text-2xs sm:text-xs text-muted-foreground mt-0.5">👤 {booking.requested_by_name}</p>
                </div>
                <span className={`px-2 py-1 rounded-full text-2xs font-600 whitespace-nowrap ${
                  booking.status === 'pending' ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
                }`}>
                  {booking.status === 'pending' ? 'Chờ Duyệt' : 'Đã Duyệt'}
                </span>
              </div>

              <div className="space-y-2 text-2xs sm:text-xs text-muted-foreground border-t border-line-subtle pt-3">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="flex-shrink-0" />
                  <span>{booking.booking_date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={14} className="flex-shrink-0" />
                  <span>{booking.start_time} - {booking.end_time}</span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin size={14} className="flex-shrink-0 mt-0.5" />
                  <p className="break-words flex-1 line-clamp-2">{booking.purpose}</p>
                </div>
                {booking.created_at && (
                  <div className="flex items-center gap-2 text-muted-foreground/70">
                    <Clock size={14} className="flex-shrink-0" />
                    <span>Đặt lúc: {new Date(booking.created_at).toLocaleString('vi-VN')}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Approval Modal - for approving/rejecting pending bookings */}
      {selectedBooking && activeTab === 'approval' && selectedBooking.status === 'pending' && !showDetailModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={closeInlineModal}>
          <div className="bg-slate-900/95 backdrop-blur-sm rounded-lg sm:rounded-xl border border-line w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-slate-900/95 p-4 sm:p-6 border-b border-line flex justify-between items-center">
              <h3 className="text-base sm:text-lg font-600 text-foreground">Duyệt Yêu Cầu</h3>
              <button
                onClick={() => {
                  setSelectedBooking(null);
                  setApprovalNotes('');
                }}
                className="p-1 hover:bg-hover-strong rounded-lg transition-colors"
              >
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 sm:p-6 space-y-4">
              {/* Booking Details */}
              <div className="space-y-3 pb-4 border-b border-line">
                <div>
                  <p className="text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-1">Phòng</p>
                  <p className="text-sm sm:text-base text-foreground font-500">{selectedBooking.room_name}</p>
                </div>
                <div>
                  <p className="text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-1">Người Yêu Cầu</p>
                  <p className="text-sm sm:text-base text-foreground">{selectedBooking.requested_by_name}</p>
                </div>
                <div>
                  <p className="text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-1">Ngày & Thời Gian</p>
                  <p className="text-sm sm:text-base text-foreground">
                    {selectedBooking.booking_date} ({selectedBooking.start_time} - {selectedBooking.end_time})
                  </p>
                </div>
                <div>
                  <p className="text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-1">Mục Đích</p>
                  <p className="text-sm sm:text-base text-foreground break-words">{selectedBooking.purpose}</p>
                </div>
              </div>

              {/* Notes Input */}
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">
                  Ghi Chú Duyệt (Tùy Chọn)
                </label>
                <textarea
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500 placeholder-muted-foreground/50 resize-none"
                  placeholder="Nhận xét hoặc lý do (nếu có)"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-line">
                <button
                  onClick={() => handleReject(selectedBooking.id)}
                  className="flex items-center justify-center gap-2 h-10 px-4 rounded-lg text-2xs sm:text-xs font-600 bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors min-h-[44px]"
                >
                  <X size={16} className="sm:hidden" />
                  <X size={14} className="hidden sm:block" />
                  <span>Từ Chối</span>
                </button>
                <button
                  onClick={() => handleApprove(selectedBooking.id)}
                  className="flex items-center justify-center gap-2 h-10 px-4 rounded-lg text-2xs sm:text-xs font-600 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors min-h-[44px]"
                >
                  <Check size={16} className="sm:hidden" />
                  <Check size={14} className="hidden sm:block" />
                  <span>Duyệt</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal - for confirming room usage */}
      {selectedBooking && !showDetailModal && activeTab === 'confirmed' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={closeInlineModal}>
          <div className="bg-slate-900/95 backdrop-blur-sm rounded-lg sm:rounded-xl border border-line w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-slate-900/95 p-4 sm:p-6 border-b border-line flex justify-between items-center">
              <h3 className="text-base sm:text-lg font-600 text-foreground">Xác Nhận Sử Dụng</h3>
              <button
                onClick={() => {
                  setSelectedBooking(null);
                  setConfirmationNote('');
                }}
                className="p-1 hover:bg-hover-strong rounded-lg transition-colors"
              >
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 sm:p-6 space-y-4">
              {/* Booking Details */}
              <div className="space-y-3 pb-4 border-b border-line">
                <div>
                  <p className="text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-1">Phòng</p>
                  <p className="text-sm sm:text-base text-foreground font-500">{selectedBooking.room_name}</p>
                </div>
                <div>
                  <p className="text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-1">Người Yêu Cầu</p>
                  <p className="text-sm sm:text-base text-foreground">{selectedBooking.requested_by_name}</p>
                </div>
                <div>
                  <p className="text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-1">Ngày & Thời Gian</p>
                  <p className="text-sm sm:text-base text-foreground">
                    {selectedBooking.booking_date} ({selectedBooking.start_time} - {selectedBooking.end_time})
                  </p>
                </div>
                <div>
                  <p className="text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-1">Mục Đích</p>
                  <p className="text-sm sm:text-base text-foreground break-words">{selectedBooking.purpose}</p>
                </div>
              </div>

              {/* Notes Input */}
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">
                  Ghi Chú Xác Nhận (Tùy Chọn)
                </label>
                <textarea
                  value={confirmationNote}
                  onChange={(e) => setConfirmationNote(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500 placeholder-muted-foreground/50 resize-none"
                  placeholder="Ghi chú về sử dụng phòng (tùy chọn)"
                />
              </div>

              {/* Info Alert */}
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 flex items-start gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                <p className="text-2xs sm:text-xs text-emerald-400">
                  Xác nhận này sẽ được ghi lại trong lịch sử sử dụng phòng
                </p>
              </div>

              {/* Action Button */}
              <div className="flex gap-3 pt-2 border-t border-line">
                <button
                  onClick={() => handleConfirmUsage(selectedBooking.id)}
                  className="w-full flex items-center justify-center gap-2 h-10 px-4 rounded-lg text-2xs sm:text-xs font-600 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors min-h-[44px]"
                >
                  <Check size={16} className="sm:hidden" />
                  <Check size={14} className="hidden sm:block" />
                  <span>Xác Nhận Sử Dụng</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal - View and manage approved bookings */}
      {selectedBooking && showDetailModal && (
        <BookingDetailModal
          booking={selectedBooking}
          isOpen={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedBooking(null);
          }}
          onConfirm={() => handleBookingConfirm(selectedBooking.id)}
          onEdit={() => handleBookingEdit(selectedBooking)}
          onCancel={() => handleBookingCancel(selectedBooking)}
          currentUser={currentUser}
        />
      )}

      {/* Cancel Modal */}
      {selectedBooking && showCancelModal && (
        <CancelBookingModal
          booking={selectedBooking}
          isOpen={showCancelModal}
          onClose={() => {
            setShowCancelModal(false);
            setSelectedBooking(null);
          }}
          onConfirm={(reason) => handleBookingCancelConfirm(selectedBooking.id, reason)}
          currentUser={currentUser}
        />
      )}

      {/* Edit Booking Form Modal */}
      {selectedBooking && showFormModal && (
        <RoomBookingFormModal
          isOpen={showFormModal}
          mode="edit"
          initialData={{
            room_name: selectedBooking.room_name,
            booking_date: selectedBooking.booking_date,
            start_time: selectedBooking.start_time,
            end_time: selectedBooking.end_time,
            purpose: selectedBooking.purpose,
            num_participants: selectedBooking.num_participants || 1,
            has_online_meeting: selectedBooking.has_online_meeting || false,
            needs_room_setup: selectedBooking.needs_room_setup || false,
            participants: selectedBooking.participants || [],
          }}
          onClose={() => {
            setShowFormModal(false);
            setSelectedBooking(null);
          }}
          onSubmit={handleModalSubmit}
          rooms={rooms}
          allUsers={users}
          users={users}
          allBookings={allBookings}
          currentUser={currentUser}
        />
      )}

      {/* History Panel */}
      <BookingHistoryPanel
        bookings={allBookings}
        isOpen={showHistoryPanel}
        onClose={() => setShowHistoryPanel(false)}
        onSelectBooking={(booking) => {
          setSelectedBooking(booking);
          setShowHistoryPanel(false);
        }}
      />
    </div>
  );
}
