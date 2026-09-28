'use client';

import { useState } from 'react';
import { X, AlertCircle, Loader } from 'lucide-react';
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface AdminCancelBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: any;
  onConfirm: (reason: string) => Promise<void>;
}

export function AdminCancelBookingModal({
  isOpen,
  onClose,
  booking,
  onConfirm,
}: AdminCancelBookingModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!reason.trim()) {
      setError('Vui lòng nhập lý do hủy');
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm(reason);
      handleClose();
    } catch (err) {
      console.error('Error cancelling booking:', err);
      setError('Lỗi khi hủy booking');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setReason('');
    setError('');
    onClose();
  };

  useEscapeKey(handleClose, isOpen && !!booking);

  if (!isOpen || !booking) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={handleClose}>
      <div className="bg-slate-900/95 backdrop-blur-sm border border-line rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-slate-900/95 border-b border-line p-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-red-400" size={24} />
            <h2 className="text-2xl font-bold text-white">Hủy Booking</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-white/60 hover:text-white/100 p-2 hover:bg-hover-strong rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Warning Message */}
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <p className="text-white/90 flex items-center gap-2">
              <AlertCircle size={18} className="text-red-400" />
              <strong>Bạn có chắc muốn hủy booking này?</strong>
            </p>
            <p className="text-white/70 text-sm mt-2">
              Hành động này sẽ gửi thông báo cho người yêu cầu kèm lý do hủy.
            </p>
          </div>

          {/* Booking Details */}
          <div className="bg-hover p-4 rounded-lg border border-line space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm text-white/70">📍 Phòng:</span>
                <p className="font-medium text-white">{booking.room_name}</p>
              </div>
              <div>
                <span className="text-sm text-white/70">👤 Yêu cầu từ:</span>
                <p className="font-medium text-white">{booking.requested_by_name}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm text-white/70">📅 Ngày:</span>
                <p className="font-medium text-white">
                  {new Date(booking.booking_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </p>
              </div>
              <div>
                <span className="text-sm text-white/70">🕐 Giờ:</span>
                <p className="font-medium text-white">
                  {booking.start_time} - {booking.end_time}
                </p>
              </div>
            </div>
            {booking.purpose && (
              <div>
                <span className="text-sm text-white/70">📝 Mục đích:</span>
                <p className="font-medium text-white">{booking.purpose}</p>
              </div>
            )}
          </div>

          {/* Reason Input */}
          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">
              Lý Do Hủy *
            </label>
            <textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError('');
              }}
              rows={4}
              placeholder="Ví dụ: Phòng không khả dụng, lịch trình thay đổi, yêu cầu hủy từ người dùng..."
              className="w-full px-4 py-2.5 bg-hover border border-line rounded-lg text-white placeholder:text-white/40 focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none transition-colors"
            />
            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
          </div>

          {/* Preview Notification */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <p className="text-xs text-blue-400 mb-3 font-medium">
              📧 Thông báo sẽ gửi:
            </p>
            <div className="text-sm text-blue-200 bg-hover p-3 rounded border border-blue-500/20 space-y-2">
              <p>Xin chào <strong>{booking.requested_by_name}</strong>,</p>
              <p>
                Admin vừa hủy booking phòng <strong>{booking.room_name}</strong> của bạn vào ngày{' '}
                <strong>{new Date(booking.booking_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</strong> lúc{' '}
                <strong>{booking.start_time} - {booking.end_time}</strong>.
              </p>
              {reason.trim() && (
                <p>
                  <strong>Lý do:</strong> {reason}
                </p>
              )}
              {!reason.trim() && (
                <p className="text-white/50 italic">
                  <strong>Lý do:</strong> [Sẽ hiển thị khi bạn nhập]
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-slate-900/95 border-t border-line p-6 flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={isSubmitting || !reason.trim()}
            className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader size={16} className="animate-spin" />
                Đang xử lý...
              </>
            ) : (
              '🚫 Xác Nhận Hủy'
            )}
          </button>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-3 border border-line text-white/90 rounded-lg hover:bg-hover-strong font-medium transition-colors disabled:opacity-50"
          >
            Quay Lại
          </button>
        </div>
      </div>
    </div>
  );
}
