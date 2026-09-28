'use client';

import React, { useState, useEffect } from 'react';
import { Search, Plus, Trash2, Edit2, Copy, Check, Globe, TrendingUp, AlertCircle, DollarSign, ChevronDown, Eye, EyeOff } from 'lucide-react';
import DateInputVN from '@/components/ui/DateInputVN';
import MoneyInput from '@/components/ui/MoneyInput';
import OrgPersonPicker, { OrgPersonValue } from '@/components/ui/OrgPersonPicker';
import { useToast } from '@/context/ToastContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

interface Domain {
  id: string;
  domain: string;
  tld: string;
  registrar: string;
  registrationDate: string;
  expirationDate: string;
  renewalCost: number;
  cost: number;
  autoRenewal: boolean;
  dnsProvider: string;
  accountUsername: string;
  accountPassword: string;
  ownerCompany: string;
  manager: string;
  managerUserId: string | null;
  ownerCompanyId: string | null;
  departmentId: string | null;
  subDepartmentId: string | null;
  sslCertificate: string;
  sslExpiryDate: string;
  status: 'active' | 'expiring' | 'expired';
  notes: string;
}

// Responsive Card Component
const DomainCard = ({ domain, onEdit, onDelete, copiedId, setCopiedId, copyToClipboard, getStatusColor, formatVND }: any) => {
  const [expanded, setExpanded] = useState(false);
  const statusText = domain.status === 'active' ? 'Hoạt Động' : domain.status === 'expiring' ? 'Sắp Hết' : 'Hết Hạn';
  const statusColor = domain.status === 'active' ? '#10b981' : domain.status === 'expiring' ? '#f59e0b' : '#ef4444';

  return (
    <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4 md:p-6 hover:border-slate-600/80 transition-all duration-200">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-400"></span>
            <h3 className="text-white font-semibold truncate">{domain.domain}</h3>
            <button
              onClick={() => copyToClipboard(domain.domain, domain.id)}
              className="text-ink-muted hover:text-blue-400 transition-colors flex-shrink-0"
              title="Sao chép"
            >
              {copiedId === domain.id ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          <p className="text-ink-faint text-xs md:text-sm">{domain.registrar}</p>
        </div>
        <div className="flex-shrink-0">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${getStatusColor(domain.status)}`}>
            <span className="w-1.5 h-1.5 rounded-full mr-2" style={{backgroundColor: statusColor}}></span>
            {statusText}
          </span>
        </div>
      </div>

      {/* Main Info Grid */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 mb-4">
        <div>
          <p className="text-ink-faint text-xs font-medium mb-1">Nhà Đăng Ký</p>
          <p className="text-ink-bright text-sm truncate">{domain.registrar}</p>
        </div>
        <div>
          <p className="text-ink-faint text-xs font-medium mb-1">Hết Hạn</p>
          <p className="text-ink-bright text-sm">{domain.expirationDate || '—'}</p>
        </div>
        <div>
          <p className="text-ink-faint text-xs font-medium mb-1">Chi Phí</p>
          <p className="text-ink-bright text-sm font-medium">{formatVND(domain.renewalCost)}</p>
        </div>
        <div>
          <p className="text-ink-faint text-xs font-medium mb-1">Gia Hạn Tự Động</p>
          <div className="inline-flex items-center justify-center w-6 h-6 rounded-lg" style={{backgroundColor: domain.autoRenewal ? 'rgba(16, 185, 129, 0.1)' : 'rgba(100, 116, 139, 0.1)'}}>
            <span className={domain.autoRenewal ? 'text-emerald-400 text-sm' : 'text-ink-faint text-sm'}>
              {domain.autoRenewal ? '✓' : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Expandable Details */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-ink-muted hover:text-ink-bright text-sm mb-4 transition-colors"
      >
        <ChevronDown size={16} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        Chi tiết thêm
      </button>

      {expanded && (
        <div className="border-t border-slate-700/50 pt-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-ink-faint text-xs font-medium mb-1">Ngày Đăng Ký</p>
              <p className="text-ink-bright text-sm">{domain.registrationDate || '—'}</p>
            </div>
            <div>
              <p className="text-ink-faint text-xs font-medium mb-1">Nhà Cung Cấp DNS</p>
              <p className="text-ink-bright text-sm truncate">{domain.dnsProvider || '—'}</p>
            </div>
          </div>
          {domain.notes && (
            <div>
              <p className="text-ink-faint text-xs font-medium mb-1">Ghi Chú</p>
              <p className="text-ink-bright text-sm line-clamp-2">{domain.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 sm:gap-2.5 pt-4 border-t border-slate-700/50">
        <button
          onClick={() => onEdit(domain)}
          className="flex-1 h-9 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors text-sm font-medium flex items-center justify-center min-h-[44px]"
          title="Chỉnh sửa"
        >
          <Edit2 size={16} />
        </button>
        <button
          onClick={() => onDelete(domain.id)}
          className="flex-1 h-9 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors text-sm font-medium flex items-center justify-center min-h-[44px]"
          title="Xóa"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
};

// Desktop Table Component
const DomainTable = ({ domains, onEdit, onDelete, copiedId, setCopiedId, copyToClipboard, getStatusColor, formatVND, loading }: any) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-700/50 bg-slate-900/40">
            <th className="px-4 py-3 text-left text-xs font-semibold text-ink-bright whitespace-nowrap">Tên Miền</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-ink-bright whitespace-nowrap">Nhà Đăng Ký</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-ink-bright whitespace-nowrap">Đăng Ký</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-ink-bright whitespace-nowrap">Hết Hạn</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-ink-bright whitespace-nowrap">Chi Phí</th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-ink-bright whitespace-nowrap">Gia Hạn</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-ink-bright whitespace-nowrap">DNS</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-ink-bright whitespace-nowrap">Trạng Thái</th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-ink-bright whitespace-nowrap">Thao Tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/30">
          {domains.map((domain: Domain) => (
            <tr key={domain.id} className="hover:bg-slate-700/20 transition-colors duration-150">
              <td className="px-4 py-3 text-white font-medium">
                <div className="flex items-center gap-2">
                  <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-400"></span>
                  <span className="truncate">{domain.domain}</span>
                  <button
                    onClick={() => copyToClipboard(domain.domain, domain.id)}
                    className="text-ink-muted hover:text-blue-400 transition-colors flex-shrink-0"
                    title="Sao chép"
                  >
                    {copiedId === domain.id ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </td>
              <td className="px-4 py-3 text-ink-bright text-sm truncate">{domain.registrar}</td>
              <td className="px-4 py-3 text-ink-bright text-sm whitespace-nowrap">{domain.registrationDate || '—'}</td>
              <td className="px-4 py-3 text-ink-bright text-sm whitespace-nowrap font-medium">{domain.expirationDate || '—'}</td>
              <td className="px-4 py-3 text-ink-bright text-sm font-medium whitespace-nowrap">{formatVND(domain.renewalCost)}</td>
              <td className="px-4 py-3">
                <div className="flex justify-center">
                  <div className="inline-flex items-center justify-center w-7 h-7 rounded-lg" style={{backgroundColor: domain.autoRenewal ? 'rgba(16, 185, 129, 0.1)' : 'rgba(100, 116, 139, 0.1)'}}>
                    <span className={domain.autoRenewal ? 'text-emerald-400 text-sm' : 'text-ink-faint'}>
                      {domain.autoRenewal ? '✓' : '—'}
                    </span>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-ink-bright text-sm truncate">{domain.dnsProvider || '—'}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${getStatusColor(domain.status)}`}>
                  <span className="w-1.5 h-1.5 rounded-full mr-2" style={{backgroundColor: domain.status === 'active' ? '#10b981' : domain.status === 'expiring' ? '#f59e0b' : '#ef4444'}}></span>
                  {domain.status === 'active' ? 'Hoạt Động' : domain.status === 'expiring' ? 'Sắp Hết' : 'Hết Hạn'}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => onEdit(domain)}
                    className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors disabled:opacity-50"
                    disabled={loading}
                    title="Chỉnh sửa"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => onDelete(domain.id)}
                    className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors disabled:opacity-50"
                    disabled={loading}
                    title="Xóa"
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
  );
};

