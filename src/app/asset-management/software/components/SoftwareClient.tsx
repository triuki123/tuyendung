'use client';

import React, { useState, useEffect } from 'react';
import { Search, Plus, Trash2, Edit2, Copy, Check, Package, ChevronDown, DollarSign, AlertCircle, TrendingUp } from 'lucide-react';
import DateInputVN from '@/components/ui/DateInputVN';
import MoneyInput from '@/components/ui/MoneyInput';
import OrgPersonPicker, { OrgPersonValue } from '@/components/ui/OrgPersonPicker';
import { useToast } from '@/context/ToastContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

const formatVND = (amount: number) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateString: string) => {
  if (!dateString) return '—';
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
};

const getSoftwareStatusColor = (status: string) => {
  switch (status) {
    case 'active':
      return {
        dot: 'bg-emerald-400',
        text: 'text-emerald-400',
        badge: 'bg-emerald-900/30 border-emerald-700/50 text-emerald-400'
      };
    case 'expiring':
      return {
        dot: 'bg-amber-400',
        text: 'text-amber-400',
        badge: 'bg-amber-900/30 border-amber-700/50 text-amber-400'
      };
    case 'expired':
      return {
        dot: 'bg-red-400',
        text: 'text-red-400',
        badge: 'bg-red-900/30 border-red-700/50 text-red-400'
      };
    default:
      return {
        dot: 'bg-gray-400',
        text: 'text-gray-400',
        badge: 'bg-gray-900/30 border-gray-700/50 text-gray-400'
      };
  }
};

interface Software {
  id: string;
  name: string;
  vendor: string;
  version: string;
  licenseType: string;
  totalLicenses: number;
  usedLicenses: number;
  unitCost: number;
  purchaseDate: string;
  renewalDate: string;
  category: string;
  manager: string;
  department: string;
  companyId: string | null;
  managerUserId: string | null;
  departmentId: string | null;
  subDepartmentId: string | null;
  status: 'active' | 'expiring' | 'expired';
  notes: string;
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  bgColor?: string;
}

