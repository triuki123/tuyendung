'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, X, Check } from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { useConfirm } from '@/context/ConfirmContext';

interface TaskTag {
  id: string;
  name: string;
  description?: string;
  color: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

const TAG_COLORS = [
  '#6366f1', // indigo (default)
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#f43f5e', // rose
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#0ea5e9', // sky
];

export default function OrgTagsManagement() {
  // currentUser is read from localStorage, which is unavailable during SSR.
  // Resolve it after mount so server and first client render match (avoids
  // a hydration mismatch on the isSuperAdmin-dependent UI).
  const confirm = useConfirm();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);
  useEffect(() => {
    const user = getCurrentUser();
    setIsSuperAdmin(user?.role === 'super_admin');
    setCurrentUserId(user?.id);
  }, []);

  // States
  const [tags, setTags] = useState<TaskTag[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#6366f1',
  });

  // Load task tags
  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/org-tags');
      if (!response.ok) throw new Error('Failed to load task tags');
      const data = await response.json();
      setTags(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter tags
  const filteredTags = tags.filter(tag =>
    tag.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (tag.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  );

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isSuperAdmin) {
      setError('Bạn không có quyền tạo/sửa tags. Chỉ Super Admin mới có quyền.');
      return;
    }

    if (!formData.name.trim()) {
      setError('Vui lòng điền tên tag');
      return;
    }

    try {
      setLoading(true);

      if (editingId) {
        const response = await fetch(`/api/org-tags/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name,
            description: formData.description,
            color: formData.color,
            updated_by: currentUserId,
          }),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to update task tag');
        }
      } else {
        const response = await fetch('/api/org-tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name,
            description: formData.description,
            color: formData.color,
            created_by: currentUserId,
          }),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to create task tag');
        }
      }

      await loadTags();

      setFormData({ name: '', description: '', color: '#6366f1' });
      setEditingId(null);
      setShowForm(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle edit
  const handleEdit = (tag: TaskTag) => {
    if (!isSuperAdmin) {
      setError('Bạn không có quyền sửa tags');
      return;
    }
    setFormData({
      name: tag.name,
      description: tag.description || '',
      color: tag.color,
    });
    setEditingId(tag.id);
    setShowForm(true);
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    if (!isSuperAdmin) {
      setError('Bạn không có quyền xóa tags');
      return;
    }

    const ok = await confirm({
      title: 'Xóa tag?',
      message: 'Bạn có chắc chắn muốn xóa tag này?',
      confirmLabel: 'Xóa',
      danger: true,
    });
    if (!ok) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/org-tags/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleted_by: currentUserId }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to delete task tag');
      }

      await loadTags();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: '', description: '', color: '#6366f1' });
    setError('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-700 text-foreground">Tags Tổ Chức</h1>
          <p className="text-2xs sm:text-xs text-muted-foreground mt-1">
            {isSuperAdmin
              ? 'Tạo và quản lý tags để phân loại tổ chức'
              : 'Xem danh sách tags tổ chức (chỉ Super Admin mới có thể chỉnh sửa)'}
          </p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center justify-center gap-2 h-10 px-3 sm:px-4 rounded-lg text-2xs sm:text-xs font-600 btn-accent min-h-[44px]"
          >
            <Plus size={16} />
            {showForm ? 'Hủy' : 'Thêm Tag'}
          </button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
        <input
          type="text"
          placeholder="Tìm tag..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full h-9 sm:h-8 pl-8 pr-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600 placeholder:text-muted-foreground/50 min-h-[44px] sm:min-h-auto"
        />
      </div>

      {/* Form */}
      {showForm && isSuperAdmin && (
        <form
          onSubmit={handleSubmit}
          className="bg-slate-900/50 backdrop-blur-sm p-3 sm:p-4 rounded-lg sm:rounded-xl border border-line space-y-3 sm:space-y-4"
        >
          <h3 className="text-sm sm:text-base font-600 text-foreground">
            {editingId ? 'Sửa Tag' : 'Thêm Tag Mới'}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {/* Name */}
            <div>
              <label className="text-2xs sm:text-xs font-600 text-muted-foreground uppercase block mb-1.5">
                Tên Tag
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nhập tên tag"
                className="w-full h-9 sm:h-8 px-2 sm:px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600 placeholder:text-muted-foreground/50 min-h-[44px] sm:min-h-auto"
              />
            </div>

            {/* Color */}
            <div>
              <label className="text-2xs sm:text-xs font-600 text-muted-foreground uppercase block mb-1.5">
                Màu Sắc
              </label>
              <div className="flex flex-wrap gap-2">
                {TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormData({ ...formData, color })}
                    className={`w-8 h-8 rounded-lg transition-all border-2 ${
                      formData.color === color
                        ? 'border-white/80 scale-110'
                        : 'border-line-strong hover:border-white/40'
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-2xs sm:text-xs font-600 text-muted-foreground uppercase block mb-1.5">
              Mô Tả (Tùy Chọn)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Mô tả chi tiết về tag"
              className="w-full px-2 sm:px-3 py-2 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600 placeholder:text-muted-foreground/50 resize-none min-h-[44px]"
              rows={3}
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2 sm:gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 h-10 px-3 sm:px-4 rounded-lg text-2xs sm:text-xs font-600 btn-accent min-h-[44px] disabled:opacity-50"
            >
              <Check size={16} />
              {loading ? 'Đang lưu...' : editingId ? 'Cập Nhật' : 'Tạo Mới'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="flex items-center justify-center gap-2 h-10 px-3 sm:px-4 rounded-lg text-2xs sm:text-xs font-600 btn-ghost text-muted-foreground hover:text-foreground min-h-[44px]"
            >
              <X size={16} />
              Hủy
            </button>
          </div>
        </form>
      )}

      {/* Tags List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading && !showForm ? (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            Đang tải dữ liệu...
          </div>
        ) : filteredTags.length === 0 ? (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            {tags.length === 0
              ? 'Chưa có tag nào. Hãy tạo tag mới.'
              : 'Không tìm thấy tag phù hợp.'}
          </div>
        ) : (
          filteredTags.map((tag) => (
            <div
              key={tag.id}
              className="bg-slate-900/50 backdrop-blur-sm p-3 sm:p-4 rounded-lg sm:rounded-xl border border-line hover:border-line-strong transition-all space-y-3 group"
            >
              {/* Tag Color Badge */}
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-lg flex-shrink-0 group-hover:scale-110 transition-transform"
                  style={{ backgroundColor: tag.color }}
                />
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm sm:text-base font-600 text-foreground">
                    {tag.name}
                  </h4>
                  <p className="text-2xs text-muted-foreground/60">{tag.color}</p>
                </div>
              </div>

              {/* Description */}
              {tag.description && (
                <p className="text-2xs sm:text-xs text-muted-foreground line-clamp-2">{tag.description}</p>
              )}

              {/* Meta */}
              <p className="text-2xs text-muted-foreground/60">
                Cập nhật: {tag.updated_at ? new Date(tag.updated_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A'}
              </p>

              {/* Actions */}
              {isSuperAdmin && (
                <div className="flex gap-2 pt-2 border-t border-line-subtle">
                  <button
                    onClick={() => handleEdit(tag)}
                    className="flex-1 flex items-center justify-center gap-1.5 h-8 px-2 rounded-lg text-2xs font-600 text-muted-foreground hover:text-foreground hover:bg-hover transition-colors min-h-[44px] sm:min-h-auto"
                  >
                    <Edit2 size={14} />
                    <span>Sửa</span>
                  </button>
                  <button
                    onClick={() => handleDelete(tag.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 h-8 px-2 rounded-lg text-2xs font-600 text-red-400 hover:bg-red-500/10 transition-colors min-h-[44px] sm:min-h-auto"
                  >
                    <Trash2 size={14} />
                    <span>Xóa</span>
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
