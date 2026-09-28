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
  /** Cấp bậc 1-5 (1=Ban lãnh đạo … 5=Thực tập) — null coi như 4 */
  rank?: number | null;
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

/** Cấp bậc chức vụ giờ CẤU HÌNH được (bảng position_ranks). Danh sách nạp từ API; cache
 *  module-level để RankBadge/normalizeRank (không nằm trong component) đọc được. Seed = 5 mức
 *  mặc định để lần render đầu (trước khi fetch) khớp hành vi cũ. */
export interface RankCfg {
  id: string; rank: number; label: string; description: string | null;
  color: string | null; is_active: boolean; show_in_company?: boolean;
}

const RANK_COLOR_CLASS: Record<string, string> = {
  indigo: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30',
  sky: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
  teal: 'text-teal-400 bg-teal-500/10 border-teal-500/30',
  amber: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  violet: 'text-violet-400 bg-violet-500/10 border-violet-500/30',
  emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  rose: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  muted: 'text-muted-foreground bg-white/5 border-white/10',
};
export const RANK_COLOR_TOKENS = Object.keys(RANK_COLOR_CLASS);

let RANK_CACHE: RankCfg[] = [
  { id: 'prk_g1', rank: 1, label: 'Ban lãnh đạo', description: 'Giám đốc, Phó GĐ, Cố vấn...', color: 'indigo', is_active: true, show_in_company: true },
  { id: 'prk_g2', rank: 2, label: 'Quản lý cấp phòng', description: 'Trưởng/Phó phòng', color: 'sky', is_active: true, show_in_company: true },
  { id: 'prk_g3', rank: 3, label: 'Quản lý bộ phận', description: 'Trưởng/Phó bộ phận', color: 'amber', is_active: true, show_in_company: true },
  { id: 'prk_g4', rank: 4, label: 'Nhân viên', description: null, color: 'muted', is_active: true, show_in_company: false },
  { id: 'prk_g5', rank: 5, label: 'Thực tập sinh', description: null, color: 'muted', is_active: true, show_in_company: false },
];

function normalizeRank(rank?: number | null): number {
  const r = Number(rank);
  if (RANK_CACHE.some(x => x.rank === r)) return r;
  if (RANK_CACHE.length) return RANK_CACHE[RANK_CACHE.length - 1].rank; // mức thấp nhất
  return Number.isFinite(r) ? r : 4;
}

