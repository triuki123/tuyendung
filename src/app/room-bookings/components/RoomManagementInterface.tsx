'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Edit2, Trash2, X, Building2, QrCode, BarChart3, Loader2 } from 'lucide-react';
import { useNotification } from '@/lib/useNotification';
import { fetchRooms, createRoom, updateRoom, deleteRoom } from '@/lib/api-client';
import RoomQRModal from './RoomQRModal';

interface Room {
  id: string;
  name: string;
  code?: string;
  capacity: number;
  location: string;
  amenities: string;
  status?: 'active' | 'maintenance' | 'closed';
}

export function RoomManagementInterface() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [qrRoom, setQrRoom] = useState<Room | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { showNotification } = useNotification();

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    capacity: '',
    location: '',
    amenities: '',
    status: 'active' as 'active' | 'maintenance' | 'closed',
  });

  useEffect(() => {
    const initLoad = async () => {
      await loadRooms();
    };
    initLoad();
  }, []);

  // Auto-initialize default rooms if empty
  useEffect(() => {
    if (rooms.length === 0 && !showForm) {
      const timer = setTimeout(() => {
        initializeDefaultRooms();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [rooms.length, showForm]);

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

  const loadRooms = async () => {
    try {
      const data = await fetchRooms();
      setRooms(data);
    } catch (error) {
      console.error('Error loading rooms:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.capacity || !formData.location) {
      showNotification('Vui lòng điền đầy đủ thông tin', 'error');
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    try {
      const roomData = {
        name: formData.name,
        code: formData.code.trim() || undefined,
        capacity: parseInt(formData.capacity),
        location: formData.location,
        amenities: formData.amenities,
        status: formData.status,
      };

      if (editingRoom) {
        // Update room
        await updateRoom(editingRoom.id, roomData);
        showNotification('Cập nhật phòng thành công', 'success');
      } else {
        // Add new room with generated ID
        const newRoomData = {
          id: Date.now().toString(),
          ...roomData,
        };
        await createRoom(newRoomData);
        showNotification('Thêm phòng thành công', 'success');
      }

      await loadRooms();
      resetForm();
    } catch (error) {
      showNotification(
        editingRoom ? 'Lỗi cập nhật phòng' : 'Lỗi thêm phòng',
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (deletingId) return;
    if (confirm('Bạn có chắc muốn xóa phòng này?')) {
      setDeletingId(id);
      try {
        await deleteRoom(id);
        await loadRooms();
        showNotification('Xóa phòng thành công', 'success');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Lỗi xóa phòng';
        showNotification(errorMessage, 'error');
      } finally {
        setDeletingId(null);
      }
    }
  };

  const handleEdit = (room: Room) => {
    setEditingRoom(room);
    setFormData({
      name: room.name,
      code: room.code || '',
      capacity: room.capacity.toString(),
      location: room.location,
      amenities: room.amenities,
      status: room.status || 'active',
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      capacity: '',
      location: '',
      amenities: '',
      status: 'active',
    });
    setEditingRoom(null);
    setShowForm(false);
  };

  const getStatusConfig = (status?: 'active' | 'maintenance' | 'closed') => {
    const configs: Record<string, { bg: string; text: string; label: string; emoji: string }> = {
      active: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Hoạt Động', emoji: '🟢' },
      maintenance: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Bảo Trì', emoji: '🟡' },
      closed: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Đóng Cửa', emoji: '🔴' },
    };
    return configs[status || 'active'];
  };

  const handleStatusChange = async (roomId: string, newStatus: 'active' | 'maintenance' | 'closed') => {
    try {
      await updateRoom(roomId, { status: newStatus });
      await loadRooms();
      showNotification('Cập nhật trạng thái phòng thành công', 'success');
    } catch (error) {
      showNotification('Lỗi cập nhật trạng thái phòng', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-700 text-foreground flex items-center gap-2">
            <Building2 size={24} className="text-indigo-400" />
            Quản Lý Phòng Họp
          </h2>
          <p className="text-2xs sm:text-xs text-muted-foreground mt-1">
            {rooms.length} phòng
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/room-bookings/thong-ke"
            className="flex items-center justify-center gap-2 h-10 px-3 sm:px-4 rounded-lg text-2xs sm:text-xs font-600 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors min-h-[44px]"
          >
            <BarChart3 size={16} />
            <span className="hidden sm:inline">Thống kê</span>
          </Link>
          <button
            onClick={() => {
              setEditingRoom(null);
              setFormData({ name: '', code: '', capacity: '', location: '', amenities: '', status: 'active' });
              setShowForm(!showForm);
            }}
            className="flex items-center justify-center gap-2 h-10 px-3 sm:px-4 rounded-lg text-2xs sm:text-xs font-600 bg-indigo-600 hover:bg-indigo-700 text-white transition-colors min-h-[44px]"
          >
            <Plus size={18} className="sm:hidden" />
            <Plus size={16} className="hidden sm:block" />
            <span>Thêm Phòng</span>
          </button>
        </div>
      </div>

      {/* Form Section */}
      {showForm && (
        <div className="bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6 rounded-lg sm:rounded-xl border border-line">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base sm:text-lg font-600 text-foreground">
              {editingRoom ? 'Chỉnh Sửa Phòng' : 'Thêm Phòng Mới'}
            </h3>
            <button
              onClick={resetForm}
              className="p-1 hover:bg-hover-strong rounded-lg transition-colors"
            >
              <X size={18} className="text-muted-foreground" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Room Name */}
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">
                  Tên Phòng
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="w-full h-9 sm:h-8 px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500 placeholder-muted-foreground/50 min-h-[44px] sm:min-h-auto"
                  placeholder="VD: Phòng A101"
                />
              </div>

              {/* Room Code (cho QR) */}
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">
                  Mã Phòng (QR)
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full h-9 sm:h-8 px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500 placeholder-muted-foreground/50 min-h-[44px] sm:min-h-auto font-mono"
                  placeholder="VD: A101 (để trống sẽ tự sinh)"
                />
              </div>

              {/* Capacity */}
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">
                  Sức Chứa
                </label>
                <input
                  type="number"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                  required
                  className="w-full h-9 sm:h-8 px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500 min-h-[44px] sm:min-h-auto"
                  placeholder="VD: 10"
                  min="1"
                />
              </div>

              {/* Location */}
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">
                  Vị Trí
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  required
                  className="w-full h-9 sm:h-8 px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500 placeholder-muted-foreground/50 min-h-[44px] sm:min-h-auto"
                  placeholder="VD: Tầng 1"
                />
              </div>

              {/* Amenities */}
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">
                  Tiện Nghi
                </label>
                <input
                  type="text"
                  value={formData.amenities}
                  onChange={(e) => setFormData({ ...formData, amenities: e.target.value })}
                  className="w-full h-9 sm:h-8 px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500 placeholder-muted-foreground/50 min-h-[44px] sm:min-h-auto"
                  placeholder="VD: Projector, WiFi"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">
                  Trạng Thái
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'maintenance' | 'closed' })}
                  className="w-full h-9 sm:h-8 px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500 min-h-[44px] sm:min-h-auto"
                >
                  <option value="active">🟢 Hoạt Động</option>
                  <option value="maintenance">🟡 Bảo Trì</option>
                  <option value="closed">🔴 Đóng Cửa</option>
                </select>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={resetForm}
                className="h-10 px-4 rounded-lg text-2xs sm:text-xs font-600 border border-line text-muted-foreground hover:text-foreground hover:bg-hover transition-colors min-h-[44px]"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-1.5 h-10 px-4 rounded-lg text-2xs sm:text-xs font-600 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors min-h-[44px]"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {submitting ? 'Đang lưu...' : editingRoom ? 'Cập Nhật' : 'Thêm'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rooms Grid */}
      <div>
        <h3 className="text-base sm:text-lg font-600 text-foreground mb-4">Danh Sách Phòng</h3>
        {rooms.length === 0 ? (
          <div className="bg-slate-900/50 backdrop-blur-sm p-6 rounded-lg sm:rounded-xl border border-line text-center">
            <Building2 size={40} className="mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">Chưa có phòng nào</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map(room => {
              const statusConfig = getStatusConfig(room.status);
              return (
              <div
                key={room.id}
                className="bg-slate-900/50 backdrop-blur-sm p-4 rounded-lg sm:rounded-xl border border-line hover:border-line-strong transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-600 text-foreground break-words">{room.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      {room.code && (
                        <span className="font-mono text-2xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded">{room.code}</span>
                      )}
                      <p className="text-2xs sm:text-xs text-muted-foreground">📍 {room.location}</p>
                    </div>
                  </div>
                </div>

                {/* Status Selector */}
                <div className="mb-3">
                  <select
                    value={room.status || 'active'}
                    onChange={(e) => handleStatusChange(room.id, e.target.value as 'active' | 'maintenance' | 'closed')}
                    className={`w-full h-8 px-2 rounded-lg text-2xs font-600 border border-line focus:outline-none focus:border-indigo-500 ${statusConfig.bg} ${statusConfig.text} transition-colors`}
                  >
                    <option value="active" className="bg-slate-900">🟢 Hoạt Động</option>
                    <option value="maintenance" className="bg-slate-900">🟡 Bảo Trì</option>
                    <option value="closed" className="bg-slate-900">🔴 Đóng Cửa</option>
                  </select>
                </div>

                <div className="space-y-2 text-2xs sm:text-xs text-muted-foreground mb-4 border-t border-line-subtle pt-3">
                  <p>👥 Sức chứa: <span className="text-foreground font-500">{room.capacity} người</span></p>
                  {room.amenities && (
                    <p>🎯 Tiện nghi: <span className="text-foreground font-500">{room.amenities}</span></p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setQrRoom(room)}
                    className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-2xs sm:text-xs font-600 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 transition-colors min-h-[44px]"
                    title="In tem QR phòng"
                  >
                    <QrCode size={14} />
                    <span className="hidden sm:inline">QR</span>
                  </button>
                  <button
                    onClick={() => handleEdit(room)}
                    className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-2xs sm:text-xs font-600 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-colors min-h-[44px]"
                  >
                    <Edit2 size={14} />
                    <span className="hidden sm:inline">Sửa</span>
                  </button>
                  <button
                    onClick={() => handleDelete(room.id)}
                    disabled={deletingId === room.id}
                    className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-2xs sm:text-xs font-600 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 transition-colors min-h-[44px]"
                  >
                    {deletingId === room.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    <span className="hidden sm:inline">Xóa</span>
                  </button>
                </div>
              </div>
            );
            })}
          </div>
        )}
      </div>

      {qrRoom && qrRoom.code && (
        <RoomQRModal
          room={{ id: qrRoom.id, name: qrRoom.name, code: qrRoom.code, location: qrRoom.location, capacity: qrRoom.capacity }}
          onClose={() => setQrRoom(null)}
        />
      )}
    </div>
  );
}