// Main Component
const StatCard = ({ icon: Icon, label, value, color }: any) => (
  <div className="bg-gradient-to-br from-slate-800 to-slate-800/50 border border-slate-700/50 rounded-xl p-4 md:p-6 hover:border-slate-600/80 transition-all duration-200">
    <div className="flex items-start justify-between">
      <div className="flex-1 min-w-0">
        <p className="text-ink-muted text-xs md:text-sm font-medium mb-2">{label}</p>
        <p className={`text-2xl md:text-3xl font-bold ${color} truncate`}>{value}</p>
      </div>
      <div className={`p-2 md:p-3 rounded-lg flex-shrink-0 ${color.replace('text-', 'bg-').replace('300', '500/20')}`}>
        <Icon size={20} className={`${color}`} />
      </div>
    </div>
  </div>
);

const EMPTY_FORM: Partial<Domain> = {
  domain: '',
  tld: '',
  registrar: '',
  registrationDate: '',
  expirationDate: '',
  renewalCost: 0,
  cost: 0,
  autoRenewal: false,
  dnsProvider: '',
  accountUsername: '',
  accountPassword: '',
  ownerCompany: '',
  manager: '',
  managerUserId: null,
  ownerCompanyId: null,
  departmentId: null,
  subDepartmentId: null,
  sslCertificate: '',
  sslExpiryDate: '',
  status: 'active',
  notes: '',
};

