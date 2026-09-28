'use client';

import React, { useState, useEffect } from 'react';
import { Search, Plus, Trash2, Edit2, Copy, Check, Mail, Eye, EyeOff, ChevronDown, AlertCircle, InboxIcon, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import DateInputVN from '@/components/ui/DateInputVN';
import OrgPersonPicker, { OrgPersonValue } from '@/components/ui/OrgPersonPicker';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

interface EmailAccount {
  id: string;
  email: string;
  provider: string;
  nguoiSuDung: string;
  congtyDonvi: string;
  phongban: string;
  userId: string | null;
  companyId: string | null;
  departmentId: string | null;
  subDepartmentId: string | null;
  createdDate: string;
  status: 'active' | 'locked' | 'archived';
  notes: string;
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  color?: string;
}

interface TooltipProps {
  text: string;
  children: React.ReactNode;
}

function Tooltip({ text, children }: TooltipProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="cursor-help"
      >
        {children}
      </div>
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-900 border border-slate-600 text-slate-200 text-xs rounded whitespace-nowrap z-50 shadow-lg">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </div>
      )}
    </div>
  );
}

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

function Toast({ message, type }: ToastProps) {
  const bgColor = {
    success: 'bg-emerald-900/90 border-emerald-700',
    error: 'bg-red-900/90 border-red-700',
    warning: 'bg-yellow-900/90 border-yellow-700',
    info: 'bg-blue-900/90 border-blue-700',
  }[type];

  const textColor = {
    success: 'text-emerald-300',
    error: 'text-red-300',
    warning: 'text-yellow-300',
    info: 'text-blue-300',
  }[type];

  const Icon = {
    success: CheckCircle,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Mail,
  }[type];

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${bgColor} animate-in fade-in slide-in-from-bottom-4 duration-300`}>
      <Icon size={18} className={textColor} />
      <span className={`text-sm font-medium ${textColor}`}>{message}</span>
    </div>
  );
}

function StatCard({ label, value, icon, color = 'text-blue-400' }: StatCardProps) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 md:p-6 hover:border-slate-600 transition">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-ink-bright text-xs md:text-sm mb-2 font-medium">{label}</p>
          <p className={`text-2xl md:text-3xl font-bold text-white`}>{value}</p>
        </div>
        {icon && <div className={`${color}`}>{icon}</div>}
      </div>
    </div>
  );
}

function SkeletonLoader() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-24 bg-slate-700/30 rounded-lg" />
      ))}
    </div>
  );
}

interface EmptyStateProps {
  hasSearch: boolean;
  onAddClick: () => void;
}

function EmptyState({ hasSearch, onAddClick }: EmptyStateProps) {
  return (
    <div className="py-12 text-center">
      <div className="mb-4 flex justify-center">
        <div className="bg-slate-700/30 p-4 rounded-full">
          <InboxIcon size={32} className="text-ink-muted" />
        </div>
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">
        {hasSearch ? 'Không tìm thấy tài khoản' : 'Chưa có tài khoản nào'}
      </h3>
      <p className="text-ink-muted text-sm mb-6">
        {hasSearch
          ? 'Hãy thử tìm kiếm bằng từ khóa khác'
          : 'Thêm tài khoản email đầu tiên để bắt đầu quản lý'}
      </p>
      {!hasSearch && (
        <button
          onClick={onAddClick}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg inline-flex items-center gap-2 transition font-medium text-sm"
        >
          <Plus size={18} />
          Thêm Tài Khoản Email
        </button>
      )}
    </div>
  );
}

interface EmailCardProps {
  account: EmailAccount;
  onEdit: (account: EmailAccount) => void;
  onDelete: (id: string) => void;
  onCopy: (text: string, id: string) => void;
  copiedId: string | null;
  loading: boolean;
}

function EmailCard({ account, onEdit, onDelete, onCopy, copiedId, loading }: EmailCardProps) {
  const [expanded, setExpanded] = useState(false);

  const getStatusColorCard = (status: string) => {
    switch (status) {
      case 'active':
        return { dot: 'bg-emerald-400', text: 'text-emerald-400', badge: 'bg-emerald-900/30 border-emerald-700' };
      case 'locked':
        return { dot: 'bg-orange-400', text: 'text-orange-400', badge: 'bg-orange-900/30 border-orange-700' };
      case 'archived':
        return { dot: 'bg-slate-400', text: 'text-ink-muted', badge: 'bg-slate-900/30 border-slate-700' };
      default:
        return { dot: 'bg-gray-400', text: 'text-gray-400', badge: 'bg-gray-900/30 border-gray-700' };
    }
  };

  const statusColor = getStatusColorCard(account.status);

  return (
    <div className="bg-gradient-to-br from-slate-800/50 to-slate-800/30 border border-slate-700 rounded-lg overflow-hidden">
      <div className="p-4 md:p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${statusColor.dot}`} />
              <h3 className="text-white font-semibold truncate">{account.email}</h3>
              <button
                onClick={() => onCopy(account.email, account.id)}
                className="text-ink-muted hover:text-blue-400 transition flex-shrink-0"
              >
                {copiedId === account.id ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <p className="text-ink-muted text-xs md:text-sm">{account.provider.toUpperCase()}</p>
          </div>
          <span className={`px-2 py-1 rounded text-xs font-medium ${statusColor.badge} border whitespace-nowrap flex-shrink-0`}>
            {account.status === 'active' ? '✓ Đang Hoạt Động' : account.status === 'locked' ? '🔒 Tạm Khoá' : '📦 Lưu Trữ'}
          </span>
        </div>

        {/* Essential Info Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <p className="text-xs text-ink-muted mb-1">Người Sử Dụng</p>
            <p className="text-sm text-white truncate">{account.nguoiSuDung || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted mb-1">Công Ty/Đơn Vị</p>
            <p className="text-sm text-white truncate">{account.congtyDonvi || '—'}</p>
          </div>
        </div>

        {/* Expandable Details */}
        <div className={`overflow-hidden transition-all ${expanded ? 'max-h-64' : 'max-h-0'}`}>
          <div className="border-t border-slate-700 pt-4 space-y-3">
            <div>
              <p className="text-xs text-ink-muted mb-1">Phòng Ban</p>
              <p className="text-sm text-white">{account.phongban || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted mb-1">Ngày Tạo</p>
              <p className="text-sm text-white">{account.createdDate || '—'}</p>
            </div>
            {account.notes && (
              <div>
                <p className="text-xs text-ink-muted mb-1">Ghi Chú</p>
                <p className="text-sm text-white">{account.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-700">
          <button
            onClick={() => setExpanded(!expanded)}
            className="lg:hidden flex items-center gap-1 text-ink-muted hover:text-ink-bright transition text-xs"
          >
            Chi tiết thêm
            <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
          <div className="flex gap-2 sm:gap-2.5 ml-auto">
            <Tooltip text="Chỉnh sửa tài khoản">
              <button
                onClick={() => onEdit(account)}
                className="h-9 px-2.5 rounded-lg transition disabled:opacity-50 border border-blue-600/30 hover:border-blue-600/50 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 flex items-center justify-center min-h-[44px]"
                disabled={loading}
              >
                <Edit2 size={16} />
              </button>
            </Tooltip>
            <Tooltip text="Xóa tài khoản">
              <button
                onClick={() => onDelete(account.id)}
                className="h-9 px-2.5 rounded-lg transition disabled:opacity-50 border border-red-600/30 hover:border-red-600/50 bg-red-600/20 hover:bg-red-600/40 text-red-400 flex items-center justify-center min-h-[44px]"
                disabled={loading}
              >
                <Trash2 size={16} />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}

const EMPTY_EMAIL_FORM: Partial<EmailAccount> = {
  email: '',
  provider: '',
  nguoiSuDung: '',
  congtyDonvi: '',
  phongban: '',
  userId: null,
  companyId: null,
  departmentId: null,
  subDepartmentId: null,
  createdDate: '',
  status: 'active',
  notes: '',
};

export default function EmailAccountsClient() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterNguoiSuDung, setFilterNguoiSuDung] = useState<string>('all');
  const [filterCongtyDonvi, setFilterCongtyDonvi] = useState<string>('all');
  const [filterPhongban, setFilterPhongban] = useState<string>('all');
  const [showArchive, setShowArchive] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [formData, setFormData] = useState<Partial<EmailAccount>>(EMPTY_EMAIL_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [toast, setToast] = useState<ToastProps | null>(null);

  // Đóng modal Thêm/Sửa (reset trạng thái form)
  const closeAddModal = React.useCallback(() => {
    setShowAddModal(false);
    setEditingId(null);
    setFormErrors({});
  }, []);
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(closeAddModal);

  // Đóng modal Xóa (xác nhận)
  const closeDeleteModal = React.useCallback(() => {
    setShowDeleteModal(false);
    setDeletingId(null);
  }, []);

  useEscapeKey(
    () => { if (showAddModal) guardedClose(); else if (showDeleteModal) closeDeleteModal(); },
    showAddModal || showDeleteModal,
  );

  useEffect(() => {
    fetchEmailAccounts();
  }, []);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        handleOpenAddModal();
      }
      if (e.key === 'Escape' && showAddModal) {
        setShowAddModal(false);
        setEditingId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAddModal]);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    setToast({ message, type });
  };

  const fetchEmailAccounts = async () => {
    try {
      setLoadingAccounts(true);
      const response = await fetch('/api/email-accounts');
      if (!response.ok) throw new Error('Failed to fetch email accounts');
      const data = await response.json();
      setAccounts(data);
    } catch (error) {
      console.error('Error fetching email accounts:', error);
      showToast('Không thể tải dữ liệu tài khoản email', 'error');
    } finally {
      setLoadingAccounts(false);
    }
  };

  // Giá trị cho OrgPersonPicker (Công Ty → Phòng Ban → Bộ Phận → Người sử dụng)
  const orgValue: OrgPersonValue = {
    companyId: formData.companyId || null,
    departmentId: formData.departmentId || null,
    subDepartmentId: formData.subDepartmentId || null,
    userId: formData.userId || null,
    userName: formData.nguoiSuDung || '',
  };
  const handleOrgChange = (v: OrgPersonValue) => {
    setFormData((prev) => ({
      ...prev,
      companyId: v.companyId,
      departmentId: v.departmentId,
      subDepartmentId: v.subDepartmentId,
      userId: v.userId,
      nguoiSuDung: v.userName || '',
      congtyDonvi: v.companyName ?? prev.congtyDonvi,
      phongban: v.departmentName ?? prev.phongban,
    }));
    if (formErrors.nguoiSuDung && v.userId) setFormErrors((e) => ({ ...e, nguoiSuDung: '' }));
  };

  const filteredAccounts = accounts.filter(account => {
    // Filter by archive status
    const isArchived = account.status === 'archived';
    if (showArchive && !isArchived) return false;
    if (!showArchive && isArchived) return false;

    const matchesSearch =
      (account.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (account.provider || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesProvider = filterProvider === 'all' || (account.provider || '').toLowerCase() === filterProvider.toLowerCase();

    const matchesStatus = filterStatus === 'all' || account.status === filterStatus;

    const matchesNguoiSuDung = filterNguoiSuDung === 'all' || (account.nguoiSuDung || '').toLowerCase().includes(filterNguoiSuDung.toLowerCase());

    const matchesCongtyDonvi = filterCongtyDonvi === 'all' || (account.congtyDonvi || '').toLowerCase().includes(filterCongtyDonvi.toLowerCase());

    const matchesPhongban = filterPhongban === 'all' || (account.phongban || '').toLowerCase().includes(filterPhongban.toLowerCase());

    return matchesSearch && matchesProvider && matchesStatus && matchesNguoiSuDung && matchesCongtyDonvi && matchesPhongban;
  });

  const stats = {
    total: accounts.filter(a => a.status !== 'archived').length,
    active: accounts.filter(a => a.status === 'active').length,
    locked: accounts.filter(a => a.status === 'locked').length,
    archived: accounts.filter(a => a.status === 'archived').length,
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!formData.email?.trim()) {
      errors.email = 'Email là bắt buộc';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Email không hợp lệ';
    }

    if (!formData.provider?.trim()) {
      errors.provider = 'Nhà cung cấp là bắt buộc';
    }

    if (!formData.nguoiSuDung?.trim()) {
      errors.nguoiSuDung = 'Người sử dụng là bắt buộc';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleOpenAddModal = () => {
    setFormData(EMPTY_EMAIL_FORM);
    setFormErrors({});
    setEditingId(null);
    setShowAddModal(true);
  };

  const handleAddOrUpdate = async () => {
    if (!validateForm()) {
      showToast('Vui lòng kiểm tra lại thông tin', 'warning');
      return;
    }

    try {
      setLoading(true);
      const dataToSend = {
        ...formData,
        provider: formData.provider?.toLowerCase() || '',
      };

      if (editingId) {
        const response = await fetch(`/api/email-accounts/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSend),
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Không thể cập nhật tài khoản');
        }
        showToast('Tài khoản đã được cập nhật thành công', 'success');
      } else {
        const response = await fetch('/api/email-accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSend),
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Không thể tạo tài khoản');
        }
        showToast('Tài khoản đã được tạo thành công', 'success');
      }

      await fetchEmailAccounts();
      markClean();
      setFormData(EMPTY_EMAIL_FORM);
      setFormErrors({});
      setEditingId(null);
      setShowAddModal(false);
    } catch (error) {
      console.error('Error saving email account:', error);
      const errorMsg = error instanceof Error ? error.message : 'Lỗi không xác định';
      showToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (account: EmailAccount) => {
    setFormData(account);
    setFormErrors({});
    setEditingId(account.id);
    setShowAddModal(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/email-accounts/${deletingId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Không thể xóa tài khoản');
      showToast('Tài khoản đã được xóa thành công', 'success');
      await fetchEmailAccounts();
      setShowDeleteModal(false);
      setDeletingId(null);
    } catch (error) {
      console.error('Error deleting email account:', error);
      const errorMsg = error instanceof Error ? error.message : 'Lỗi không xác định';
      showToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-500/15 text-emerald-300';
      case 'locked':
        return 'bg-orange-500/15 text-orange-300';
      case 'archived':
        return 'bg-slate-500/15 text-ink-bright';
      default:
        return 'bg-gray-500/15 text-gray-300';
    }
  };

  const getStatusDotColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#10b981';
      case 'locked':
        return '#f59e0b';
      case 'archived':
        return '#64748b';
      default:
        return '#9ca3af';
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Toast Notification */}
        {toast && (
          <div className="fixed bottom-4 right-4 z-50">
            <Toast message={toast.message} type={toast.type} />
          </div>
        )}

        {/* Header */}
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-2" role="heading" aria-level={1}>
            Quản Lý Tài Khoản Email
          </h1>
          <p className="text-ink-muted text-sm md:text-base">
            Quản lý và theo dõi tất cả các tài khoản email của bạn
          </p>
        </div>

        {/* Stats Grid */}
        {loadingAccounts ? (
          <SkeletonLoader />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
            <StatCard label="Tổng Tài Khoản" value={stats.total} icon={<Mail size={24} />} />
            <StatCard label="Đang Hoạt Động" value={stats.active} color="text-emerald-400" />
            <StatCard label="Tạm Khoá" value={stats.locked} color="text-orange-400" />
            <StatCard label="Lưu Trữ" value={stats.archived} color="text-ink-muted" />
          </div>
        )}

        {/* Archive Tab */}
        <div className="flex gap-2 sm:gap-3 mb-6 md:mb-8">
          <button
            onClick={() => {
              setShowArchive(false);
              setFilterStatus('all');
            }}
            className={`h-10 px-3 sm:px-4 rounded-lg font-600 transition text-2xs sm:text-xs min-h-[44px] ${
              !showArchive
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-ink-bright hover:bg-slate-600'
            }`}
          >
            📧 Tài Khoản Hoạt Động
          </button>
          <button
            onClick={() => setShowArchive(true)}
            className={`h-10 px-3 sm:px-4 rounded-lg font-600 transition text-2xs sm:text-xs min-h-[44px] ${
              showArchive
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-ink-bright hover:bg-slate-600'
            }`}
          >
            📦 Thùng Lưu Trữ ({stats.archived})
          </button>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col gap-4 mb-6 md:mb-8">
          <div className="flex flex-col md:flex-row gap-3 md:gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" size={18} />
              <input
                type="text"
                placeholder="Tìm kiếm email hoặc nhà cung cấp..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Tìm kiếm tài khoản email"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm md:text-base text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition"
              />
            </div>
            {!showArchive && (
              <button
                onClick={handleOpenAddModal}
                aria-label="Thêm tài khoản email mới"
                className="h-10 px-3 sm:px-4 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 text-2xs sm:text-xs font-600 bg-blue-600 hover:bg-blue-700 text-white min-h-[44px]"
                disabled={loading}
              >
                <Plus size={18} className="sm:hidden" />
                <Plus size={16} className="hidden sm:block" />
                <span className="hidden sm:inline">Thêm Tài Khoản</span>
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-muted font-medium">Nhà Cung Cấp:</span>
              <select
                value={filterProvider}
                onChange={(e) => setFilterProvider(e.target.value)}
                aria-label="Lọc theo nhà cung cấp"
                className="bg-slate-700/50 border border-slate-600 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition"
              >
                <option value="all">Tất cả</option>
                <option value="gmail">Gmail</option>
                <option value="microsoft">Outlook</option>
                <option value="yahoo">Yahoo</option>
                <option value="icloud">iCloud</option>
                <option value="protonmail">ProtonMail</option>
              </select>
            </div>

            {!showArchive && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-muted font-medium">Trạng Thái:</span>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  aria-label="Lọc theo trạng thái"
                  className="bg-slate-700/50 border border-slate-600 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition"
                >
                  <option value="all">Tất cả</option>
                  <option value="active">Đang Hoạt Động</option>
                  <option value="locked">Tạm Khoá</option>
                </select>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-muted font-medium">Người Sử Dụng:</span>
              <input
                type="text"
                placeholder="Tìm kiếm..."
                value={filterNguoiSuDung}
                onChange={(e) => setFilterNguoiSuDung(e.target.value)}
                className="bg-slate-700/50 border border-slate-600 rounded px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition w-32"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-muted font-medium">Công Ty/Đơn Vị:</span>
              <input
                type="text"
                placeholder="Tìm kiếm..."
                value={filterCongtyDonvi}
                onChange={(e) => setFilterCongtyDonvi(e.target.value)}
                className="bg-slate-700/50 border border-slate-600 rounded px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition w-32"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-muted font-medium">Phòng Ban:</span>
              <input
                type="text"
                placeholder="Tìm kiếm..."
                value={filterPhongban}
                onChange={(e) => setFilterPhongban(e.target.value)}
                className="bg-slate-700/50 border border-slate-600 rounded px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition w-32"
              />
            </div>
          </div>
        </div>

        {/* Email Accounts - Card View (Mobile/Tablet) */}
        <div className="lg:hidden">
          {filteredAccounts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredAccounts.map((account) => (
                <EmailCard
                  key={account.id}
                  account={account}
                  onEdit={handleEdit}
                  onDelete={(id) => {
                    setDeletingId(id);
                    setShowDeleteModal(true);
                  }}
                  onCopy={copyToClipboard}
                  copiedId={copiedId}
                  loading={loading}
                />
              ))}
            </div>
          ) : (
            <div className="bg-slate-800/30 rounded-lg border border-slate-700">
              <EmptyState hasSearch={searchQuery.length > 0} onAddClick={handleOpenAddModal} />
            </div>
          )}
        </div>

        {/* Email Accounts - Table View (Desktop) */}
        <div className="hidden lg:block bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
          {filteredAccounts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700/50 bg-slate-900/40">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ink-bright">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ink-bright">Nhà Cung Cấp</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ink-bright">Người Sử Dụng</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ink-bright">Công Ty/Đơn Vị</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ink-bright">Phòng Ban</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ink-bright">Ngày Tạo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ink-bright">Trạng Thái</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ink-bright">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {filteredAccounts.map((account) => {
                    return (
                      <tr
                        key={account.id}
                        className="hover:bg-slate-700/20 transition-colors duration-150"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEdit(account);
                        }}
                      >
                        <td className="px-4 py-3 text-white font-medium text-sm">
                          <div className="flex items-center gap-2">
                            {account.email}
                            <button
                              onClick={() => copyToClipboard(account.email, account.id)}
                              aria-label={`Sao chép email ${account.email}`}
                              className="text-ink-muted hover:text-blue-400 transition-colors"
                            >
                              {copiedId === account.id ? <Check size={16} /> : <Copy size={16} />}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-ink-bright text-sm capitalize">{account.provider}</td>
                        <td className="px-4 py-3 text-ink-bright text-sm">{account.nguoiSuDung || '—'}</td>
                        <td className="px-4 py-3 text-ink-bright text-sm">{account.congtyDonvi || '—'}</td>
                        <td className="px-4 py-3 text-ink-bright text-sm">{account.phongban || '—'}</td>
                        <td className="px-4 py-3 text-ink-bright text-sm">{account.createdDate || '—'}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${getStatusColor(account.status)}`}>
                            <span className="w-1.5 h-1.5 rounded-full mr-2" style={{backgroundColor: getStatusDotColor(account.status)}}></span>
                            {account.status === 'active'
                              ? 'Hoạt Động'
                              : account.status === 'locked'
                              ? 'Tạm Khoá'
                              : 'Lưu Trữ'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2 items-center justify-center">
                            <Tooltip text="Chỉnh sửa tài khoản">
                              <button
                                onClick={() => handleEdit(account)}
                                aria-label={`Chỉnh sửa ${account.email}`}
                                className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors disabled:opacity-50"
                                disabled={loading}
                              >
                                <Edit2 size={16} />
                              </button>
                            </Tooltip>
                            <Tooltip text="Xóa tài khoản">
                              <button
                                onClick={() => {
                                  setDeletingId(account.id);
                                  setShowDeleteModal(true);
                                }}
                                aria-label={`Xóa ${account.email}`}
                                className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors disabled:opacity-50"
                                disabled={loading}
                              >
                                <Trash2 size={16} />
                              </button>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState hasSearch={searchQuery.length > 0} onAddClick={handleOpenAddModal} />
          )}
        </div>

        {/* Add/Edit Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200" onClick={(e) => { if (e.target === e.currentTarget) guardedClose(); }}>
            <div onClick={(e) => e.stopPropagation()} onChange={markDirty} className="bg-slate-800 border border-slate-700 rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
              <h2 className="text-xl md:text-2xl font-bold text-white mb-6" id="modal-title">
                {editingId !== null ? 'Chỉnh Sửa Tài Khoản Email' : 'Thêm Tài Khoản Email Mới'}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-ink-bright mb-2">
                    Email *
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      if (formErrors.email) setFormErrors({ ...formErrors, email: '' });
                    }}
                    aria-invalid={!!formErrors.email}
                    aria-describedby={formErrors.email ? 'email-error' : undefined}
                    className={`w-full bg-slate-700 border ${formErrors.email ? 'border-red-500' : 'border-slate-600'} rounded px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 ${formErrors.email ? 'focus:ring-red-500/50' : 'focus:ring-blue-500/50'} text-sm transition`}
                    placeholder="user@example.com"
                  />
                  {formErrors.email && (
                    <p id="email-error" className="text-red-400 text-xs mt-1 flex items-center gap-1">
                      <AlertCircle size={14} />
                      {formErrors.email}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="provider" className="block text-sm font-medium text-ink-bright mb-2">
                    Nhà Cung Cấp *
                  </label>
                  <select
                    id="provider"
                    value={formData.provider || ''}
                    onChange={(e) => {
                      setFormData({ ...formData, provider: e.target.value.toLowerCase() });
                      if (formErrors.provider) setFormErrors({ ...formErrors, provider: '' });
                    }}
                    aria-invalid={!!formErrors.provider}
                    aria-describedby={formErrors.provider ? 'provider-error' : undefined}
                    className={`w-full bg-slate-700 border ${formErrors.provider ? 'border-red-500' : 'border-slate-600'} rounded px-3 py-2 text-white focus:outline-none focus:ring-2 ${formErrors.provider ? 'focus:ring-red-500/50' : 'focus:ring-blue-500/50'} text-sm transition`}
                  >
                    <option value="">-- Chọn Nhà Cung Cấp --</option>
                    <option value="gmail">Gmail</option>
                    <option value="microsoft">Outlook / Microsoft</option>
                    <option value="yahoo">Yahoo</option>
                    <option value="icloud">iCloud</option>
                    <option value="protonmail">ProtonMail</option>
                    <option value="other">Khác</option>
                  </select>
                  {formErrors.provider && (
                    <p id="provider-error" className="text-red-400 text-xs mt-1 flex items-center gap-1">
                      <AlertCircle size={14} />
                      {formErrors.provider}
                    </p>
                  )}
                </div>

                {/* Người sử dụng theo cây cơ cấu: Công Ty → Phòng Ban → Bộ Phận → Nhân sự */}
                <div className="col-span-1 md:col-span-2 border-t border-slate-700 pt-4">
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">
                    Người Sử Dụng (theo cơ cấu tổ chức) *
                  </p>
                  <OrgPersonPicker value={orgValue} onChange={handleOrgChange} personLabel="Người Sử Dụng" companyLabel="Công Ty/Đơn Vị" />
                  {formErrors.nguoiSuDung && (
                    <p className="text-red-400 text-xs mt-2 flex items-center gap-1">
                      <AlertCircle size={14} />
                      {formErrors.nguoiSuDung}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="createdDate" className="block text-sm font-medium text-ink-bright mb-2">
                    Ngày Tạo
                  </label>
                  <DateInputVN
                    id="createdDate"
                    value={formData.createdDate || ''}
                    onChange={(e) => setFormData({ ...formData, createdDate: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm transition"
                  />
                </div>
                <div>
                  <label htmlFor="status" className="block text-sm font-medium text-ink-bright mb-2">
                    Trạng Thái
                  </label>
                  <select
                    id="status"
                    value={formData.status || 'active'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'locked' | 'archived' })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm transition"
                  >
                    <option value="active">Đang Hoạt Động</option>
                    <option value="locked">Tạm Khoá</option>
                    <option value="archived">Lưu Trữ</option>
                  </select>
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label htmlFor="notes" className="block text-sm font-medium text-ink-bright mb-2">
                    Ghi Chú
                  </label>
                  <textarea
                    id="notes"
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm transition"
                    placeholder="Nhập ghi chú..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex gap-4 justify-end mt-8 pt-6 border-t border-slate-700">
                <button
                  onClick={guardedClose}
                  aria-label="Hủy thao tác"
                  className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition disabled:opacity-50 text-sm font-medium"
                  disabled={loading}
                >
                  Hủy
                </button>
                <button
                  onClick={handleAddOrUpdate}
                  aria-label={editingId ? 'Cập nhật tài khoản email' : 'Thêm tài khoản email mới'}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition disabled:opacity-50 text-sm font-medium disabled:bg-blue-600/50"
                  disabled={loading}
                >
                  {loading ? '...Đang xử lý' : editingId !== null ? 'Cập Nhật' : 'Thêm'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200" onClick={(e) => { if (e.target === e.currentTarget) closeDeleteModal(); }}>
            <div onClick={(e) => e.stopPropagation()} className="bg-slate-800 border border-slate-700 rounded-lg max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-red-900/30 p-2 rounded-lg">
                  <AlertTriangle size={24} className="text-red-400" />
                </div>
                <h2 className="text-xl font-bold text-white">Xóa Tài Khoản Email</h2>
              </div>
              <p className="text-ink-muted mb-6 text-sm">
                Bạn chắc chắn muốn xóa tài khoản này? Hành động này không thể hoàn tác.
              </p>
              <div className="flex gap-4 justify-end">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeletingId(null);
                  }}
                  aria-label="Hủy xóa"
                  className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition disabled:opacity-50 text-sm font-medium"
                  disabled={loading}
                >
                  Hủy
                </button>
                <button
                  onClick={handleDelete}
                  aria-label="Xác nhận xóa tài khoản"
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition disabled:opacity-50 text-sm font-medium disabled:bg-red-600/50"
                  disabled={loading}
                >
                  {loading ? '...Đang xóa' : 'Xóa'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