function RankBadge({ rank }: { rank?: number | null }) {
  const cfg = RANK_CACHE.find(x => x.rank === normalizeRank(rank));
  const cls = RANK_COLOR_CLASS[cfg?.color || 'muted'] || RANK_COLOR_CLASS.muted;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-2xs sm:text-xs font-600 whitespace-nowrap ${cls}`}
    >
      {cfg?.label || `Cấp ${rank ?? '?'}`}
    </span>
  );
}

export default function PositionsManagement() {
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
    rank: 4,
  });

  // Detail view states
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [positionUsers, setPositionUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Cấp bậc cấu hình được
  const [ranks, setRanks] = useState<RankCfg[]>(RANK_CACHE);
  const [showRankManager, setShowRankManager] = useState(false);
  const refreshRanks = React.useCallback(async () => {
    try {
      const res = await fetch('/api/organizations/position-ranks');
      const json = await res.json();
      if (Array.isArray(json.data) && json.data.length) { RANK_CACHE = json.data; setRanks(json.data); }
    } catch { /* giữ cache mặc định */ }
  }, []);
  useEffect(() => { refreshRanks(); }, [refreshRanks]);

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
            rank: formData.rank,
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
            rank: formData.rank,
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
        rank: 4,
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
      rank: normalizeRank(position.rank),
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
      rank: 4,
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
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-700 text-foreground">
                {selectedPosition.name}
              </h1>
              <RankBadge rank={selectedPosition.rank} />
            </div>
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
            onClick={() => { if (showForm) { handleCancel(); } else { setEditingId(null); setFormData({ name: '', description: '', rank: 4 }); setShowForm(true); } }}
            className="flex items-center justify-center gap-2 h-10 px-3 sm:px-4 rounded-lg text-2xs sm:text-xs font-600 btn-accent min-h-[44px]"
          >
            <Plus size={16} />
            Thêm Chức Vụ
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

      {/* Form dạng modal popup (không còn phải kéo lên đầu trang) */}
      {showForm && isAdmin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={handleCancel}
        >
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden flex flex-col max-h-[90vh]"
            style={{ background: 'var(--card)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <h2 className="text-base font-700 text-foreground">
                {editingId ? 'Sửa Chức Vụ' : 'Thêm Chức Vụ Mới'}
              </h2>
              <button type="button" onClick={handleCancel} className="btn-ghost rounded-lg p-1.5">
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="text-2xs sm:text-xs font-600 text-muted-foreground uppercase block mb-1.5">
                  Tên Chức Vụ
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nhập tên chức vụ"
                  autoFocus
                  className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600 placeholder:text-muted-foreground/50"
                />
              </div>

              {/* Rank */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-2xs sm:text-xs font-600 text-muted-foreground uppercase">
                    Cấp Bậc
                  </label>
                  {isAdmin && (
                    <button type="button" onClick={() => setShowRankManager(true)}
                      className="text-2xs text-indigo-400 hover:text-indigo-300">Quản lý cấp bậc</button>
                  )}
                </div>
                <select
                  value={formData.rank}
                  onChange={(e) => setFormData({ ...formData, rank: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600"
                >
                  {ranks.map((r) => (
                    <option key={r.id} value={r.rank}>
                      {r.rank} — {r.label}{r.description ? ` (${r.description})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-2xs text-muted-foreground/70 mt-1.5">
                  Cấp bậc quyết định phạm vi quyền trong sơ đồ tổ chức — không còn suy đoán theo tên chức danh.
                </p>
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
                  className="w-full px-3 py-2 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600 placeholder:text-muted-foreground/50 resize-none"
                  rows={3}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
              <button
                type="button"
                onClick={handleCancel}
                className="btn-ghost rounded-xl px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-600 btn-accent disabled:opacity-50"
              >
                <Check size={16} />
                {loading ? 'Đang lưu...' : editingId ? 'Cập Nhật' : 'Tạo Mới'}
              </button>
            </div>
          </form>
        </div>
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
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm sm:text-base font-600 text-foreground">{position.name}</h4>
                    <RankBadge rank={position.rank} />
                  </div>
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

      {isAdmin && showRankManager && (
        <RankManagerModal
          ranks={ranks}
          colorTokens={RANK_COLOR_TOKENS}
          onClose={() => setShowRankManager(false)}
          onChanged={refreshRanks}
        />
      )}
    </div>
  );
}