export default function DomainsClient() {
  const toast = useToast();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [formData, setFormData] = useState<Partial<Domain>>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Đóng modal Thêm/Sửa (reset trạng thái form)
  const closeAddModal = React.useCallback(() => {
    setShowAddModal(false);
    setEditingId(null);
    setShowPassword(false);
  }, []);
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(closeAddModal);

  // Đóng modal Xóa (xác nhận — không cần guard)
  const closeDeleteModal = React.useCallback(() => {
    setShowDeleteModal(false);
    setDeletingId(null);
  }, []);

  // ESC: ưu tiên modal đang mở (form trước → guarded, xóa sau)
  useEscapeKey(
    () => { if (showAddModal) guardedClose(); else if (showDeleteModal) closeDeleteModal(); },
    showAddModal || showDeleteModal,
  );

  useEffect(() => {
    fetchDomains();
  }, []);

  const fetchDomains = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/domains');
      if (!response.ok) throw new Error('Failed to fetch domains');
      const data = await response.json();
      setDomains(data);
    } catch (error) {
      console.error('Error fetching domains:', error);
      toast.error('Không thể tải dữ liệu tên miền');
    } finally {
      setLoading(false);
    }
  };

  // Giá trị cho OrgPersonPicker (Công Ty → Phòng Ban → Bộ Phận → Người phụ trách)
  const orgValue: OrgPersonValue = {
    companyId: formData.ownerCompanyId || null,
    departmentId: formData.departmentId || null,
    subDepartmentId: formData.subDepartmentId || null,
    userId: formData.managerUserId || null,
    userName: formData.manager || '',
  };
  const handleOrgChange = (v: OrgPersonValue) => {
    setFormData((prev) => ({
      ...prev,
      ownerCompanyId: v.companyId,
      ownerCompany: v.companyName ?? prev.ownerCompany,
      departmentId: v.departmentId,
      subDepartmentId: v.subDepartmentId,
      managerUserId: v.userId,
      manager: v.userName || '',
    }));
  };

  const filteredDomains = domains.filter(
    domain =>
      domain.domain.toLowerCase().includes(searchQuery.toLowerCase()) ||
      domain.registrar.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    total: domains.length,
    active: domains.filter(d => d.status === 'active').length,
    expiring: domains.filter(d => d.status === 'expiring' || d.status === 'expired').length,
    totalCost: domains.reduce((sum, d) => sum + (d.renewalCost || 0), 0),
  };

  const handleAddOrUpdate = async () => {
    if (!formData.domain?.trim() || !formData.registrar?.trim()) {
      toast.error('Vui lòng nhập Tên Miền và Nhà Đăng Ký');
      return;
    }

    try {
      setLoading(true);

      const dataToSend = {
        domain: formData.domain,
        tld: formData.tld || '',
        registrar: formData.registrar,
        registrationDate: formData.registrationDate || '',
        expirationDate: formData.expirationDate || '',
        renewalCost: formData.renewalCost || 0,
        cost: formData.cost || 0,
        autoRenewal: formData.autoRenewal || false,
        dnsProvider: formData.dnsProvider || '',
        accountusername: formData.accountUsername || '',
        accountpassword: formData.accountPassword || '',
        ownercompany: formData.ownerCompany || '',
        manager: formData.manager || '',
        manager_user_id: formData.managerUserId || null,
        owner_company_id: formData.ownerCompanyId || null,
        department_id: formData.departmentId || null,
        sub_department_id: formData.subDepartmentId || null,
        sslcertificate: formData.sslCertificate || '',
        sslexpirydate: formData.sslExpiryDate || '',
        notes: formData.notes || '',
      };

      if (editingId) {
        const response = await fetch(`/api/domains/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSend),
        });
        if (!response.ok) throw new Error('Failed to update domain');
        await fetchDomains();
      } else {
        const response = await fetch('/api/domains', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSend),
        });
        if (!response.ok) throw new Error('Failed to create domain');
        await fetchDomains();
      }

      markClean();
      setFormData(EMPTY_FORM);
      setEditingId(null);
      setShowAddModal(false);
      setShowPassword(false);
    } catch (error) {
      console.error('Error saving domain:', error);
      toast.error('Không thể lưu dữ liệu tên miền');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (domain: Domain) => {
    setFormData(domain);
    setEditingId(domain.id);
    setShowAddModal(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/domains/${deletingId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete domain');
      await fetchDomains();
      setShowDeleteModal(false);
      setDeletingId(null);
    } catch (error) {
      console.error('Error deleting domain:', error);
      toast.error('Không thể xóa tên miền');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
      case 'expiring':
        return 'bg-amber-500/15 text-amber-300 border border-amber-500/30';
      case 'expired':
        return 'bg-red-500/15 text-red-300 border border-red-500/30';
      default:
        return 'bg-slate-500/15 text-ink-bright border border-slate-500/30';
    }
  };

  const formatVND = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8 md:mb-10">
          <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Globe size={24} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white">Quản Lý Tên Miền</h1>
              <p className="text-ink-muted text-sm md:text-base mt-1">Theo dõi và quản lý tất cả các tên miền của công ty</p>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8 md:mb-10">
          <StatCard icon={Globe} label="Tổng Tên Miền" value={stats.total} color="text-blue-300" />
          <StatCard icon={TrendingUp} label="Hoạt Động" value={stats.active} color="text-emerald-300" />
          <StatCard icon={AlertCircle} label="Sắp Hết Hạn" value={stats.expiring} color="text-amber-300" />
          <StatCard icon={DollarSign} label="Tổng Chi Phí" value={formatVND(stats.totalCost)} color="text-indigo-300" />
        </div>

        {/* Search and Add Button */}
        <div className="flex flex-col sm:flex-row gap-3 md:gap-4 mb-6 md:mb-8">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" size={20} />
            <input
              type="text"
              placeholder="Tìm kiếm tên miền hoặc nhà đăng ký..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg pl-12 pr-4 py-2.5 md:py-3 text-white placeholder-slate-500 text-sm md:text-base focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
            />
          </div>
          <button
            onClick={() => {
              setFormData(EMPTY_FORM);
              setEditingId(null);
              setShowPassword(false);
              setShowAddModal(true);
            }}
            className="h-10 px-3 sm:px-4 rounded-lg flex items-center justify-center gap-2 font-600 transition-all duration-200 disabled:opacity-50 text-2xs sm:text-xs bg-blue-600 hover:bg-blue-700 text-white min-h-[44px] whitespace-nowrap"
            disabled={loading}
          >
            <Plus size={18} className="sm:hidden" />
            <Plus size={16} className="hidden sm:block" />
            <span className="hidden sm:inline">Thêm Tên Miền</span>
          </button>
        </div>

        {/* Responsive View Toggle */}
        {filteredDomains.length > 0 && (
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl overflow-hidden backdrop-blur-sm">
            {/* Desktop Table View (hidden on tablet and below) */}
            <div className="hidden lg:block">
              <DomainTable
                domains={filteredDomains}
                onEdit={handleEdit}
                onDelete={(id: string) => { setDeletingId(id); setShowDeleteModal(true); }}
                copiedId={copiedId}
                setCopiedId={setCopiedId}
                copyToClipboard={copyToClipboard}
                getStatusColor={getStatusColor}
                formatVND={formatVND}
                loading={loading}
              />
            </div>

            {/* Mobile/Tablet Card View (shown on tablet and below) */}
            <div className="lg:hidden p-4 md:p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredDomains.map((domain) => (
                  <DomainCard
                    key={domain.id}
                    domain={domain}
                    onEdit={handleEdit}
                    onDelete={(id: string) => { setDeletingId(id); setShowDeleteModal(true); }}
                    copiedId={copiedId}
                    setCopiedId={setCopiedId}
                    copyToClipboard={copyToClipboard}
                    getStatusColor={getStatusColor}
                    formatVND={formatVND}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {filteredDomains.length === 0 && (
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl overflow-hidden backdrop-blur-sm p-12 text-center">
            <Globe size={48} className="mx-auto text-slate-600 mb-4" />
            <p className="text-ink-muted text-lg">
              {searchQuery ? 'Không tìm thấy tên miền nào.' : 'Chưa có tên miền nào. Hãy thêm tên miền đầu tiên.'}
            </p>
          </div>
        )}

        {/* Add/Edit Modal */}
        {showAddModal && (
          <div
            className="fixed inset-0 bg-black/60 flex items-start justify-center p-4 z-50 backdrop-blur-sm overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) guardedClose();
            }}
          >
            <div onClick={(e) => e.stopPropagation()} onChange={markDirty} className="bg-slate-800 border border-slate-700 rounded-xl max-w-2xl w-full p-6 md:p-8 shadow-2xl my-6">
              <h2 className="text-xl md:text-2xl font-bold text-white mb-6">
                {editingId !== null ? 'Chỉnh Sửa Tên Miền' : 'Thêm Tên Miền Mới'}
              </h2>

              <div className="space-y-5">
                {/* Nhóm: Thông tin cơ bản */}
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Thông tin cơ bản</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-ink-bright mb-2">Tên Miền *</label>
                    <input
                      type="text"
                      value={formData.domain || ''}
                      onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all text-sm"
                      placeholder="example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-ink-bright mb-2">TLD (đuôi miền)</label>
                    <input
                      type="text"
                      value={formData.tld || ''}
                      onChange={(e) => setFormData({ ...formData, tld: e.target.value })}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all text-sm"
                      placeholder=".com, .vn, .net..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-ink-bright mb-2">Nhà Đăng Ký *</label>
                    <input
                      type="text"
                      value={formData.registrar || ''}
                      onChange={(e) => setFormData({ ...formData, registrar: e.target.value })}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all text-sm"
                      placeholder="GoDaddy, Namecheap, VNPT..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-ink-bright mb-2">Nhà Cung Cấp DNS</label>
                    <input
                      type="text"
                      value={formData.dnsProvider || ''}
                      onChange={(e) => setFormData({ ...formData, dnsProvider: e.target.value })}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all text-sm"
                      placeholder="Cloudflare, Route53..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-ink-bright mb-2">Ngày Đăng Ký</label>
                    <DateInputVN
                      value={formData.registrationDate || ''}
                      onChange={(e) => setFormData({ ...formData, registrationDate: e.target.value })}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-ink-bright mb-2">Hết Hạn</label>
                    <DateInputVN
                      value={formData.expirationDate || ''}
                      onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all text-sm"
                    />
                  </div>
                </div>

                {/* Nhóm: Chi phí */}
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider pt-1">Chi phí</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-ink-bright mb-2">Chi Phí Mua Ban Đầu (VND)</label>
                    <MoneyInput
                      value={formData.cost}
                      onValueChange={(n) => setFormData({ ...formData, cost: n })}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all text-sm"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-ink-bright mb-2">Chi Phí Gia Hạn (VND)</label>
                    <MoneyInput
                      value={formData.renewalCost}
                      onValueChange={(n) => setFormData({ ...formData, renewalCost: n })}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all text-sm"
                      placeholder="0"
                    />
                  </div>
                  <div className="flex items-center">
                    <label className="flex items-center gap-3 text-sm font-medium text-ink-bright cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.autoRenewal || false}
                        onChange={(e) => setFormData({ ...formData, autoRenewal: e.target.checked })}
                        className="w-5 h-5 rounded border-slate-600 accent-blue-500"
                      />
                      Tự Động Gia Hạn
                    </label>
                  </div>
                </div>

                {/* Nhóm: Tài khoản đăng ký */}
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider pt-1">Tài khoản đăng ký</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-ink-bright mb-2">Tên Đăng Nhập</label>
                    <input
                      type="text"
                      value={formData.accountUsername || ''}
                      onChange={(e) => setFormData({ ...formData, accountUsername: e.target.value })}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all text-sm"
                      placeholder="username@example.com"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-ink-bright mb-2">Mật Khẩu</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={formData.accountPassword || ''}
                        onChange={(e) => setFormData({ ...formData, accountPassword: e.target.value })}
                        className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 pr-10 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all text-sm"
                        placeholder="••••••••"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-bright"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Nhóm: SSL */}
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider pt-1">Chứng chỉ SSL</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-ink-bright mb-2">Loại / Nhà cấp SSL</label>
                    <input
                      type="text"
                      value={formData.sslCertificate || ''}
                      onChange={(e) => setFormData({ ...formData, sslCertificate: e.target.value })}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all text-sm"
                      placeholder="Let's Encrypt, DigiCert..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-ink-bright mb-2">SSL Hết Hạn</label>
                    <DateInputVN
                      value={formData.sslExpiryDate || ''}
                      onChange={(e) => setFormData({ ...formData, sslExpiryDate: e.target.value })}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all text-sm"
                    />
                  </div>
                </div>

                {/* Nhóm: Phụ trách theo cây cơ cấu: Công Ty → Phòng Ban → Bộ Phận → Nhân sự */}
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider pt-1">Phụ trách &amp; Sở hữu (theo cơ cấu tổ chức)</p>
                <OrgPersonPicker value={orgValue} onChange={handleOrgChange} personLabel="Người Phụ Trách" companyLabel="Công Ty Sở Hữu" />

                {/* Ghi chú */}
                <div>
                  <label className="block text-sm font-semibold text-ink-bright mb-2">Ghi Chú</label>
                  <textarea
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all text-sm"
                    placeholder="Nhập ghi chú..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex gap-3 md:gap-4 justify-end mt-6">
                <button
                  onClick={guardedClose}
                  className="px-4 md:px-6 py-2 md:py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition disabled:opacity-50 text-sm md:text-base"
                  disabled={loading}
                >
                  Hủy
                </button>
                <button
                  onClick={handleAddOrUpdate}
                  className="px-4 md:px-6 py-2 md:py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg font-medium transition disabled:opacity-50 text-sm md:text-base"
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
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowDeleteModal(false);
                setDeletingId(null);
              }
            }}
          >
            <div onClick={(e) => e.stopPropagation()} className="bg-slate-800 border border-slate-700 rounded-xl max-w-sm w-full p-6 md:p-8 shadow-2xl">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-red-500/10 mb-4">
                <AlertCircle size={24} className="text-red-400" />
              </div>
              <h2 className="text-lg md:text-xl font-bold text-white mb-2">Xóa Tên Miền</h2>
              <p className="text-ink-muted text-sm md:text-base mb-6 md:mb-8">
                Bạn chắc chắn muốn xóa tên miền này? Hành động này không thể hoàn tác.
              </p>
              <div className="flex gap-3 md:gap-4 justify-end">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeletingId(null);
                  }}
                  className="px-4 md:px-6 py-2 md:py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition disabled:opacity-50 text-sm md:text-base"
                  disabled={loading}
                >
                  Hủy
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 md:px-6 py-2 md:py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-lg font-medium transition disabled:opacity-50 text-sm md:text-base"
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
