'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { X, Clock, MapPin, Users, Check, Edit2, Trash2, Loader, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { BookingDetailHeader } from './BookingDetailHeader';
import { ConflictChecker } from './ConflictChecker';
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface BookingDetailModalProps {
  booking: any;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (booking: any) => void;
  onConfirm: (bookingId: string) => Promise<void>;
  onCancel: (booking: any) => void;
  currentUser: any;
  isAdmin?: boolean;
  onApprove?: (bookingId: string, approvedBy: string) => Promise<void>;
  onReject?: (bookingId: string, rejectedBy: string, reason: string) => Promise<void>;
  onRefresh?: () => void;
  allBookings?: any[];
}

export function BookingDetailModal({
  booking,
  isOpen,
  onClose,
  onEdit,
  onConfirm,
  onCancel,
  currentUser,
  isAdmin = false,
  onApprove,
  onReject,
  onRefresh,
  allBookings = [],
}: BookingDetailModalProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [adminName, setAdminName] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEscapeKey(onClose, isOpen && !!booking);

  // Get admin name from localStorage
  useEffect(() => {
    if (isAdmin && !adminName) {
      const userData = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
      if (userData) {
        try {
          const user = JSON.parse(userData);
          setAdminName(user.name || user.email || 'Admin');
        } catch (error) {
          console.error('Error parsing user data:', error);
          setAdminName('Admin');
        }
      }
    }
  }, [isAdmin, adminName]);

  // Clear messages after 5 seconds
  useEffect(() => {
    if (successMessage || errorMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage('');
        setErrorMessage('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage, errorMessage]);

  // Nút "Xác nhận" hiển thị từ 30' TRƯỚC giờ bắt đầu cho tới KHI KẾT THÚC cuộc họp
  // — để người đặt kịp xác nhận trước (và cả sau) khi phòng tự giải phóng vì no-show.
  // Ẩn nếu đã xác nhận rồi.
  const canConfirmBooking = useMemo(() => {
    if (!booking || booking.status !== 'approved' || booking.confirmed_at) return false;

    const now = new Date();
    const [startHour, startMinute] = booking.start_time.split(':');
    const bookingStart = new Date(booking.booking_date);
    bookingStart.setHours(parseInt(startHour, 10), parseInt(startMinute, 10), 0, 0);
    const [endHour, endMinute] = booking.end_time.split(':');
    const bookingEnd = new Date(booking.booking_date);
    bookingEnd.setHours(parseInt(endHour, 10), parseInt(endMinute, 10), 0, 0);

    const minutesUntilStart = (bookingStart.getTime() - now.getTime()) / 60000;
    // Từ 30' trước giờ bắt đầu → tới hết giờ kết thúc.
    return minutesUntilStart <= 30 && now.getTime() <= bookingEnd.getTime();
  }, [booking]);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirm(booking.id);
      onClose();
    } finally {
      setIsConfirming(false);
    }
  };

  const handleApprove = useCallback(async () => {
    if (!onApprove || !adminName) {
      setErrorMessage('Lỗi: Không thể lấy thông tin admin');
      return;
    }

    setIsApproving(true);
    try {
      await onApprove(booking.id, adminName);
      setSuccessMessage('✅ Đã duyệt lệnh đặt phòng thành công');

      // Refresh data and close modal after a short delay
      setTimeout(() => {
        onRefresh?.();
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Error approving booking:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi khi duyệt lệnh đặt phòng');
    } finally {
      setIsApproving(false);
    }
  }, [booking.id, adminName, onApprove, onRefresh, onClose]);

  const handleReject = useCallback(async () => {
    if (!onReject || !rejectReason.trim()) {
      setErrorMessage('Vui lòng nhập lý do từ chối');
      return;
    }

    if (!adminName) {
      setErrorMessage('Lỗi: Không thể lấy thông tin admin');
      return;
    }

    setIsRejecting(true);
    try {
      await onReject(booking.id, adminName, rejectReason);
      setSuccessMessage('✅ Đã từ chối lệnh đặt phòng');
      setShowRejectForm(false);
      setRejectReason('');

      // Refresh data and close modal after a short delay
      setTimeout(() => {
        onRefresh?.();
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Error rejecting booking:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Lỗi khi từ chối lệnh đặt phòng');
    } finally {
      setIsRejecting(false);
    }
  }, [booking.id, rejectReason, adminName, onReject, onRefresh, onClose]);

  if (!isOpen || !booking) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-900/95 backdrop-blur-sm border border-line rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          {/* Header Component */}
          <BookingDetailHeader booking={booking} onClose={onClose} />

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* Conflict Checker */}
            {allBookings && allBookings.length > 0 && (
              <ConflictChecker
                currentBooking={booking}
                allBookings={allBookings}
              />
            )}

            {/* Purpose */}
            <div className="pt-2">
              <p className="text-2xs text-muted-foreground uppercase mb-1.5">Nội Dung Cuộc Họp</p>
              <p className="text-sm text-foreground bg-slate-800/50 p-3 rounded-lg">{booking.purpose}</p>
            </div>

            {/* Participants */}
            {booking.participants && booking.participants.length > 0 && (
              <div className="pt-2">
                <p className="text-2xs text-muted-foreground uppercase mb-1.5 flex items-center gap-2">
                  <Users size={14} /> Người Tham Dự ({booking.participants.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {booking.participants.map((p: any) => (
                    <div
                      key={p.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/50 text-2xs text-foreground"
                    >
                      {p.name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Requirements */}
            {(booking.num_participants || booking.has_online_meeting || booking.needs_room_setup) && (
              <div className="pt-2 space-y-1.5">
                <p className="text-2xs text-muted-foreground uppercase">Yêu Cầu Bổ Sung</p>
                <div className="space-y-1 text-2xs text-foreground">
                  {booking.num_participants && <p>👥 Số lượng người: {booking.num_participants}</p>}
                  {booking.has_online_meeting && <p>📹 Có họp trực tuyến</p>}
                  {booking.needs_room_setup && <p>🔧 Cần chuẩn bị phòng họp</p>}
                </div>
              </div>
            )}

            {/* Trạng thái xác nhận / nhận phòng */}
            {(booking.confirmed_at || booking.checked_in_at || booking.checked_out_at) && (
              <div className="pt-2 space-y-1.5">
                {/* Chỉ hiện khi CHƯA có check-in — tránh trùng với dòng "Đã nhận phòng" bên dưới */}
                {booking.confirmed_at && !booking.checked_in_at && (
                  <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                    <p className="text-2xs text-emerald-400">
                      ✅ Đã xác nhận sử dụng lúc {new Date(booking.confirmed_at).toLocaleString('vi-VN')}
                    </p>
                  </div>
                )}
                {booking.checked_in_at && (
                  <div className="px-3 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30">
                    <p className="text-2xs text-indigo-300">
                      🚪 Đã nhận phòng (check-in) lúc {new Date(booking.checked_in_at).toLocaleString('vi-VN')}
                    </p>
                  </div>
                )}
                {booking.checked_out_at && (
                  <div className="px-3 py-2 rounded-lg bg-slate-500/10 border border-slate-500/30">
                    <p className="text-2xs text-ink-muted">
                      ✔️ Đã trả phòng (check-out) lúc {new Date(booking.checked_out_at).toLocaleString('vi-VN')}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Cancellation Info */}
            {booking.status === 'cancelled' && booking.cancellation_reason && (
              <div className="pt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30">
                <p className="text-2xs text-red-400 font-500">Lý do hủy:</p>
                <p className="text-2xs text-red-300">{booking.cancellation_reason}</p>
              </div>
            )}

            {/* Approval Timeline */}
            <div className="pt-4 border-t border-line">
              <p className="text-2xs text-muted-foreground uppercase mb-3 font-600">Dòng Thời Gian Duyệt</p>
              <div className="space-y-3">
                {/* Request submitted */}
                <div className="flex gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-2 h-2 rounded-full bg-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-2xs text-muted-foreground">Gửi yêu cầu</p>
                    <p className="text-2xs text-foreground font-500">
                      {booking.created_at ? new Date(booking.created_at).toLocaleString('vi-VN') : 'N/A'}
                    </p>
                  </div>
                </div>

                {/* Được duyệt — hiện khi có mốc duyệt, kể cả sau khi đã xác nhận/nhận phòng */}
                {booking.approval_timestamp && booking.status !== 'rejected' && booking.status !== 'cancelled' && (
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <CheckCircle size={14} className="text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-2xs text-emerald-400 font-500">Được duyệt</p>
                      <p className="text-2xs text-foreground">
                        {new Date(booking.approval_timestamp).toLocaleString('vi-VN')}
                      </p>
                      {booking.approval_by_name && (
                        <p className="text-2xs text-muted-foreground mt-1">
                          bởi <span className="text-foreground font-500">{booking.approval_by_name}</span>
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {booking.status === 'rejected' && booking.approval_timestamp && (
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <XCircle size={14} className="text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-2xs text-red-400 font-500">Bị từ chối</p>
                      <p className="text-2xs text-foreground">
                        {new Date(booking.approval_timestamp).toLocaleString('vi-VN')}
                      </p>
                      {booking.approval_by_name && (
                        <p className="text-2xs text-muted-foreground mt-1">
                          bởi <span className="text-foreground font-500">{booking.approval_by_name}</span>
                        </p>
                      )}
                      {booking.rejection_reason && (
                        <p className="text-2xs text-red-300 mt-2 px-2 py-1 rounded bg-red-500/10 border border-red-500/20">
                          <span className="font-500">Lý do:</span> {booking.rejection_reason}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {booking.status === 'pending' && (
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-2xs text-amber-400 font-500">Đang chờ duyệt</p>
                      <p className="text-2xs text-muted-foreground">Chưa có quyết định</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Success/Error Messages */}
          {(successMessage || errorMessage) && (
            <div className={`border-t border-line p-4 ${successMessage ? 'bg-emerald-500/10 border-b border-emerald-500/30' : 'bg-red-500/10 border-b border-red-500/30'}`}>
              <p className={`text-2xs font-600 ${successMessage ? 'text-emerald-400' : 'text-red-400'}`}>
                {successMessage || errorMessage}
              </p>
            </div>
          )}

          {/* Super Admin Approval Section */}
          {isAdmin && booking.status === 'pending' && (
            <div className="border-t border-line p-6 bg-indigo-500/5 space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle size={16} className="text-indigo-400" />
                <h3 className="text-sm font-700 text-white">Quyết Định Duyệt Lệnh</h3>
              </div>

              {!showRejectForm ? (
                <div className="grid grid-cols-2 gap-3">
                  {/* Approve Button */}
                  <button
                    onClick={handleApprove}
                    disabled={isApproving || successMessage !== ''}
                    className="px-4 py-3 bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-emerald-400 font-600 rounded-lg transition-colors flex items-center justify-center gap-2 text-2xs"
                  >
                    {isApproving ? (
                      <>
                        <Loader size={14} className="animate-spin" />
                        <span>Đang duyệt...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle size={16} />
                        <span>Duyệt Ngay</span>
                      </>
                    )}
                  </button>

                  {/* Reject Button */}
                  <button
                    onClick={() => setShowRejectForm(true)}
                    disabled={isApproving || isRejecting}
                    className="px-4 py-3 bg-red-500/20 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 font-600 rounded-lg transition-colors flex items-center justify-center gap-2 text-2xs"
                  >
                    <XCircle size={16} />
                    <span>Từ Chối</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3 border-t border-line pt-4">
                  <div>
                    <label className="block text-2xs font-600 text-white mb-2">Lý do từ chối (bắt buộc)</label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Nhập lý do từ chối yêu cầu đặt phòng..."
                      className="w-full px-3 py-2.5 bg-slate-800 border border-line rounded-lg text-2xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-red-500/50 focus:bg-slate-800/50 resize-none"
                      rows={3}
                      disabled={isRejecting}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => {
                        setShowRejectForm(false);
                        setRejectReason('');
                        setErrorMessage('');
                      }}
                      disabled={isRejecting}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-foreground font-600 rounded-lg transition-colors text-2xs"
                    >
                      Hủy
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={isRejecting || !rejectReason.trim()}
                      className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 font-600 rounded-lg transition-colors flex items-center justify-center gap-2 text-2xs"
                    >
                      {isRejecting ? (
                        <>
                          <Loader size={12} className="animate-spin" />
                          <span>Đang xử lý...</span>
                        </>
                      ) : (
                        <>
                          <XCircle size={14} />
                          <span>Xác Nhận Từ Chối</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          {booking.status !== 'cancelled' && (
            <div className="border-t border-line p-6 bg-slate-900/50 flex gap-3">
              {/* Confirm Button - only show if within 30 min of start */}
              {canConfirmBooking && (
                <button
                  onClick={handleConfirm}
                  disabled={isConfirming}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-2xs font-600 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isConfirming ? (
                    <>
                      <Loader size={14} className="animate-spin" />
                      <span>Đang xác nhận...</span>
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Xác Nhận Phòng</span>
                    </>
                  )}
                </button>
              )}

              {/* Edit Button */}
              <button
                onClick={() => {
                  // Don't call onClose() here - let parent handle modal state
                  // onClose() would clear selectedBooking before form receives it
                  onEdit(booking);
                }}
                className="flex-1 px-4 py-2.5 rounded-lg border border-line text-2xs font-600 text-foreground hover:bg-hover transition-colors flex items-center justify-center gap-2"
              >
                <Edit2 size={14} />
                <span>Chỉnh Sửa</span>
              </button>

              {/* Cancel Button */}
              <button
                onClick={() => {
                  // Don't call onClose() — it nulls selectedBooking before the
                  // CancelBookingModal can mount. The parent's onCancel handler
                  // already closes the detail modal.
                  onCancel(booking);
                }}
                className="flex-1 px-4 py-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-2xs font-600 text-red-400 hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 size={14} />
                <span>Huỷ Lịch</span>
              </button>
            </div>
          )}

          {/* Close Button for Cancelled Bookings */}
          {booking.status === 'cancelled' && (
            <div className="border-t border-line p-6 bg-slate-900/50">
              <button
                onClick={onClose}
                className="w-full px-4 py-2.5 rounded-lg border border-line text-2xs font-600 text-foreground hover:bg-hover transition-colors"
              >
                Đóng
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
