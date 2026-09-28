'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { X, Clock, MapPin, Users, Loader } from 'lucide-react';
import { TimePickerDesktop } from './TimePickerDesktop';
import { ParticipantsSelector } from './ParticipantsSelector';
import DateInputVN from '@/components/ui/DateInputVN';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

interface RoomBookingFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  initialData?: any;
  mode?: 'create' | 'edit';
  rooms: Array<{ id: string; name: string; capacity?: number; amenities?: string }>;
  allUsers: Array<{ id: string; name: string; email: string }>;
  users?: Array<{ id: string; name: string; email: string; role?: string }>;
  allBookings?: any[];
  currentUser?: any;
  isLoading?: boolean;
}

export function RoomBookingFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  mode = 'create',
  rooms,
  allUsers,
  isLoading = false,
}: RoomBookingFormModalProps) {
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

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isFormInitializedRef = useRef(false);

  // UX chuẩn: ESC + cảnh báo thay đổi chưa lưu
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose, isOpen);

  // Memoized callbacks to prevent unnecessary re-renders
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

  const handleAddParticipant = useCallback((participant: any) => {
    setFormData(prev => ({
      ...prev,
      participants: [...prev.participants, participant],
    }));
  }, []);

  const handleRemoveParticipant = useCallback((participantId: string) => {
    setFormData(prev => ({
      ...prev,
      participants: prev.participants.filter(p => p.id !== participantId),
    }));
  }, []);

  // Initialize form when modal opens or when mode/data changes
  // CRITICAL: Form must reinitialize when switching from create to edit mode (when initialData changes)
  useEffect(() => {
    if (!isOpen) {
      // Reset flag when modal closes so it can initialize fresh next time
      isFormInitializedRef.current = false;
      return;
    }

    // When in edit mode with initialData: ALWAYS reinitialize form with booking data
    if (initialData && mode === 'edit') {
      setFormData({
        room_name: initialData.room_name || '',
        booking_date: initialData.booking_date || '',
        start_time: initialData.start_time || '08:00',
        end_time: initialData.end_time || '09:00',
        purpose: initialData.purpose || '',
        num_participants: initialData.num_participants || 1,
        has_online_meeting: initialData.has_online_meeting || false,
        needs_room_setup: initialData.needs_room_setup || false,
        participants: initialData.participants || [],
      });
      setErrors({});
      return;
    }

    // When in create mode and NOT already initialized: initialize with defaults
    if (mode === 'create' && !isFormInitializedRef.current) {
      // Ưu tiên phòng được prefill (vd quét QR → "Đặt nhanh phòng này"), nếu không lấy phòng đầu.
      const defaultRoomName = initialData?.room_name || (rooms && rooms.length > 0 ? rooms[0].name : '');
      setFormData({
        room_name: defaultRoomName,
        booking_date: new Date().toISOString().split('T')[0],
        start_time: '08:00',
        end_time: '09:00',
        purpose: '',
        num_participants: 1,
        has_online_meeting: false,
        needs_room_setup: false,
        participants: [],
      });
      setErrors({});
      isFormInitializedRef.current = true;
    }
  }, [isOpen, initialData, mode, rooms]);

  // Gợi ý phòng theo số người: phòng nhỏ nhất đủ chứa (right-sizing).
  const roomHint = useMemo(() => {
    const n = formData.num_participants || 0;
    const selected = rooms.find(r => r.name === formData.room_name);
    const cap = selected?.capacity;
    const withCap = rooms.filter(r => typeof r.capacity === 'number' && (r.capacity as number) > 0);
    const fit = withCap.filter(r => (r.capacity as number) >= n).sort((a, b) => (a.capacity as number) - (b.capacity as number));
    const best = fit[0];
    const tooSmall = typeof cap === 'number' && n > cap;
    const oversized = typeof cap === 'number' && cap >= 8 && n > 0 && n <= Math.ceil(cap * 0.4);
    const suggestName = best && best.name !== formData.room_name ? best.name : null;
    return { capacity: cap, tooSmall, oversized, suggestName };
  }, [rooms, formData.room_name, formData.num_participants]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.room_name) newErrors.room_name = 'Vui lòng chọn phòng họp';
    if (!formData.booking_date) newErrors.booking_date = 'Vui lòng chọn ngày đặt phòng';
    if (!formData.start_time) newErrors.start_time = 'Vui lòng chọn giờ bắt đầu';
    if (!formData.end_time) newErrors.end_time = 'Vui lòng chọn giờ kết thúc';
    if (!formData.purpose.trim()) newErrors.purpose = 'Vui lòng nhập nội dung cuộc họp';
    if (formData.num_participants < 1) newErrors.num_participants = 'Số lượng người phải >= 1';

    // Check time validity
    if (formData.start_time && formData.end_time) {
      if (formData.start_time >= formData.end_time) {
        newErrors.end_time = 'Giờ kết thúc phải sau giờ bắt đầu';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      markClean();
      onClose();
    } catch (error) {
      console.error('Error submitting form:', error);
      setErrors({
        submit: error instanceof Error ? error.message : 'Có lỗi xảy ra khi lưu đặt phòng',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
        onClick={guardedClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-900/95 backdrop-blur-sm border border-line rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 flex items-center justify-between p-6 border-b border-line bg-slate-900/95">
            <h2 className="text-xl font-700 text-foreground">
              {mode === 'create' ? '📅 Đặt Phòng Họp Mới' : '✏️ Chỉnh Sửa Đặt Phòng'}
            </h2>
            <button
              onClick={guardedClose}
              disabled={isSubmitting}
              className="p-2 hover:bg-hover-strong rounded-lg transition-colors disabled:opacity-50"
            >
              <X size={20} className="text-muted-foreground" />
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} onChange={markDirty} className="p-6 space-y-5">
            {/* Error Alert */}
            {errors.submit && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-2xs text-red-400">
                {errors.submit}
              </div>
            )}

            {/* Row 1: Room & Date */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Room Name */}
              <div className="space-y-1.5">
                <label className="block text-2xs font-600 text-muted-foreground uppercase">Phòng Họp</label>
                <select
                  value={formData.room_name}
                  onChange={e => handleRoomChange(e.target.value)}
                  disabled={isSubmitting}
                  className={`w-full h-10 px-3 rounded-lg text-2xs border transition-colors ${
                    errors.room_name
                      ? 'border-red-500/50 bg-red-500/5'
                      : 'border-line bg-surface-2 hover:border-line-strong focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50'
                  } text-foreground focus:outline-none disabled:opacity-50`}
                >
                  <option value="">-- Chọn phòng --</option>
                  {rooms.map(room => (
                    <option key={room.id} value={room.name}>
                      {room.name}{room.capacity ? ` · ${room.capacity} chỗ` : ''}
                    </option>
                  ))}
                </select>
                {errors.room_name && <p className="text-2xs text-red-400">{errors.room_name}</p>}
                {/* Gợi ý phòng + right-sizing */}
                {roomHint.tooSmall && (
                  <p className="text-2xs text-red-400 flex items-start gap-1">
                    <Users className="h-3 w-3 mt-0.5 shrink-0" />
                    Phòng chỉ {roomHint.capacity} chỗ nhưng có {formData.num_participants} người.
                    {roomHint.suggestName && <> Gợi ý: <button type="button" onClick={() => handleRoomChange(roomHint.suggestName!)} className="underline font-600 text-indigo-300">{roomHint.suggestName}</button></>}
                  </p>
                )}
                {!roomHint.tooSmall && roomHint.oversized && (
                  <p className="text-2xs text-amber-400 flex items-start gap-1">
                    <Users className="h-3 w-3 mt-0.5 shrink-0" />
                    Phòng {roomHint.capacity} chỗ hơi rộng cho {formData.num_participants} người.
                    {roomHint.suggestName && <> Cân nhắc: <button type="button" onClick={() => handleRoomChange(roomHint.suggestName!)} className="underline font-600 text-indigo-300">{roomHint.suggestName}</button></>}
                  </p>
                )}
              </div>

              {/* Booking Date */}
              <div className="space-y-1.5">
                <label className="block text-2xs font-600 text-muted-foreground uppercase">Ngày Đặt Phòng</label>
                <DateInputVN
                  value={formData.booking_date}
                  onChange={e => handleDateChange(e.target.value)}
                  disabled={isSubmitting}
                  className={`w-full h-10 px-3 rounded-lg text-2xs border transition-colors ${
                    errors.booking_date
                      ? 'border-red-500/50 bg-red-500/5'
                      : 'border-line bg-surface-2 hover:border-line-strong focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50'
                  } text-foreground focus:outline-none disabled:opacity-50`}
                />
                {errors.booking_date && <p className="text-2xs text-red-400">{errors.booking_date}</p>}
              </div>
            </div>

            {/* Row 2: Time Range */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-muted-foreground" />
                <span className="text-2xs font-600 text-muted-foreground uppercase">Thời Gian</span>
              </div>
              {/* Desktop: TimePickerDesktop */}
              <div className="hidden md:grid md:grid-cols-2 gap-4">
                <div>
                  <TimePickerDesktop
                    value={formData.start_time}
                    onChange={handleStartTimeChange}
                    disabled={isSubmitting}
                    label="Giờ Bắt Đầu"
                  />
                </div>
                <div>
                  <TimePickerDesktop
                    value={formData.end_time}
                    onChange={handleEndTimeChange}
                    disabled={isSubmitting}
                    label="Giờ Kết Thúc"
                  />
                </div>
              </div>

              {/* Mobile: Native time input */}
              <div className="md:hidden space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-2xs font-600 text-muted-foreground uppercase">Giờ Bắt Đầu</label>
                  <input
                    type="time"
                    value={formData.start_time}
                    onChange={e => handleStartTimeChange(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full h-10 px-3 rounded-lg text-2xs border border-line bg-surface-2 text-foreground focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-2xs font-600 text-muted-foreground uppercase">Giờ Kết Thúc</label>
                  <input
                    type="time"
                    value={formData.end_time}
                    onChange={e => handleEndTimeChange(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full h-10 px-3 rounded-lg text-2xs border border-line bg-surface-2 text-foreground focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                  />
                </div>
              </div>

              {errors.start_time && <p className="text-2xs text-red-400">{errors.start_time}</p>}
              {errors.end_time && <p className="text-2xs text-red-400">{errors.end_time}</p>}
            </div>

            {/* Row 3: Purpose */}
            <div className="space-y-1.5">
              <label className="block text-2xs font-600 text-muted-foreground uppercase">Nội Dung Cuộc Họp</label>
              <textarea
                value={formData.purpose}
                onChange={e => handlePurposeChange(e.target.value)}
                disabled={isSubmitting}
                rows={3}
                placeholder="Mô tả nội dung cuộc họp..."
                className={`w-full px-3 py-2.5 rounded-lg text-2xs border transition-colors resize-none ${
                  errors.purpose
                    ? 'border-red-500/50 bg-red-500/5'
                    : 'border-line bg-surface-2 hover:border-line-strong focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50'
                } text-foreground placeholder-muted-foreground/50 focus:outline-none disabled:opacity-50`}
              />
              {errors.purpose && <p className="text-2xs text-red-400">{errors.purpose}</p>}
            </div>

            {/* Row 4: Participants */}
            <div className="space-y-2">
              <ParticipantsSelector
                selectedParticipants={formData.participants}
                onAdd={handleAddParticipant}
                onRemove={handleRemoveParticipant}
                allUsers={allUsers}
                disabled={isSubmitting}
              />
            </div>

            {/* Row 5: Number of Participants */}
            <div className="space-y-1.5">
              <label className="block text-2xs font-600 text-muted-foreground uppercase">Số Lượng Người Tham Dự</label>
              <input
                type="number"
                min="1"
                max="100"
                value={formData.num_participants}
                onChange={e => handleNumParticipantsChange(Math.max(1, parseInt(e.target.value, 10)))}
                disabled={isSubmitting}
                className={`w-full h-10 px-3 rounded-lg text-2xs border transition-colors ${
                  errors.num_participants
                    ? 'border-red-500/50 bg-red-500/5'
                    : 'border-line bg-surface-2 hover:border-line-strong focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50'
                } text-foreground focus:outline-none disabled:opacity-50`}
              />
              {errors.num_participants && <p className="text-2xs text-red-400">{errors.num_participants}</p>}
            </div>

            {/* Row 6: Checkboxes */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.has_online_meeting}
                    onChange={e => handleOnlineMeetingChange(e.target.checked)}
                    disabled={isSubmitting}
                    className="w-4 h-4 rounded border border-line-strong bg-surface-2 text-indigo-500 focus:ring-2 focus:ring-indigo-500/50 cursor-pointer disabled:opacity-50"
                  />
                  <span className="text-2xs text-foreground">Có họp trực tuyến</span>
                </label>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.needs_room_setup}
                    onChange={e => handleRoomSetupChange(e.target.checked)}
                    disabled={isSubmitting}
                    className="w-4 h-4 rounded border border-line-strong bg-surface-2 text-indigo-500 focus:ring-2 focus:ring-indigo-500/50 cursor-pointer disabled:opacity-50"
                  />
                  <span className="text-2xs text-foreground">Cần chuẩn bị phòng họp</span>
                </label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={guardedClose}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2.5 rounded-lg border border-line text-2xs font-600 text-foreground hover:bg-hover transition-colors disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isLoading}
                className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-2xs font-600 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting || isLoading ? (
                  <>
                    <Loader size={14} className="animate-spin" />
                    <span>Đang lưu...</span>
                  </>
                ) : (
                  mode === 'create' ? '📅 Đặt Phòng' : '💾 Cập Nhật'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
