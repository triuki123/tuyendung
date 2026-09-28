'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, X, Check, Users, ArrowLeft } from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';

interface Position {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  salary_range_min?: number;
  salary_range_max?: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface Company {
  id: string;
  name: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
}


export default function JobTitlesManagement() {
  const toast = useToast();
  const confirm = useConfirm();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const isAdmin = currentUser?.role === 'super_admin';
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [positions, setPositions] = useState<Position[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  // Detail view states
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [positionUsers, setPositionUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Initialize current user on mount
  useEffect(() => {
    const user = getCurrentUser();
    setCurrentUser(user);

    // Load all companies
    const loadCompanies = async () => {
      try {
        const response = await fetch('/api/organizations/companies');
        if (!response.ok) throw new Error('Failed to fetch companies');
        const data = await response.json();
        setCompanies(data || []);

        // Set default company
        if (user?.role === 'super_admin' && data.length > 0) {
          setSelectedCompanyId(data[0].id);
        } else if ((user as any)?.company_id) {
          setSelectedCompanyId((user as any).company_id);
        }
      } catch (error) {
        console.error('Failed to load companies:', error);
        setCompanies([]);
      }
    };

    loadCompanies();
  }, []);

  // Load positions for selected company
  useEffect(() => {
    const loadPositions = async () => {
      if (!selectedCompanyId) return;

      try {
        setLoading(true);
        const response = await fetch(`/api/organizations/positions?company_id=${selectedCompanyId}`);
        if (!response.ok) throw new Error('Failed to fetch positions');
        const data = await response.json();
        setPositions(data || []);
      } catch (error) {
        console.error('Failed to load positions:', error);
        setPositions([]);
      } finally {
        setLoading(false);
      }
    };

    loadPositions();
  }, [selectedCompanyId]);

  // Filter positions
  const filteredPositions = positions.filter(position =>
    position.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (position.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  );

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isAdmin) {
      toast.error('Chỉ Super Admin mới có thể tạo/sửa chức vụ');
      return;
    }

    if (!formData.name.trim()) {
      toast.error('Vui lòng điền tên chức vụ');
      return;
    }

    if (!selectedCompanyId) {
      toast.error('Vui lòng chọn công ty');
      return;
    }

    try {
      setLoading(true);

      if (editingId) {
        // Update existing position - using API
        const response = await fetch('/api/organizations/positions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingId,
            name: formData.name,
            description: formData.description,
            updated_by: currentUser?.id,
          }),
        });
        if (!response.ok) throw new Error('Failed to update position');
      } else {
        // Create new position - using API with selected company_id
        const response = await fetch('/api/organizations/positions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_id: selectedCompanyId,
            name: formData.name,
            description: formData.description,
            created_by: currentUser?.id || 'system',
          }),
        });
        if (!response.ok) throw new Error('Failed to create position');
      }

      // Reload positions
      const response = await fetch(`/api/organizations/positions?company_id=${selectedCompanyId}`);
      if (!response.ok) throw new Error('Failed to reload positions');
      const data = await response.json();
      setPositions(data || []);

      // Reset form
      setFormData({
        name: '',
        description: '',
      });
      setEditingId(null);
      setShowForm(false);
    } catch (error) {
      console.error('Failed to save position:', error);
      toast.error('Lỗi khi lưu chức vụ. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  // Handle edit
  const handleEdit = (position: Position) => {
    setFormData({
      name: position.name,
      description: position.description || '',
    });
    setEditingId(position.id);
    setShowForm(true);
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    if (!isAdmin) {
      toast.error('Chỉ Super Admin mới có thể xóa chức vụ');
      return;
    }

    const ok = await confirm({
      title: 'Xóa chức vụ?',
      message: 'Bạn có chắc chắn muốn xóa chức vụ này?',
      confirmLabel: 'Xóa',
      danger: true,
    });
    if (!ok) return;

    if (!selectedCompanyId) {
      toast.error('Lỗi: Không thể xác định công ty được chọn.');
      return;
    }

    try {
      setLoading(true);

      // Delete position using API
      const response = await fetch('/api/organizations/positions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          deleted_by: currentUser?.id || 'system',
        }),
      });
      if (!response.ok) throw new Error('Failed to delete position');

      // Reload positions
      const reloadResponse = await fetch(`/api/organizations/positions?company_id=${selectedCompanyId}`);
      if (!reloadResponse.ok) throw new Error('Failed to reload positions');
      const data = await reloadResponse.json();
      setPositions(data || []);
    } catch (error) {
      console.error('Failed to delete position:', error);
      toast.error('Lỗi khi xóa chức vụ. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({
      name: '',
      description: '',
    });
  };

  // Load position users
  const loadPositionUsers = async (positionId: string) => {
    try {
      setLoadingUsers(true);
      const response = await fetch(`/api/organizations/positions/${positionId}/users`);
      if (!response.ok) throw new Error('Failed to load users');
      const data = await response.json();
      setPositionUsers(data || []);
    } catch (error) {
      console.error('Failed to load position users:', error);
      setPositionUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Handle view position detail
  const handleViewPosition = (position: Position) => {
    setSelectedPosition(position);
    loadPositionUsers(position.id);
  };

  // Detail view
  if (selectedPosition) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setSelectedPosition(null);
              setPositionUsers([]);
            }}
            className="flex items-center justify-center h-10 w-10 rounded-lg hover:bg-hover transition-colors"
          >
            <ArrowLeft size={20} className="text-muted-foreground" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-700 text-foreground">
              {selectedPosition.name}
            </h1>
            <p className="text-2xs sm:text-xs text-muted-foreground mt-1">
              Danh sách nhân sự gắn với chức vụ này
            </p>
          </div>
        </div>

        {/* Position Info */}
        {selectedPosition.description && (
          <div className="bg-slate-900/50 backdrop-blur-sm p-3 sm:p-4 rounded-lg sm:rounded-xl border border-line">
            <p className="text-2xs sm:text-xs text-muted-foreground">{selectedPosition.description}</p>
          </div>
        )}

        {/* Users List */}
        <div className="space-y-3">
          <h3 className="text-sm sm:text-base font-600 text-foreground flex items-center gap-2">
            <Users size={16} />
            Nhân Sự ({positionUsers.length})
          </h3>

          {loadingUsers ? (
            <div className="text-center py-8 text-muted-foreground">
              Đang tải dữ liệu...
            </div>
          ) : positionUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Chưa có nhân sự nào gắn chức vụ này
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {positionUsers.map((user) => (
                <div
                  key={user.id}
                  className="bg-slate-900/50 backdrop-blur-sm p-3 sm:p-4 rounded-lg sm:rounded-xl border border-line hover:border-line-strong transition-all space-y-2"
                >
                  <div className="flex items-center gap-3">
                    {user.avatar && user.avatar.startsWith('/') ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="w-10 h-10 rounded-lg flex-shrink-0 object-cover"
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-lg flex-shrink-0 text-white flex items-center justify-center font-600 bg-indigo-500"
                      >
                        {user.name?.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm sm:text-base font-600 text-foreground truncate">{user.name}</h4>
                      <p className="text-2xs sm:text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-2xs sm:text-xs text-muted-foreground uppercase font-600">
                      {user.role}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-700 text-foreground">Quản Lý Chức Vụ</h1>
          <p className="text-2xs sm:text-xs text-muted-foreground mt-1">Tạo và quản lý chức vụ công việc cho công ty</p>
        </div>
        {isAdmin ? (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center justify-center gap-2 h-10 px-3 sm:px-4 rounded-lg text-2xs sm:text-xs font-600 btn-accent min-h-[44px]"
          >
            <Plus size={16} />
            {showForm ? 'Hủy' : 'Thêm Chức Vụ'}
          </button>
        ) : (
          <div className="text-2xs sm:text-xs text-amber-400 bg-amber-500/10 px-3 sm:px-4 py-2 rounded-lg border border-amber-500/20">
            Chỉ Super Admin mới có thể tạo chức vụ
          </div>
        )}
      </div>

      {/* Company Selector for Super Admin */}
      {isAdmin && companies.length > 0 && (
        <div className="bg-slate-900/50 backdrop-blur-sm p-3 sm:p-4 rounded-lg sm:rounded-xl border border-line">
          <label className="text-2xs sm:text-xs font-600 text-muted-foreground uppercase block mb-2">
            Chọn Công Ty
          </label>
          <select
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
            className="w-full h-9 sm:h-8 px-2 sm:px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600 min-h-[44px] sm:min-h-auto"
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
        <input
          type="text"
          placeholder="Tìm chức vụ..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full h-9 sm:h-8 pl-8 pr-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600 placeholder:text-muted-foreground/50 min-h-[44px] sm:min-h-auto"
        />
      </div>

      {/* Form */}
      {showForm && isAdmin && (
        <form
          onSubmit={handleSubmit}
          className="bg-slate-900/50 backdrop-blur-sm p-3 sm:p-4 rounded-lg sm:rounded-xl border border-line space-y-3 sm:space-y-4"
        >
          <h3 className="text-sm sm:text-base font-600 text-foreground">
            {editingId ? 'Sửa Chức Vụ' : 'Thêm Chức Vụ Mới'}
          </h3>

          <div>
            <label className="text-2xs sm:text-xs font-600 text-muted-foreground uppercase block mb-1.5">
              Tên Chức Vụ
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Nhập tên chức vụ"
              className="w-full h-9 sm:h-8 px-2 sm:px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600 placeholder:text-muted-foreground/50 min-h-[44px] sm:min-h-auto"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-2xs sm:text-xs font-600 text-muted-foreground uppercase block mb-1.5">
              Mô Tả (Tùy Chọn)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Mô tả chi tiết về chức vụ"
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

      {/* Positions List */}
      <div className="space-y-2">
        {loading && !showForm ? (
          <div className="text-center py-8 text-muted-foreground">
            Đang tải dữ liệu...
          </div>
        ) : filteredPositions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {positions.length === 0
              ? 'Chưa có chức vụ nào. Hãy tạo chức vụ mới.'
              : 'Không tìm thấy chức vụ phù hợp.'}
          </div>
        ) : (
          filteredPositions.map((position) => (
            <div
              key={position.id}
              className="bg-slate-900/50 backdrop-blur-sm p-3 sm:p-4 rounded-lg sm:rounded-xl border border-line hover:border-line-strong transition-all space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                <div className="flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => handleViewPosition(position)}>
                  <h4 className="text-sm sm:text-base font-600 text-foreground">{position.name}</h4>
                  {position.description && (
                    <p className="text-2xs sm:text-xs text-muted-foreground mt-1">{position.description}</p>
                  )}
                  <p className="text-2xs text-muted-foreground/60 mt-2">
                    Cập nhật: {position.updated_at ? new Date(position.updated_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A'}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
                    <button
                      onClick={() => handleEdit(position)}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 h-8 px-2 sm:px-3 rounded-lg text-2xs sm:text-xs font-600 text-muted-foreground hover:text-foreground hover:bg-hover transition-colors min-h-[44px] sm:min-h-auto"
                    >
                      <Edit2 size={14} />
                      <span className="sm:hidden">Sửa</span>
                    </button>
                    <button
                      onClick={() => handleDelete(position.id)}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 h-8 px-2 sm:px-3 rounded-lg text-2xs sm:text-xs font-600 text-red-400 hover:bg-red-500/10 transition-colors min-h-[44px] sm:min-h-auto"
                    >
                      <Trash2 size={14} />
                      <span className="sm:hidden">Xóa</span>
                    </button>
                  </div>
                )}
              </div>
              {/* View Users Button */}
              <button
                onClick={() => handleViewPosition(position)}
                className="w-full flex items-center justify-center gap-2 h-8 px-3 rounded-lg text-2xs sm:text-xs font-600 text-indigo-400 hover:bg-indigo-500/10 border border-indigo-500/30 transition-colors"
              >
                <Users size={14} />
                Xem Nhân Sự
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
