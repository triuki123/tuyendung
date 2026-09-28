'use client';

import { useState } from 'react';
import { X, AlertCircle, Loader } from 'lucide-react';
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface CancelBookingModalProps {
  booking: any;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (bookingId: string, reason: string) => Promise<void>;
  currentUser: any;
}

export function CancelBookingModal({
  booking,
  isOpen,
  onClose,
  onConfirm,
  currentUser,
}: CancelBookingModalProps) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEscapeKey(onClose, isOpen && !!booking);

  const handleConfirm = async () => {
    if (!reason.trim()) {
      setError('Vui lòng nhập lý do hủy lịch');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await onConfirm(booking.id, reason);
      setReason('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi khi hủy lịch');
    } finally {
      setIsSubmitting(false);
    }
  };

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
        <div className="bg-slate-900/95 backdrop-blur-sm border border-line rounded-xl shadow-2xl w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-line">
            <div className="flex items-center gap-3">
              <AlertCircle size={20} className="text-red-400" />
              <h2 className="text-lg font-700 text-foreground">Hủy Lịch Họp</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-hover-strong rounded-lg transition-colors"
            >
              <X size={20} className="text-muted-foreground" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* Confirmation Message */}
            <div>
              <p className="text-sm text-foreground">
                Bạn có chắc chắn muốn hủy lịch họp này?
              </p>
              <p className="text-2xs text-muted-foreground mt-2">
                Phòng: <span className="text-foreground font-500">{booking.room_name}</span>
              </p>
              <p className="text-2xs text-muted-foreground">
                Thời gian: <span className="text-foreground font-500">
                  {new Date(booking.booking_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })} • {booking.start_time} - {booking.end_time}
                </span>
              </p>
            </div>

            {/* Reason TextArea */}
            <div>
              <label className="block text-2xs text-muted-foreground uppercase mb-2">
                Lý Do Hủy <span className="text-red-400">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setError('');
                }}
                placeholder="Nhập lý do hủy lịch..."
                className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-line text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-indigo-400/50 focus:ring-1 focus:ring-indigo-400/30 resize-none"
                rows={4}
                disabled={isSubmitting}
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30">
                <p className="text-2xs text-red-400">{error}</p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="border-t border-line p-6 bg-slate-900/50 flex gap-3">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2.5 rounded-lg border border-line text-2xs font-600 text-foreground hover:bg-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Hủy
            </button>

            <button
              onClick={handleConfirm}
              disabled={isSubmitting || !reason.trim()}
              className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-red-600/50 disabled:to-red-700/50 text-2xs font-600 text-white transition-all disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader size={14} className="animate-spin" />
                  <span>Đang hủy...</span>
                </>
              ) : (
                <span>Xác Nhận Hủy</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
