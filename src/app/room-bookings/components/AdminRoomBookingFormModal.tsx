'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { X, Clock, MapPin, Users, Loader, Search, ChevronDown } from 'lucide-react';
import { TimePickerDesktop } from './TimePickerDesktop';
import { ParticipantsSelector } from './ParticipantsSelector';
import DateInputVN from '@/components/ui/DateInputVN';
import { includesVN } from '@/lib/utils/searchVN';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

interface AdminRoomBookingFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  initialData?: any;
  mode?: 'create' | 'edit';
  rooms: Array<{ id: string; name: string; capacity: number }>;
  users: Array<{ id: string; name: string; email: string; role: string }>;
  allUsers: Array<{ id: string; name: string; email: string }>;
  currentUser: any;
  isLoading?: boolean;
}

export function AdminRoomBookingFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  mode = 'create',
  rooms,
  users,
  allUsers,
  currentUser,
  isLoading = false,
}: AdminRoomBookingFormModalProps) {
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
    requested_by: currentUser?.id || '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const isFormInitializedRef = useRef(false);

  // Close dropdown when clicking outside or modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowUserDropdown(false);
      setSearchQuery('');
    }
  }, [isOpen]);

  // Initialize form when modal opens
  useEffect(() => {
    if (!isOpen) {
      isFormInitializedRef.current = false;
      return;
    }

    if (!isFormInitializedRef.current) {
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
          requested_by: initialData.requested_by || currentUser?.id || '',
        });
      } else {
        setFormData({
          room_name: '',
          booking_date: '',
          start_time: '08:00',
          end_time: '09:00',
          purpose: '',
          num_participants: 1,
          has_online_meeting: false,
          needs_room_setup: false,
          participants: [],
          requested_by: currentUser?.id || '',
        });
      }
      setErrors({});
      isFormInitializedRef.current = true;
    }
  }, [isOpen, initialData, mode, currentUser]);

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

  const handleRequestedByChange = useCallback((userId: string) => {
    setFormData(prev => ({ ...prev, requested_by: userId }));
    setShowUserDropdown(false);
    setSearchQuery('');
  }, []);

  // Filter users based on search query
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) {
      return users.filter(u => u.id !== currentUser?.id);
    }
    return users.filter(u =>
      u.id !== currentUser?.id &&
      (includesVN(u.name, searchQuery) ||
       includesVN(u.role, searchQuery) ||
       includesVN(u.email, searchQuery))
    );
  }, [searchQuery, users, currentUser?.id]);

  // Get selected user name
  const selectedUserName = useMemo(() => {
    if (!formData.requested_by) return '';
    if (formData.requested_by === currentUser?.id) return currentUser?.name;
    return users.find(u => u.id === formData.requested_by)?.name || '';
  }, [formData.requested_by, users, currentUser]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.room_name) newErrors.room_name = 'Vui lòng chọn phòng';
    if (!formData.booking_date) newErrors.booking_date = 'Vui lòng chọn ngày';
    if (!formData.purpose) newErrors.purpose = 'Vui lòng nhập mục đích';
    if (!formData.requested_by) newErrors.requested_by = 'Vui lòng chọn người dùng';

    if (formData.start_time >= formData.end_time) {
      newErrors.time = 'Thời gian kết thúc phải sau thời gian bắt đầu';
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
      rawClose();
    } catch (error) {
      console.error('Error submitting form:', error);
      setErrors({ submit: error instanceof Error ? error.message : 'Lỗi khi đặt phòng' });
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
          <h2 className="text-2xl font-bold text-white">
            {mode === 'edit' ? 'Sửa Lệnh Đặt Phòng' : 'Đặt Phòng Họp'}
          </h2>
          <button
            onClick={handleClose}
            className="text-white/60 hover:text-white/100 p-2 hover:bg-hover-strong rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <form onSubmit={handleSubmit} onChange={markDirty} className="space-y-6">
            {/* Admin Only: Đặt Cho (Search + Dropdown) */}
            <div className="relative">
              <label className="block text-sm font-medium text-white/90 mb-2">
                👤 Đặt Cho (Người Dùng) *
              </label>

              {/* Search/Select Button */}
              <button
                type="button"
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                className="w-full px-4 py-2.5 bg-hover border border-line rounded-lg text-white placeholder:text-white/40 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors flex items-center justify-between hover:bg-hover-strong"
              >
                <span className={selectedUserName ? 'text-white' : 'text-white/40'}>
                  {selectedUserName || 'Chọn người dùng'}
                </span>
                <ChevronDown size={16} className={`transition-transform ${showUserDropdown ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {showUserDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900/95 border border-line rounded-lg shadow-2xl z-50">
                  {/* Search Input */}
                  <div className="p-3 border-b border-line">
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-3 text-white/40" />
                      <input
                        type="text"
                        placeholder="Tìm tên, role, email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                        className="w-full pl-10 pr-4 py-2 bg-hover border border-line rounded text-sm text-white placeholder:text-white/40 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      />
                    </div>
                  </div>

                  {/* Options */}
                  <div className="max-h-64 overflow-y-auto">
                    {/* Current User Option */}
                    <button
                      type="button"
                      onClick={() => handleRequestedByChange(currentUser?.id)}
                      className={`w-full text-left px-4 py-2.5 hover:bg-hover-strong transition-colors flex items-center justify-between ${
                        formData.requested_by === currentUser?.id ? 'bg-indigo-500/30 border-l-2 border-indigo-500' : ''
                      }`}
                    >
                      <div>
                        <p className="text-sm text-white font-medium">Chính tôi</p>
                        <p className="text-xs text-white/60">{currentUser?.name}</p>
                      </div>
                      {formData.requested_by === currentUser?.id && (
                        <div className="w-2 h-2 rounded-full bg-indigo-400" />
                      )}
                    </button>

                    {/* Other Users */}
                    {filteredUsers.length > 0 ? (
                      filteredUsers.map(user => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => handleRequestedByChange(user.id)}
                          className={`w-full text-left px-4 py-2.5 hover:bg-hover-strong transition-colors flex items-center justify-between border-b border-line-subtle ${
                            formData.requested_by === user.id ? 'bg-indigo-500/30 border-l-2 border-indigo-500' : ''
                          }`}
                        >
                          <div>
                            <p className="text-sm text-white font-medium">{user.name}</p>
                            <p className="text-xs text-white/60">{user.role}</p>
                          </div>
                          {formData.requested_by === user.id && (
                            <div className="w-2 h-2 rounded-full bg-indigo-400" />
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-8 text-center text-white/60 text-sm">
                        Không tìm thấy người dùng
                      </div>
                    )}
                  </div>
                </div>
              )}

              {errors.requested_by && <p className="text-red-400 text-sm mt-1">{errors.requested_by}</p>}
            </div>

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
                  <option key={room.id} value={room.name} className="bg-slate-900">
                    {room.name} (Sức chứa: {room.capacity})
                  </option>
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
                className="w-full px-4 py-2.5 bg-hover border border-line rounded-lg text-white placeholder:text-white/40 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
              />
              {errors.booking_date && <p className="text-red-400 text-sm mt-1">{errors.booking_date}</p>}
            </div>

            {/* Time Selection */}
            {/* Desktop: TimePickerDesktop */}
            <div className="hidden sm:grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  <Clock className="inline mr-2" size={16} />
                  Giờ Bắt Đầu *
                </label>
                <div className="flex justify-center">
                  <TimePickerDesktop
                    value={formData.start_time}
                    onChange={handleStartTimeChange}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  <Clock className="inline mr-2" size={16} />
                  Giờ Kết Thúc *
                </label>
                <div className="flex justify-center">
                  <TimePickerDesktop
                    value={formData.end_time}
                    onChange={handleEndTimeChange}
                  />
                </div>
              </div>
            </div>

            {/* Mobile: Native time input */}
            <div className="sm:hidden space-y-3">
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  <Clock className="inline mr-2" size={16} />
                  Giờ Bắt Đầu *
                </label>
                <input
                  type="time"
                  value={formData.start_time}
                  onChange={e => handleStartTimeChange(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg text-sm border border-line bg-surface-2 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  <Clock className="inline mr-2" size={16} />
                  Giờ Kết Thúc *
                </label>
                <input
                  type="time"
                  value={formData.end_time}
                  onChange={e => handleEndTimeChange(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg text-sm border border-line bg-surface-2 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50"
                />
              </div>
            </div>
            {errors.time && <p className="text-red-400 text-sm">{errors.time}</p>}

            {/* Purpose */}
            <div>
              <label className="block text-sm font-medium text-white/90 mb-2">
                Mục Đích Họp *
              </label>
              <textarea
                value={formData.purpose}
                onChange={(e) => handlePurposeChange(e.target.value)}
                rows={3}
                className="w-full px-4 py-2.5 bg-hover border border-line rounded-lg text-white placeholder:text-white/40 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors resize-none"
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
                  type="button"
                  onClick={() => handleNumParticipantsChange(Math.max(1, formData.num_participants - 1))}
                  className="px-3 py-1 border border-line rounded hover:bg-hover-strong transition-colors text-white"
                >
                  −
                </button>
                <span className="w-12 text-center font-medium text-white">{formData.num_participants}</span>
                <button
                  type="button"
                  onClick={() => handleNumParticipantsChange(formData.num_participants + 1)}
                  className="px-3 py-1 border border-line rounded hover:bg-hover-strong transition-colors text-white"
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
                className="w-4 h-4 rounded border-line accent-indigo-500"
              />
              <label htmlFor="online_meeting" className="text-sm text-white/90">
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
                className="w-4 h-4 rounded border-line accent-indigo-500"
              />
              <label htmlFor="room_setup" className="text-sm text-white/90">
                Cần chuẩn bị phòng
              </label>
            </div>

            {/* Error Message */}
            {errors.submit && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
                {errors.submit}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || isLoading}
              className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting || isLoading ? (
                <>
                  <Loader size={16} className="animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                mode === 'edit' ? '💾 Cập Nhật' : '📝 Đặt Phòng'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