function StatCard({ label, value, icon, bgColor = 'from-blue-600/20 to-blue-600/10' }: StatCardProps) {
  return (
    <div className={`bg-gradient-to-br ${bgColor} border border-slate-700/50 rounded-xl p-5 md:p-6 hover:border-slate-600/80 transition-all duration-200 group`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-ink-muted text-xs md:text-sm font-medium mb-2">{label}</p>
          <p className="text-2xl md:text-3xl font-bold text-white">{value}</p>
        </div>
        {icon && <div className="text-ink-muted group-hover:text-ink-bright transition-colors flex-shrink-0">{icon}</div>}
      </div>
    </div>
  );
}

interface SoftwareCardProps {
  item: Software;
  onEdit: (item: Software) => void;
  onDelete: (id: string) => void;
  onCopy: (text: string, id: string) => void;
  copiedId: string | null;
  loading: boolean;
}

function SoftwareCard({ item, onEdit, onDelete, onCopy, copiedId, loading }: SoftwareCardProps) {
  const [expanded, setExpanded] = useState(false);
  const licensePercent = item.totalLicenses > 0 ? Math.round((item.usedLicenses / item.totalLicenses) * 100) : 0;
  const totalCost = item.unitCost * item.totalLicenses;

  const statusColor = getSoftwareStatusColor(item.status);

  return (
    <div className="bg-gradient-to-br from-slate-800/50 to-slate-800/30 border border-slate-700 rounded-lg overflow-hidden">
      <div className="p-4 md:p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${statusColor.dot}`} />
              <h3 className="text-white font-semibold truncate">{item.name}</h3>
              <button
                onClick={() => onCopy(item.name, item.id)}
                className="text-ink-muted hover:text-blue-400 transition flex-shrink-0"
              >
                {copiedId === item.id ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <p className="text-ink-muted text-xs md:text-sm">{item.vendor}</p>
          </div>
          <span className={`px-2 py-1 rounded text-xs font-medium ${statusColor.badge} border whitespace-nowrap flex-shrink-0`}>
            {item.status === 'active' ? '✓ Hoạt Động' : item.status === 'expiring' ? '⚠ Sắp Hết' : '✕ Hết Hạn'}
          </span>
        </div>

        {/* License Usage */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-ink-muted">Giấy Phép</span>
            <span className="text-xs font-medium text-white">{licensePercent}%</span>
          </div>
          <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-purple-400 transition-all"
              style={{ width: `${licensePercent}%` }}
            />
          </div>
          <p className="text-xs text-ink-muted mt-1">{item.usedLicenses} / {item.totalLicenses}</p>
        </div>

        {/* Essential Info Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <p className="text-xs text-ink-muted mb-1">Chi Phí</p>
            <p className="text-sm font-medium text-white truncate">{formatVND(totalCost)}</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted mb-1">Loại Giấy Phép</p>
            <p className="text-sm text-white capitalize">{item.licenseType}</p>
          </div>
        </div>

        {/* Expandable Details */}
        <div className={`overflow-hidden transition-all ${expanded ? 'max-h-64' : 'max-h-0'}`}>
          <div className="border-t border-slate-700 pt-4 space-y-3">
            <div>
              <p className="text-xs text-ink-muted mb-1">Phiên Bản</p>
              <p className="text-sm text-white">{item.version || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted mb-1">Danh Mục</p>
              <p className="text-sm text-white capitalize">{item.category}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted mb-1">Gia Hạn</p>
              <p className="text-sm text-white">{formatDate(item.renewalDate)}</p>
            </div>
            {item.notes && (
              <div>
                <p className="text-xs text-ink-muted mb-1">Ghi Chú</p>
                <p className="text-sm text-white">{item.notes}</p>
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
            <button
              onClick={() => onEdit(item)}
              className="h-9 px-2.5 rounded-lg transition disabled:opacity-50 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 flex items-center justify-center min-h-[44px]"
              disabled={loading}
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={() => onDelete(item.id)}
              className="h-9 px-2.5 rounded-lg transition disabled:opacity-50 bg-red-600/20 hover:bg-red-600/30 text-red-400 flex items-center justify-center min-h-[44px]"
              disabled={loading}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const EMPTY_SOFTWARE_FORM: Partial<Software> = {
  name: '',
  vendor: '',
  version: '',
  licenseType: 'subscription',
  totalLicenses: 0,
  usedLicenses: 0,
  unitCost: 0,
  purchaseDate: '',
  renewalDate: '',
  category: 'productivity',
  manager: '',
  department: '',
  companyId: null,
  managerUserId: null,
  departmentId: null,
  subDepartmentId: null,
  notes: '',
};

export default function SoftwareClient() {
  const toast = useToast();
  const [software, setSoftware] = useState<Software[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [formData, setFormData] = useState<Partial<Software>>(EMPTY_SOFTWARE_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Đóng modal Thêm/Sửa (reset trạng thái form)
  const closeAddModal = React.useCallback(() => {
    setShowAddModal(false);
    setEditingId(null);
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
    fetchSoftware();
  }, []);

  const fetchSoftware = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/software');
      if (!response.ok) throw new Error('Failed to fetch software');
      const data = await response.json();
      setSoftware(data);
    } catch (error) {
      console.error('Error fetching software:', error);
      toast.error('Không thể tải dữ liệu phần mềm');
    } finally {
      setLoading(false);
    }
  };

  // Giá trị cho OrgPersonPicker (Công Ty → Phòng Ban → Bộ Phận → Người phụ trách)
  const orgValue: OrgPersonValue = {
    companyId: formData.companyId || null,
    departmentId: formData.departmentId || null,
    subDepartmentId: formData.subDepartmentId || null,
    userId: formData.managerUserId || null,
    userName: formData.manager || '',
  };
  const handleOrgChange = (v: OrgPersonValue) => {
    setFormData((prev) => ({
      ...prev,
      companyId: v.companyId,
      departmentId: v.departmentId,
      subDepartmentId: v.subDepartmentId,
      managerUserId: v.userId,
      manager: v.userName || '',
      department: v.departmentName ?? prev.department,
    }));
  };

  const filteredSoftware = software.filter(
    s =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.vendor.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    total: software.length,
    annualCost: software.reduce((sum, s) => sum + (s.unitCost * s.totalLicenses || 0), 0),
    expiring: software.filter(s => s.status === 'expiring' || s.status === 'expired').length,
    usagePercent: software.length > 0
      ? Math.round((software.reduce((sum, s) => sum + s.usedLicenses, 0) /
          software.reduce((sum, s) => sum + s.totalLicenses, 0)) * 100)
      : 0,
  };

  const handleAddOrUpdate = async () => {
    if (!formData.name?.trim() || !formData.vendor?.trim() || !formData.renewalDate) {
      toast.error('Vui lòng nhập Tên Phần Mềm, Hãng Sản Xuất và Ngày Gia Hạn');
      return;
    }

    try {
      setLoading(true);

      const dataToSend = {
        name: formData.name,
        vendor: formData.vendor,
        version: formData.version,
        licenseType: formData.licenseType,
        totalLicenses: formData.totalLicenses,
        usedLicenses: formData.usedLicenses,
        unitCost: formData.unitCost,
        purchaseDate: formData.purchaseDate || '',
        renewalDate: formData.renewalDate,
        category: formData.category,
        manager: formData.manager || '',
        department: formData.department || '',
        companyId: formData.companyId || null,
        managerUserId: formData.managerUserId || null,
        departmentId: formData.departmentId || null,
        subDepartmentId: formData.subDepartmentId || null,
        notes: formData.notes,
      };

      if (editingId) {
        const response = await fetch(`/api/software/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSend),
        });
        if (!response.ok) throw new Error('Failed to update software');
        await fetchSoftware();
      } else {
        const response = await fetch('/api/software', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSend),
        });
        if (!response.ok) throw new Error('Failed to create software');
        await fetchSoftware();
      }

      markClean();
      setFormData(EMPTY_SOFTWARE_FORM);
      setEditingId(null);
      setShowAddModal(false);
      toast.success('Phần mềm đã được lưu thành công!');
    } catch (error) {
      console.error('Error saving software:', error);
      toast.error('Không thể lưu dữ liệu phần mềm');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (item: Software) => {
    setFormData(item);
    setEditingId(item.id);
    setShowAddModal(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/software/${deletingId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete software');
      await fetchSoftware();
      setShowDeleteModal(false);
      setDeletingId(null);
    } catch (error) {
      console.error('Error deleting software:', error);
      toast.error('Không thể xóa phần mềm');
    } finally {
      setLoading(false);
    }
  };

  const getTableStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-900/30 text-emerald-400 border border-emerald-700';
      case 'expiring':
        return 'bg-orange-900/30 text-orange-400 border border-orange-700';
      case 'expired':
        return 'bg-red-900/30 text-red-400 border border-red-700';
      default:
        return 'bg-gray-900/30 text-gray-400 border border-gray-700';
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
        {/* Header */}
        <div className="mb-8 md:mb-10">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-3">Quản Lý Phần Mềm</h1>
          <p className="text-ink-muted text-sm md:text-base">Quản lý và theo dõi tất cả các phần mềm của bạn một cách hiệu quả</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
          <StatCard
            label="Tổng Phần Mềm"
            value={stats.total}
            icon={<Package size={24} />}
            bgColor="from-blue-600/20 to-blue-600/10"
          />
          <StatCard
            label="Chi Phí Hàng Năm"
            value={formatVND(stats.annualCost)}
            icon={<DollarSign size={24} />}
            bgColor="from-green-600/20 to-green-600/10"
          />
          <StatCard
            label="Sắp Hết Hạn"
            value={stats.expiring}
            icon={<AlertCircle size={24} />}
            bgColor="from-amber-600/20 to-amber-600/10"
          />
          <StatCard
            label="Mức Sử Dụng"
            value={`${stats.usagePercent}%`}
            icon={<TrendingUp size={24} />}
            bgColor="from-violet-600/20 to-violet-600/10"
          />
        </div>

        {/* Search and Add Button */}
        <div className="flex flex-col md:flex-row gap-3 md:gap-4 mb-8">
          <div className="flex-1 relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint group-focus-within:text-blue-400 transition-colors" size={18} />
            <input
              type="text"
              placeholder="Tìm kiếm phần mềm hoặc hãng sản xuất..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 focus:border-blue-500/50 rounded-lg pl-12 pr-4 py-3 text-sm md:text-base text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition duration-200"
            />
          </div>
          <button
            onClick={() => {
              setFormData(EMPTY_SOFTWARE_FORM);
              setEditingId(null);
              setShowAddModal(true);
            }}
            className="h-10 px-3 sm:px-4 rounded-lg flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 text-2xs sm:text-xs font-600 bg-blue-600 hover:bg-blue-700 text-white min-h-[44px]"
            disabled={loading}
          >
            <Plus size={18} className="sm:hidden" />
            <Plus size={16} className="hidden sm:block" />
            <span className="hidden sm:inline">Thêm Phần Mềm</span>
          </button>
        </div>

        {/* Software - Card View (Mobile/Tablet) */}
        <div className="lg:hidden">
          {filteredSoftware.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredSoftware.map((item) => (
                <SoftwareCard
                  key={item.id}
                  item={item}
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
            <div className="text-center py-12 bg-slate-800/30 rounded-lg border border-slate-700">
              <p className="text-ink-muted">
                {searchQuery ? 'Không tìm thấy phần mềm nào.' : 'Chưa có phần mềm nào. Hãy thêm phần mềm đầu tiên.'}
              </p>
            </div>
          )}
        </div>

        {/* Software - Table View (Desktop) */}
        <div className="hidden lg:block bg-slate-800/30 border border-slate-700/50 rounded-xl overflow-hidden">
          {filteredSoftware.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700/50 bg-slate-900/40">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ink-bright">Tên Phần Mềm</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ink-bright">Hãng Sản Xuất</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ink-bright">Phiên Bản</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ink-bright">Loại Giấy Phép</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ink-bright">Tổng/Dùng</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-ink-bright">Chi Phí</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ink-bright">Gia Hạn</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ink-bright">Trạng Thái</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-ink-bright">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {filteredSoftware.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-700/20 transition-colors duration-150">
                      <td className="px-4 py-3 text-white font-medium text-sm">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block w-2 h-2 rounded-full ${getSoftwareStatusColor(item.status).dot}`}></span>
                          {item.name}
                          <button
                            onClick={() => copyToClipboard(item.name, item.id)}
                            className="text-ink-muted hover:text-blue-400 transition-colors"
                            title="Sao chép"
                          >
                            {copiedId === item.id ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-bright text-sm">{item.vendor}</td>
                      <td className="px-4 py-3 text-ink-muted text-sm">{item.version || '—'}</td>
                      <td className="px-4 py-3 text-ink-bright text-sm capitalize">{item.licenseType}</td>
                      <td className="px-4 py-3 text-ink-bright text-sm">
                        <div className="flex flex-col gap-2">
                          <span className="text-xs text-ink-muted">{item.usedLicenses} / {item.totalLicenses}</span>
                          <div className="w-20 h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-violet-500 to-purple-400 transition-all duration-300"
                              style={{ width: item.totalLicenses > 0 ? `${Math.round((item.usedLicenses / item.totalLicenses) * 100)}%` : '0%' }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white text-sm font-semibold text-right">{formatVND(item.unitCost * item.totalLicenses)}</td>
                      <td className="px-4 py-3 text-ink-bright text-sm">{formatDate(item.renewalDate)}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold" style={{
                          backgroundColor: item.status === 'active' ? 'rgba(16, 185, 129, 0.15)' : item.status === 'expiring' ? 'rgba(251, 146, 60, 0.15)' : 'rgba(239, 68, 68, 0.15)'
                        }}>
                          <span className="w-1.5 h-1.5 rounded-full mr-2" style={{backgroundColor: item.status === 'active' ? '#10b981' : item.status === 'expiring' ? '#f59e0b' : '#ef4444'}}></span>
                          <span className={getSoftwareStatusColor(item.status).text}>
                            {item.status === 'active'
                              ? 'Hoạt Động'
                              : item.status === 'expiring'
                              ? 'Sắp Hết'
                              : 'Hết Hạn'}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 items-center justify-center">
                          <button
                            onClick={() => handleEdit(item)}
                            className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors"
                            disabled={loading}
                            title="Chỉnh sửa"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => {
                              setDeletingId(item.id);
                              setShowDeleteModal(true);
                            }}
                            className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                            disabled={loading}
                            title="Xoá"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center">
              <p className="text-ink-muted text-base">
                {searchQuery ? '❌ Không tìm thấy phần mềm nào.' : '📭 Chưa có phần mềm nào. Hãy thêm phần mềm đầu tiên.'}
              </p>
            </div>
          )}
        </div>

        {/* Add/Edit Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={(e) => { if (e.target === e.currentTarget) guardedClose(); }}>
            <div onClick={(e) => e.stopPropagation()} onChange={markDirty} className="bg-slate-800 border border-slate-700 rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl md:text-2xl font-bold text-white mb-6">
                {editingId !== null ? 'Chỉnh Sửa Phần Mềm' : 'Thêm Phần Mềm Mới'}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-ink-bright mb-2">Tên Phần Mềm *</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                    placeholder="Microsoft Office..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-bright mb-2">Hãng Sản Xuất *</label>
                  <input
                    type="text"
                    value={formData.vendor || ''}
                    onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                    placeholder="Microsoft..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink-bright mb-2">Phiên Bản</label>
                  <input
                    type="text"
                    value={formData.version || ''}
                    onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                    placeholder="2024"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-bright mb-2">Loại Giấy Phép</label>
                  <select
                    value={formData.licenseType || 'subscription'}
                    onChange={(e) => setFormData({ ...formData, licenseType: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                  >
                    <option value="subscription">Đăng Ký</option>
                    <option value="perpetual">Vĩnh Viễn</option>
                    <option value="trial">Dùng Thử</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink-bright mb-2">Tổng Giấy Phép</label>
                  <input
                    type="number"
                    value={formData.totalLicenses || 0}
                    onChange={(e) => setFormData({ ...formData, totalLicenses: parseInt(e.target.value) })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-bright mb-2">Giấy Phép Đang Dùng</label>
                  <input
                    type="number"
                    value={formData.usedLicenses || 0}
                    onChange={(e) => setFormData({ ...formData, usedLicenses: parseInt(e.target.value) })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink-bright mb-2">Chi Phí Mỗi Giấy Phép (VND)</label>
                  <MoneyInput
                    value={formData.unitCost}
                    onValueChange={(n) => setFormData({ ...formData, unitCost: n })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-bright mb-2">Ngày Gia Hạn *</label>
                  <DateInputVN
                    value={formData.renewalDate || ''}
                    onChange={(e) => setFormData({ ...formData, renewalDate: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink-bright mb-2">Danh Mục</label>
                  <select
                    value={formData.category || 'productivity'}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                  >
                    <option value="productivity">Năng Suất</option>
                    <option value="development">Phát Triển</option>
                    <option value="security">Bảo Mật</option>
                    <option value="communication">Giao Tiếp</option>
                    <option value="other">Khác</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink-bright mb-2">Ngày Mua</label>
                  <DateInputVN
                    value={formData.purchaseDate || ''}
                    onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                  />
                </div>

                {/* Người phụ trách theo cây cơ cấu: Công Ty → Phòng Ban → Bộ Phận → Nhân sự */}
                <div className="col-span-1 md:col-span-2 border-t border-slate-700 pt-4">
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">
                    Người Phụ Trách (theo cơ cấu tổ chức)
                  </p>
                  <OrgPersonPicker value={orgValue} onChange={handleOrgChange} personLabel="Người Phụ Trách" companyLabel="Công Ty Sở Hữu" />
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-ink-bright mb-2">Trạng Thái (Tự động)</label>
                  <div className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-ink-muted text-sm">
                    Trạng thái được tính tự động dựa trên ngày gia hạn:
                    <br />
                    • Còn &gt; 30 ngày = Hoạt Động
                    <br />
                    • Còn 0-30 ngày = Sắp Hết Hạn
                    <br />
                    • Quá hạn = Hết Hạn
                  </div>
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-ink-bright mb-2">Ghi Chú</label>
                  <textarea
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                    placeholder="Nhập ghi chú..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex gap-4 justify-end">
                <button
                  onClick={guardedClose}
                  className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition disabled:opacity-50 text-sm font-medium"
                  disabled={loading}
                >
                  Hủy
                </button>
                <button
                  onClick={handleAddOrUpdate}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition disabled:opacity-50 text-sm font-medium"
                  disabled={loading}
                >
                  {editingId !== null ? 'Cập Nhật' : 'Thêm'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={(e) => { if (e.target === e.currentTarget) closeDeleteModal(); }}>
            <div onClick={(e) => e.stopPropagation()} className="bg-slate-800 border border-slate-700 rounded-lg max-w-sm w-full p-6">
              <h2 className="text-xl font-bold text-white mb-4">Xóa Phần Mềm</h2>
              <p className="text-ink-muted mb-6 text-sm">
                Bạn chắc chắn muốn xóa phần mềm này? Hành động này không thể hoàn tác.
              </p>
              <div className="flex gap-4 justify-end">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeletingId(null);
                  }}
                  className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition disabled:opacity-50 text-sm font-medium"
                  disabled={loading}
                >
                  Hủy
                </button>
                <button
                  onClick={handleDelete}
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition disabled:opacity-50 text-sm font-medium"
                  disabled={loading}
                >
                  Xóa
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
