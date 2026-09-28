'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Clock, MapPin, Users, Loader, AlertCircle } from 'lucide-react';
import { TimePickerDesktop } from './TimePickerDesktop';
import { ParticipantsSelector } from './ParticipantsSelector';
import DateInputVN from '@/components/ui/DateInputVN';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

interface AdminEditBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: any;
  rooms: Array<{ id: string; name: string }>;
  allUsers: Array<{ id: string; name: string; email: string }>;
  onSaveAndApprove?: (data: any) => Promise<void>;
  onSave?: (data: any) => Promise<void>;
  onRejectWithNote?: (data: any, reason: string) => Promise<void>;
}

export function AdminEditBookingModal({
  isOpen,
  onClose,
  booking,
  rooms,
  allUsers,
  onSaveAndApprove,
  onSave,
  onRejectWithNote,
}: AdminEditBookingModalProps) {
  const [formData, setFormData] = useState({
    room_name: '',
    booking_date: '',
    start_time: '08:00',
    end_time: '09:00',
    purpose: '',
    num_participants: 1,
    has_online_meeting: false,
    needs_room_setup: false,
    participants: [] as any[],
  });

  const [rejectReason, setRejectReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionType, setActionType] = useState<'save' | 'approve' | 'reject' | null>(null);
  const isFormInitializedRef = useRef(false);

  // Initialize form when modal opens
  useEffect(() => {
    if (!isOpen) return;

    if (!isFormInitializedRef.current && booking) {
      setFormData({
        room_name: booking.room_name || '',
        booking_date: booking.booking_date || '',
        start_time: booking.start_time || '08:00',
        end_time: booking.end_time || '09:00',
        purpose: booking.purpose || '',
        num_participants: booking.num_participants || 1,
        has_online_meeting: booking.has_online_meeting || false,
        needs_room_setup: booking.needs_room_setup || false,
        participants: booking.participants || [],
      });
      setRejectReason('');
      setErrors({});
      setActionType(null);
      isFormInitializedRef.current = true;
    }
  }, [isOpen, booking]);

  const rawClose = useCallback(() => {
    isFormInitializedRef.current = false;
    onClose();
  }, [onClose]);

  // UX chuẩn: ESC + cảnh báo thay đổi chưa lưu
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(rawClose);
  const handleClose = guardedClose;
  useEscapeKey(guardedClose, isOpen);

  const handleStartTimeChange = useCallback((time: string) => {
    setFormData(prev => ({ ...prev, start_time: time }));
  }, []);

  const handleEndTimeChange = useCallback((time: string) => {
    setFormData(prev => ({ ...prev, end_time: time }));
  }, []);

  const handleRoomChange = useCallback((roomName: string) => {
    setFormData(prev => ({ ...prev, room_name: roomName }));
  }, []);

  const handleDateChange = useCallback((date: string) => {
    setFormData(prev => ({ ...prev, booking_date: date }));
  }, []);

  const handlePurposeChange = useCallback((purpose: string) => {
    setFormData(prev => ({ ...prev, purpose }));
  }, []);

  const handleParticipantsChange = useCallback((participants: any[]) => {
    setFormData(prev => ({ ...prev, participants }));
  }, []);

  const handleNumParticipantsChange = useCallback((num: number) => {
    setFormData(prev => ({ ...prev, num_participants: num }));
  }, []);

  const handleOnlineMeetingChange = useCallback((checked: boolean) => {
    setFormData(prev => ({ ...prev, has_online_meeting: checked }));
  }, []);

  const handleRoomSetupChange = useCallback((checked: boolean) => {
    setFormData(prev => ({ ...prev, needs_room_setup: checked }));
  }, []);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.room_name) newErrors.room_name = 'Vui lòng chọn phòng';
    if (!formData.booking_date) newErrors.booking_date = 'Vui lòng chọn ngày';
    if (!formData.purpose) newErrors.purpose = 'Vui lòng nhập mục đích';

    if (formData.start_time >= formData.end_time) {
      newErrors.time = 'Thời gian kết thúc phải sau thời gian bắt đầu';
    }

    if (actionType === 'reject' && !rejectReason.trim()) {
      newErrors.reason = 'Vui lòng nhập lý do từ chối';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveAndApprove = async () => {
    if (!validateForm() || !onSaveAndApprove) return;

    setIsSubmitting(true);
    try {
      await onSaveAndApprove(formData);
      markClean();
      rawClose();
    } catch (error) {
      console.error('Error saving and approving booking:', error);
      setErrors({ submit: 'Lỗi khi lưu và duyệt booking' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSave = async () => {
    if (!validateForm() || !onSave) return;

    setIsSubmitting(true);
    try {
      await onSave(formData);
      markClean();
      rawClose();
    } catch (error) {
      console.error('Error saving booking:', error);
      setErrors({ submit: 'Lỗi khi lưu booking' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!validateForm() || !onRejectWithNote) return;

    setIsSubmitting(true);
    try {
      await onRejectWithNote(formData, rejectReason);
      markClean();
      rawClose();
    } catch (error) {
      console.error('Error rejecting booking:', error);
      setErrors({ submit: 'Lỗi khi từ chối booking' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={guardedClose}>
      <div className="bg-slate-900/95 backdrop-blur-sm border border-line rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-slate-900/95 border-b border-line p-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white">Chỉnh Sửa Booking</h2>
          <button
            onClick={handleClose}
            className="text-white/60 hover:text-white/100 p-2 hover:bg-hover-strong rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6" onChange={markDirty}>
          {/* Booking Info */}
          <div className="bg-hover p-4 rounded-lg border border-line">
            <p className="text-sm text-white/70 mb-2">
              <strong className="text-white">Yêu cầu từ:</strong> {booking?.requested_by_name}
            </p>
            <p className="text-sm text-white/70">
              <strong className="text-white">Trạng thái:</strong> {
                booking?.status === 'approved' ? '✅ Đã Duyệt' :
                booking?.status === 'rejected' ? '❌ Bị Từ Chối' :
                booking?.status === 'cancelled' ? '✓ Đã Hủy' :
                '⏳ Chờ Duyệt'
              }
            </p>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            {/* Room Selection */}
            <div>
              <label className="block text-sm font-medium text-white/90 mb-2">
                <MapPin className="inline mr-2" size={16} />
                Chọn Phòng *
              </label>
              <select
                value={formData.room_name}
                onChange={(e) => handleRoomChange(e.target.value)}
                className="w-full px-4 py-2.5 bg-hover border border-line rounded-lg text-white placeholder:text-white/40 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
              >
                <option value="" className="bg-slate-900">-- Chọn phòng --</option>
                {rooms.map(room => (
                  <option key={room.id} value={room.name} className="bg-slate-900">{room.name}</option>
                ))}
              </select>
              {errors.room_name && <p className="text-red-400 text-sm mt-1">{errors.room_name}</p>}
            </div>

            {/* Date Selection */}
            <div>
              <label className="block text-sm font-medium text-white/90 mb-2">
                📅 Ngày Booking *
              </label>
              <DateInputVN
                value={formData.booking_date}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full px-4 py-2 bg-hover border border-line rounded-lg text-white placeholder:text-white/40 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              {errors.booking_date && <p className="text-red-400 text-sm mt-1">{errors.booking_date}</p>}
            </div>

            {/* Time Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  <Clock className="inline mr-2" size={16} />
                  Giờ Bắt Đầu *
                </label>
                <TimePickerDesktop
                  value={formData.start_time}
                  onChange={handleStartTimeChange}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  <Clock className="inline mr-2" size={16} />
                  Giờ Kết Thúc *
                </label>
                <TimePickerDesktop
                  value={formData.end_time}
                  onChange={handleEndTimeChange}
                />
              </div>
            </div>
            {errors.time && <p className="text-red-500 text-sm">{errors.time}</p>}

            {/* Purpose */}
            <div>
              <label className="block text-sm font-medium text-white/90 mb-2">
                Mục Đích Họp *
              </label>
              <textarea
                value={formData.purpose}
                onChange={(e) => handlePurposeChange(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 bg-hover border border-line rounded-lg text-white placeholder:text-white/40 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Mô tả mục đích sử dụng phòng..."
              />
              {errors.purpose && <p className="text-red-400 text-sm mt-1">{errors.purpose}</p>}
            </div>

            {/* Participants */}
            <div>
              <label className="block text-sm font-medium text-white/90 mb-2">
                <Users className="inline mr-2" size={16} />
                Số Người Tham Dự
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleNumParticipantsChange(Math.max(1, formData.num_participants - 1))}
                  className="px-3 py-1 border border-slate-300 rounded hover:bg-slate-50"
                >
                  −
                </button>
                <span className="w-12 text-center font-medium">{formData.num_participants}</span>
                <button
                  onClick={() => handleNumParticipantsChange(formData.num_participants + 1)}
                  className="px-3 py-1 border border-slate-300 rounded hover:bg-slate-50"
                >
                  +
                </button>
              </div>
            </div>

            {/* Participants Selector */}
            <div>
              <label className="block text-sm font-medium text-white/90 mb-2">
                Mời Người Tham Dự
              </label>
              <ParticipantsSelector
                selectedParticipants={formData.participants}
                onParticipantsChange={handleParticipantsChange}
                allUsers={allUsers}
              />
            </div>

            {/* Online Meeting Checkbox */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="online_meeting"
                checked={formData.has_online_meeting}
                onChange={(e) => handleOnlineMeetingChange(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="online_meeting" className="text-sm text-slate-700">
                Có cuộc họp trực tuyến
              </label>
            </div>

            {/* Room Setup Checkbox */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="room_setup"
                checked={formData.needs_room_setup}
                onChange={(e) => handleRoomSetupChange(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="room_setup" className="text-sm text-slate-700">
                Cần chuẩn bị phòng
              </label>
            </div>
          </div>

          {/* Reject Reason Field (Show only when considering reject) */}
          {actionType === 'reject' && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <label className="block text-sm font-medium text-white/90 mb-2">
                <AlertCircle className="inline mr-2 text-red-500" size={16} />
                Lý Do Từ Chối *
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="Nhập lý do từ chối để gửi thông báo cho người yêu cầu..."
              />
              {errors.reason && <p className="text-red-400 text-sm mt-1">{errors.reason}</p>}
            </div>
          )}

          {/* Error Message */}
          {errors.submit && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-700">
              {errors.submit}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="sticky bottom-0 bg-slate-900/95 border-t border-line p-6 flex gap-3 justify-between">
          {actionType === null ? (
            <>
              <button
                onClick={() => setActionType('reject')}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium transition-colors"
              >
                ❌ Từ Chối & Ghi Chú
              </button>
              <button
                onClick={() => setActionType('save')}
                className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium transition-colors"
              >
                💾 Lưu (Chờ xác nhận)
              </button>
              <button
                onClick={() => setActionType('approve')}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 font-medium transition-colors disabled:opacity-50"
              >
                {isSubmitting && actionType === 'approve' ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader size={16} className="animate-spin" />
                    Đang xử lý...
                  </span>
                ) : (
                  '💾 Lưu & Duyệt Ngay'
                )}
              </button>
              <button
                onClick={handleClose}
                className="px-4 py-2 border border-line text-white/90 rounded-lg hover:bg-hover-strong font-medium transition-colors"
              >
                Quay Lại
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  if (actionType === 'approve') handleSaveAndApprove();
                  else if (actionType === 'save') handleSave();
                  else if (actionType === 'reject') handleReject();
                }}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader size={16} className="animate-spin" />
                    Đang xử lý...
                  </span>
                ) : (
                  actionType === 'approve' ? '✅ Xác Nhận Duyệt' :
                  actionType === 'save' ? '💾 Lưu' :
                  '❌ Xác Nhận Từ Chối'
                )}
              </button>
              <button
                onClick={() => setActionType(null)}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 border border-line text-white/90 rounded-lg hover:bg-hover-strong font-medium transition-colors disabled:opacity-50"
              >
                Quay Lại
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