/** Modal quản lý danh sách cấp bậc chức vụ (thêm/sửa/xoá, số nhỏ = cao). */
function RankManagerModal({ ranks, colorTokens, onClose, onChanged }: {
  ranks: RankCfg[]; colorTokens: string[]; onClose: () => void; onChanged: () => Promise<void> | void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{ rank: string; label: string; description: string; color: string }>({
    rank: '', label: '', description: '', color: 'muted',
  });

  const call = async (fn: () => Promise<Response>) => {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Thao tác thất bại');
      await onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Thất bại'); }
    finally { setBusy(false); }
  };

  const add = async () => {
    const rank = Number(draft.rank);
    if (!Number.isFinite(rank) || rank < 1) return toast.error('Số cấp bậc phải ≥ 1');
    if (!draft.label.trim()) return toast.error('Nhập tên cấp bậc');
    await call(() => fetch('/api/organizations/position-ranks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rank, label: draft.label, description: draft.description, color: draft.color }),
    }));
    setDraft({ rank: '', label: '', description: '', color: 'muted' });
  };

  const patch = (id: string, data: any) =>
    call(() => fetch(`/api/organizations/position-ranks/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    }));

  const remove = async (id: string) => {
    if (!(await confirm({ title: 'Xoá cấp bậc', message: 'Xoá mức cấp bậc này? Chức vụ đang gán số này vẫn giữ số cũ.', confirmLabel: 'Xoá', danger: true }))) return;
    await call(() => fetch(`/api/organizations/position-ranks/${id}`, { method: 'DELETE' }));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl border border-white/10 overflow-hidden"
        style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-base font-700 text-foreground">Quản lý cấp bậc chức vụ</h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X size={16} /></button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <p className="text-2xs text-muted-foreground">Số càng nhỏ = càng cao (1 = cao nhất). Sắp xếp theo số tăng dần.</p>

          <div className="space-y-2">
            {[...ranks].sort((a, b) => a.rank - b.rank).map((r) => (
              <div key={r.id} className="flex flex-col gap-2 rounded-xl border border-line px-3 py-2" style={{ background: 'var(--input)' }}>
                <div className="flex items-center gap-2">
                  <input type="number" min={1} defaultValue={r.rank} disabled={busy}
                    onBlur={e => { const v = Number(e.target.value); if (v >= 1 && v !== r.rank) patch(r.id, { rank: v }); }}
                    className="w-14 h-8 px-2 rounded-lg text-xs text-foreground bg-surface-2 border border-line" />
                  <input defaultValue={r.label} disabled={busy} placeholder="Tên cấp bậc"
                    onBlur={e => { const v = e.target.value.trim(); if (v && v !== r.label) patch(r.id, { label: v }); }}
                    className="flex-1 h-8 px-2 rounded-lg text-xs text-foreground bg-surface-2 border border-line" />
                  <select defaultValue={r.color || 'muted'} disabled={busy}
                    onChange={e => patch(r.id, { color: e.target.value })}
                    className="h-8 px-2 rounded-lg text-xs text-foreground bg-surface-2 border border-line">
                    {colorTokens.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button onClick={() => remove(r.id)} disabled={busy}
                    className="btn-ghost rounded-lg p-1.5 text-red-400 hover:text-red-300"><Trash2 size={14} /></button>
                </div>
                <input defaultValue={r.description ?? ''} disabled={busy} placeholder="Mô tả — phần trong ngoặc (VD: Giám đốc, Phó GĐ, Cố vấn…)"
                  onBlur={e => { const v = e.target.value.trim(); if (v !== (r.description ?? '')) patch(r.id, { description: v || null }); }}
                  className="w-full h-8 px-2 rounded-lg text-xs text-foreground bg-surface-2 border border-line placeholder:text-muted-foreground/50" />
                <label className="flex items-center gap-2 text-2xs text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" disabled={busy} defaultChecked={!!r.show_in_company}
                    onChange={e => patch(r.id, { show_in_company: e.target.checked })}
                    className="h-3.5 w-3.5 accent-indigo-500" />
                  Hiện ở <b className="text-foreground font-600">Nhân sự cấp công ty</b> (chức vụ thuộc cấp bậc này gán được ở thẻ công ty)
                </label>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-dashed border-line p-3 space-y-2">
            <p className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Thêm cấp bậc</p>
            <div className="flex items-center gap-2">
              <input type="number" min={1} placeholder="Số" value={draft.rank}
                onChange={e => setDraft({ ...draft, rank: e.target.value })}
                className="w-14 h-8 px-2 rounded-lg text-xs text-foreground bg-surface-2 border border-line" />
              <input placeholder="Tên cấp bậc" value={draft.label}
                onChange={e => setDraft({ ...draft, label: e.target.value })}
                className="flex-1 h-8 px-2 rounded-lg text-xs text-foreground bg-surface-2 border border-line" />
              <select value={draft.color} onChange={e => setDraft({ ...draft, color: e.target.value })}
                className="h-8 px-2 rounded-lg text-xs text-foreground bg-surface-2 border border-line">
                {colorTokens.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <button onClick={add} disabled={busy}
                className="h-8 px-3 rounded-lg text-xs font-600 bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 flex items-center gap-1">
                <Plus size={14} /> Thêm
              </button>
            </div>
            <input placeholder="Mô tả (tuỳ chọn)" value={draft.description}
              onChange={e => setDraft({ ...draft, description: e.target.value })}
              className="w-full h-8 px-2 rounded-lg text-xs text-foreground bg-surface-2 border border-line" />
          </div>
        </div>

        <div className="flex justify-end border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Đóng</button>
        </div>
      </div>
    </div>
  );
}
