'use client';

import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { fetchUsers, createUser, updateUser, getAuditLogs } from '@/lib/api-client';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import BulkUserEditModal from './BulkUserEditModal';
import { getCurrentUser, isSuperAdmin } from '@/lib/authStore';
import { Search, Shield, Edit2, Plus, XCircle, Mail, Phone, Building, Clock, IdCard, Key, ChevronRight, LayoutGrid, LayoutList, Archive, RotateCcw, Lock, UserCheck, FileText, Columns, Download, Trash2, AlertTriangle, Cake, Loader2, Send, Users as UsersIcon, RefreshCw } from 'lucide-react';
import SendAccountEmailModal, { AccountEmailDefaults } from './SendAccountEmailModal';
import BirthdayMonthModal from './BirthdayMonthModal';
import { UsersFilters } from './UsersFilters';
import { canAccess } from '@/lib/permissions';
import { listOnbSubmissions } from '@/lib/api/onboardingApi';
import CompletenessRing from '@/components/ui/CompletenessRing';
import { computeHrCompleteness } from '@/lib/hrProfileCompleteness';
import { normalizeVN } from '@/lib/utils/searchVN';
import ErrorState from '@/components/ui/ErrorState';
import EmptyState from '@/components/ui/EmptyState';
import type { PresenceEntry } from '@/app/api/users/presence/route';

/** Màu + tooltip cho chấm trạng thái trên avatar. */
function presenceDot(entry?: PresenceEntry): { color: string; title: string } {
  if (entry?.status === 'present') return { color: 'bg-green-500', title: entry.label };
  if (entry?.status === 'leave')   return { color: 'bg-amber-500', title: entry.label };
  return { color: 'bg-gray-500/60', title: 'Không có mặt' };
}

const DynamicLoader = () => (
  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
);

const ApproveUsersModal = dynamic(() => import('./ApproveUsersModal'), {
  ssr: false,
  loading: () => <DynamicLoader />,
});

const UsersModalTabside = dynamic(() => import('./UsersModalTabside'), {
  ssr: false,
  loading: () => <DynamicLoader />,
});

const UserNameCard = dynamic(() => import('./UserNameCard'), {
  ssr: false,
  loading: () => <DynamicLoader />,
});

const QuickProfileModal = dynamic(() => import('./QuickProfileModal'), {
  ssr: false,
  loading: () => <DynamicLoader />,
});

interface User {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'admin' | 'manager' | 'user';
  department: string;
  department_id?: string;
  company_id?: string;
  avatar?: string;
  phone?: string;
  position?: string;
  position_id?: string;
  bio?: string;
  sub_department_id?: string;
  job_title_id?: string;
  work_start_time?: string;
  deduct_lunch?: boolean;
  status: 'active' | 'inactive';
  last_login?: string;
  last_active?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
  tags?: Array<{ id: string; name: string; color: string }>;
}

interface Department {
  id: string;
  name: string;
  parent_department_id?: string;
  children?: Department[];
}

interface SubDepartment {
  id: string;
  name: string;
  parent_department_id: string;
}

interface Company {
  id: string;
  name: string;
}

interface JobTitle {
  id: string;
  title: string;  // Changed from 'name' to match database column
  description?: string;
  is_active: boolean;
}

interface Tag {
  id: string;
  name: string;
  color: string;
  description?: string;
  is_active: boolean;
}

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  super_admin: { label: 'Super Admin', color: 'text-violet-400', bg: 'bg-violet-500/15 border-violet-500/30' },
  admin: { label: 'Admin', color: 'text-indigo-400', bg: 'bg-indigo-500/15 border-indigo-500/30' },
  manager: { label: 'Quản Lý', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' },
  user: { label: 'Người Dùng', color: 'text-ink-muted', bg: 'bg-slate-500/15 border-slate-500/30' },
};

/* ============================================================================
   DEPRECATED: UserModal component replaced by UsersModalTabside (dạng Tabside)
   Comment lại toàn bộ component UserModal cũ - không sử dụng nữa
   ============================================================================ */

/*
interface UserModalProps {
  user?: User | null;
  mode: 'create' | 'view' | 'edit' | 'change-password';
  currentUser: any;
  onClose: () => void;
  onSave: (u: User) => void;
  dropdownCache: DropdownCache;
}

function UserModal({ user, mode, currentUser, onClose, onSave, dropdownCache }: UserModalProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'password'>(mode === 'change-password' ? 'password' : 'info');
  const [form, setForm] = useState({
    name: user?.name ?? '',
    email: user?.email ?? '',
    role: user?.role ?? 'user' as User['role'],
    company_id: user?.company_id ?? '',
    department: user?.department ?? '',
    phone: user?.phone ?? '',
    position_id: user?.position_id ?? '',
    bio: user?.bio ?? '',
    sub_department_id: user?.sub_department_id ?? '',
    job_title_id: user?.job_title_id ?? '',
    status: user?.status ?? 'active' as 'active' | 'inactive',
    password: '',
    confirmPassword: '',
  });
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(user?.tags?.map(t => t.id) ?? []);
  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [parentDepartments, setParentDepartments] = useState<Department[]>([]);
  const [subDepartments, setSubDepartments] = useState<SubDepartment[]>([]);
  const [jobTitlesForCompany, setJobTitlesForCompany] = useState<JobTitle[]>([]);
  const [positionsForCompany, setPositionsForCompany] = useState<Array<{ id: string; name: string }>>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const toast = useToast();

  // Đóng modal khi nhấn ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const isReadOnly = mode === 'view';
  const isCreating = mode === 'create';
  const canSetSuperAdmin = isSuperAdmin(currentUser);

  // Update form state when user changes (for edit mode) and initialize departments
  useEffect(() => {
    if (mode === 'edit' && user) {
      setForm({
        name: user.name ?? '',
        email: user.email ?? '',
        role: user.role ?? 'user',
        company_id: user.company_id ?? '',
        department: user.department ?? '',
        phone: user.phone ?? '',
        position_id: user.position_id ?? '',
        bio: user.bio ?? '',
        sub_department_id: user.sub_department_id ?? '',
        job_title_id: user.job_title_id ?? '',
        status: user.status ?? 'active',
        password: '',
        confirmPassword: '',
      });
      setSelectedTagIds(user?.tags?.map(t => t.id) ?? []);

      // Set parent departments for the user's company
      if (user.company_id && dropdownCache.companyDepartmentsMap[user.company_id]) {
        const companyDepts = dropdownCache.companyDepartmentsMap[user.company_id];
        const parentDepts = companyDepts.filter(d => !d.parent_department_id);
        setParentDepartments(parentDepts);

        // Set job titles for the company
        setJobTitlesForCompany(dropdownCache.jobTitles[user.company_id] || []);

        // Set positions for the company
        setPositionsForCompany(dropdownCache.positions[user.company_id] || []);

        // Set sub-departments if department is selected
        if (user.department) {
          const subDepts = dropdownCache.subDepartmentsByDepartmentId[user.department] || [];
          setSubDepartments(subDepts);
        }
      }
    } else if (mode === 'create') {
      setSelectedTagIds([]);
      setParentDepartments([]);
      setSubDepartments([]);
      setJobTitlesForCompany([]);
      setPositionsForCompany([]);
    }
  }, [user, mode, dropdownCache]);

  // Update parent and child departments when company changes
  const handleCompanyChange = (companyId: string) => {
    setForm(p => ({ ...p, company_id: companyId, department: '', sub_department_id: '', job_title_id: '', position_id: '' }));
    setSubDepartments([]);

    if (companyId) {
      const companyDepts = dropdownCache.companyDepartmentsMap[companyId] || [];
      const parentDepts = companyDepts.filter(d => !d.parent_department_id);
      setParentDepartments(parentDepts);
      setJobTitlesForCompany(dropdownCache.jobTitles[companyId] || []);
      setPositionsForCompany(dropdownCache.positions[companyId] || []);
    } else {
      setParentDepartments([]);
      setJobTitlesForCompany([]);
      setPositionsForCompany([]);
    }
  };

  // Update sub-departments when department changes
  const handleDepartmentChange = (departmentId: string) => {
    setForm(p => ({ ...p, department: departmentId, sub_department_id: '' }));

    if (departmentId) {
      const subDepts = dropdownCache.subDepartmentsByDepartmentId[departmentId] || [];
      setSubDepartments(subDepts);
    } else {
      setSubDepartments([]);
    }
  };

  const ROLE_OPTIONS = [
    { value: 'user', label: 'Người Dùng' },
    { value: 'admin', label: 'Admin' },
    ...(canSetSuperAdmin ? [{ value: 'super_admin', label: 'Super Admin' }] : []),
  ];

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!form.name.trim()) newErrors.name = 'Tên không được để trống';
    if (!form.email.trim()) newErrors.email = 'Email không được để trống';

    if (isCreating) {
      if (!form.password) newErrors.password = 'Mật khẩu không được để trống';
      if (form.password.length < 10) newErrors.password = 'Mật khẩu phải có ít nhất 10 ký tự';
      if (!form.confirmPassword) newErrors.confirmPassword = 'Xác nhận mật khẩu không được để trống';
      if (form.password !== form.confirmPassword) newErrors.confirmPassword = 'Mật khẩu không trùng khớp';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validatePasswordForm = () => {
    const newErrors: Record<string, string> = {};

    if (!passwordForm.newPassword) newErrors.newPassword = 'Mật khẩu mới không được để trống';
    if (passwordForm.newPassword.length < 10) newErrors.newPassword = 'Mật khẩu phải có ít nhất 10 ký tự';
    if (!passwordForm.confirmPassword) newErrors.confirmPassword = 'Xác nhận mật khẩu không được để trống';
    if (passwordForm.newPassword !== passwordForm.confirmPassword) newErrors.confirmPassword = 'Mật khẩu không trùng khớp';

    setPasswordErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChangePassword = async () => {
    if (!validatePasswordForm()) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/admin/change-user-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId: currentUser.id,
          targetUserId: user!.id,
          newPassword: passwordForm.newPassword,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Đổi mật khẩu thất bại');
      }

      setPasswordForm({ newPassword: '', confirmPassword: '' });
      toast.success('Đổi mật khẩu thành công');
      onClose();
    } catch (error) {
      console.error('Error changing password:', error);
      setPasswordErrors({ submit: error instanceof Error ? error.message : 'Có lỗi xảy ra' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      const userData = {
        name: form.name,
        email: form.email,
        role: form.role,
        company_id: form.company_id || null,
        department: form.department || null,
        phone: form.phone || '',
        position_id: form.position_id || null,
        bio: form.bio || '',
        sub_department_id: form.sub_department_id || null,
        job_title_id: form.job_title_id || null,
        status: form.status,
      };

      let userId: string;
      let created: any;

      if (isCreating) {
        const userWithPassword = {
          ...userData,
          password: form.password,
        };
        created = await createUser(userWithPassword);
        userId = created.id;
      } else {
        created = await updateUser(user!.id, userData);
        userId = user!.id;
      }

      // Handle tags separately
      let tagsData: Array<{ id: string; name: string; color: string }> = [];
      try {
        const tagResponse = await fetch(`/api/users/${userId}/tags`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag_ids: selectedTagIds }),
        });

        if (tagResponse.ok) {
          tagsData = await tagResponse.json();
        } else {
          // Fallback to cache if API fails
          tagsData = dropdownCache.allTags.filter(tag => selectedTagIds.includes(tag.id));
        }
      } catch (tagError) {
        console.error('Error assigning tags:', tagError);
        // Fallback to cache
        tagsData = dropdownCache.allTags.filter(tag => selectedTagIds.includes(tag.id));
      }

      onSave({
        id: userId,
        status: isCreating ? 'active' : form.status,
        ...created,
        tags: tagsData,
      } as User);
      onClose();
    } catch (error) {
      console.error('Error saving user:', error);
      const errorMsg = error instanceof Error ? error.message : 'Lỗi không xác định';
      toast.error('Lỗi: ' + errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-sm sm:max-w-xl rounded-2xl sm:rounded-3xl border border-line overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-white/08">
          <h2 className="text-base sm:text-lg font-700 text-foreground">
            {mode === 'create' ? 'Thêm Người Dùng' : mode === 'edit' ? 'Chỉnh Sửa Người Dùng' : mode === 'change-password' ? 'Đổi Mật Khẩu' : 'Chi Tiết Người Dùng'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl btn-ghost flex items-center justify-center text-muted-foreground">
            <XCircle size={18} />
          </button>
        </div>
        {(mode === 'edit' || mode === 'change-password') && (
          <div className="flex gap-2 px-4 sm:px-6 py-3 border-b border-white/08 overflow-x-auto">
            <button
              onClick={() => setActiveTab('info')}
              className={`px-3 py-1.5 rounded-lg text-sm font-500 transition-colors ${
                activeTab === 'info'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-muted-foreground hover:bg-white/05'
              }`}
            >
              Thông Tin
            </button>
            <button
              onClick={() => setActiveTab('password')}
              className={`px-3 py-1.5 rounded-lg text-sm font-500 transition-colors ${
                activeTab === 'password'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-muted-foreground hover:bg-white/05'
              }`}
            >
              Mật Khẩu
            </button>
          </div>
        )}
        <div className="p-4 sm:p-6 space-y-3 sm:space-y-4 max-h-[70vh] sm:max-h-[65vh] overflow-y-auto">
          {activeTab === 'info' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-500 text-foreground mb-1.5">Họ và tên *</label>
              <input
                disabled={isReadOnly}
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60 disabled:opacity-60"
                placeholder="Nguyễn Văn A"
              />
            </div>
            <div>
              <label className="block text-sm font-500 text-foreground mb-1.5">Email *</label>
              <input
                disabled={isReadOnly}
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60 disabled:opacity-60"
                placeholder="email@company.vn"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-500 text-foreground mb-1.5">Số điện thoại</label>
              <input
                disabled={isReadOnly}
                value={form.phone}
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60 disabled:opacity-60"
                placeholder="0901234567"
              />
            </div>
            <div>
              <label className="block text-sm font-500 text-foreground mb-1.5">Vai trò</label>
              <select
                disabled={isReadOnly}
                value={form.role}
                onChange={e => setForm(p => ({ ...p, role: e.target.value as User['role'] }))}
                className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none disabled:opacity-60"
              >
                {ROLE_OPTIONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-500 text-foreground mb-1.5">Công Ty *</label>
              <select
                disabled={isReadOnly}
                value={form.company_id}
                onChange={e => handleCompanyChange(e.target.value)}
                className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none disabled:opacity-60"
              >
                <option value="">-- Chọn công ty --</option>
                {dropdownCache.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-500 text-foreground mb-1.5">Phòng ban</label>
              <select
                disabled={isReadOnly || !form.company_id || parentDepartments.length === 0}
                value={form.department}
                onChange={e => handleDepartmentChange(e.target.value)}
                className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none disabled:opacity-60"
              >
                <option value="">-- Chọn phòng ban --</option>
                {parentDepartments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-500 text-foreground mb-1.5">Bộ Phận</label>
              <select
                disabled={isReadOnly || !form.department || subDepartments.length === 0}
                value={form.sub_department_id}
                onChange={e => setForm(p => ({ ...p, sub_department_id: e.target.value }))}
                className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none disabled:opacity-60"
              >
                <option value="">-- Chọn bộ phận --</option>
                {subDepartments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-500 text-foreground mb-1.5">Chức vụ</label>
              <select
                disabled={isReadOnly || !form.company_id || positionsForCompany.length === 0}
                value={form.position_id}
                onChange={e => setForm(p => ({ ...p, position_id: e.target.value }))}
                className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60 disabled:opacity-60"
              >
                <option value="">-- Chọn chức vụ --</option>
                {positionsForCompany.map(pos => <option key={pos.id} value={pos.id}>{pos.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-500 text-foreground mb-1.5">Tiểu sử</label>
            <textarea
              disabled={isReadOnly}
              value={form.bio}
              onChange={e => setForm(p => ({ ...p, bio: e.target.value }))}
              className="w-full h-20 px-3 py-2 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60 disabled:opacity-60 resize-none"
              placeholder="Mô tả về bạn..."
            />
          </div>
          <div>
            <label className="block text-sm font-500 text-foreground mb-2">Thẻ Tags</label>
            {dropdownCache.allTags.length === 0 ? (
              <p className="text-xs text-muted-foreground/70">Không có thẻ nào khả dụng</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {dropdownCache.allTags.map(tag => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => {
                      setSelectedTagIds(prev =>
                        prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                      );
                    }}
                    disabled={isReadOnly}
                    className={`px-3 py-1.5 rounded-full text-xs font-500 transition-all ${
                      selectedTagIds.includes(tag.id)
                        ? `text-white border-2 cursor-pointer`
                        : `border border-line-strong text-muted-foreground hover:border-white/40 cursor-pointer`
                    }`}
                    style={{
                      backgroundColor: selectedTagIds.includes(tag.id) ? tag.color : 'transparent',
                      borderColor: selectedTagIds.includes(tag.id) ? tag.color : undefined,
                    }}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!isCreating && (
            <div>
              <label className="block text-sm font-500 text-foreground mb-1.5">Trạng thái</label>
              <select
                disabled={isReadOnly}
                value={form.status}
                onChange={e => setForm(p => ({ ...p, status: e.target.value as 'active' | 'inactive' }))}
                className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none disabled:opacity-60"
              >
                <option value="active">Đang hoạt động</option>
                <option value="inactive">Không hoạt động</option>
              </select>
            </div>
          )}
            </>
          )}

          {isCreating && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-500 text-foreground mb-1.5">Mật khẩu *</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    className={`w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border focus:outline-none focus:border-indigo/60 ${
                      errors.password ? 'border-red-500/60' : 'border-line'
                    }`}
                    placeholder="Nhập mật khẩu"
                  />
                  {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password}</p>}
                </div>
                <div>
                  <label className="block text-sm font-500 text-foreground mb-1.5">Xác nhận mật khẩu *</label>
                  <input
                    type="password"
                    value={form.confirmPassword}
                    onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))}
                    className={`w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border focus:outline-none focus:border-indigo/60 ${
                      errors.confirmPassword ? 'border-red-500/60' : 'border-line'
                    }`}
                    placeholder="Xác nhận mật khẩu"
                  />
                  {errors.confirmPassword && <p className="text-xs text-red-400 mt-1">{errors.confirmPassword}</p>}
                </div>
              </div>
            </>
          )}

          {activeTab === 'password' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-500 text-foreground mb-1.5">Mật khẩu mới *</label>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={e => setPasswordForm(p => ({ ...p, newPassword: e.target.value }))}
                    className={`w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border focus:outline-none focus:border-indigo/60 ${
                      passwordErrors.newPassword ? 'border-red-500/60' : 'border-line'
                    }`}
                    placeholder="Nhập mật khẩu mới"
                  />
                  {passwordErrors.newPassword && <p className="text-xs text-red-400 mt-1">{passwordErrors.newPassword}</p>}
                </div>
                <div>
                  <label className="block text-sm font-500 text-foreground mb-1.5">Xác nhận mật khẩu mới *</label>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={e => setPasswordForm(p => ({ ...p, confirmPassword: e.target.value }))}
                    className={`w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border focus:outline-none focus:border-indigo/60 ${
                      passwordErrors.confirmPassword ? 'border-red-500/60' : 'border-line'
                    }`}
                    placeholder="Xác nhận mật khẩu mới"
                  />
                  {passwordErrors.confirmPassword && <p className="text-xs text-red-400 mt-1">{passwordErrors.confirmPassword}</p>}
                </div>
              </div>
              {passwordErrors.submit && (
                <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30">
                  <p className="text-sm text-red-300">{passwordErrors.submit}</p>
                </div>
              )}
            </div>
          )}
        </div>
        {!isReadOnly && (
          <div className="flex items-center justify-end gap-2 sm:gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-white/08">
            <button onClick={onClose} className="h-9 px-3 sm:px-5 rounded-xl btn-ghost text-xs sm:text-sm font-500">Hủy</button>
            {activeTab === 'info' ? (
              <button
                onClick={handleSave}
                disabled={isSaving || !form.name || !form.email || (isCreating && (!form.password || !form.confirmPassword))}
                className="h-9 px-3 sm:px-5 rounded-xl btn-accent text-xs sm:text-sm font-600 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {isSaving ? 'Đang lưu...' : (mode === 'create' ? 'Thêm' : 'Lưu')}
              </button>
            ) : (
              <button
                onClick={handleChangePassword}
                disabled={isSaving || !passwordForm.newPassword || !passwordForm.confirmPassword}
                className="h-9 px-3 sm:px-5 rounded-xl btn-accent text-xs sm:text-sm font-600 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {isSaving ? 'Đang...' : 'Đổi MK'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
*/

interface DropdownCache {
  companies: Company[];
  companyDepartmentsMap: Record<string, Department[]>;
  subDepartmentsByDepartmentId: Record<string, SubDepartment[]>;
  jobTitles: Record<string, JobTitle[]>;
  positions: Record<string, Array<{ id: string; name: string }>>;
  allTags: Tag[];
}

export default function UsersClient() {
  const toast = useToast();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  // ── Sửa hàng loạt: chọn nhiều người ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const toggleSelect = (id: string) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSelection = () => setSelectedIds(new Set());

  // Consolidated filters state
  const [filters, setFilters] = useState({
    search: '',
    company_id: '',
    department_id: '',
    role: [] as string[],
    status: 'active',
    job_title_id: '',
    quick: [] as string[],
  });

  const [modal, setModal] = useState<{ mode: 'create' | 'view' | 'edit' | 'change-password'; user?: User } | null>(null);
  const [showApprove, setShowApprove] = useState(false);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [birthdayOpen, setBirthdayOpen] = useState(false);
  // Deep-link từ thông báo digest sinh nhật: /users?birthday=1 → mở panel sinh nhật
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('birthday') === '1') {
      setBirthdayOpen(true);
    }
  }, []);
  const [hardDelId, setHardDelId] = useState<string | null>(null);
  const [hdPassword, setHdPassword] = useState('');
  const [hdBusy, setHdBusy] = useState(false);
  const [hdError, setHdError] = useState('');
  const [profileUser, setProfileUser] = useState<User | null>(null);
  // Gửi lại "Email cấp tài khoản cho nhân sự mới" (lỡ bỏ qua pop-up sau khi duyệt)
  const [accountEmail, setAccountEmail] = useState<AccountEmailDefaults | null>(null);
  const [auditModal, setAuditModal] = useState<{ userId: string; userName: string } | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [usersError, setUsersError] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dropdownCache, setDropdownCache] = useState<DropdownCache>({
    companies: [],
    companyDepartmentsMap: {},
    subDepartmentsByDepartmentId: {},
    jobTitles: {},
    positions: {},
    allTags: [],
  });
  // Map company_id → logo_url (cho logo công ty ở góc card)
  const [companyLogos, setCompanyLogos] = useState<Record<string, string>>({});
  // Map userId → trạng thái làm việc hôm nay: có mặt / nghỉ phép đã duyệt.
  // Không có trong map = chưa chấm công hoặc đã ra về.
  const [presence, setPresence] = useState<Record<string, PresenceEntry>>({});
  const [viewMode, setViewMode] = useState<'card' | 'table'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('usersViewMode') || 'card') as 'card' | 'table';
    }
    return 'card';
  });
  const [sortBy, setSortBy] = useState<'name' | 'email' | 'last_active'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showColMenu, setShowColMenu] = useState(false);
  const [pageSize, setPageSize] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('usersTablePageSize');
      if (saved) return Number(saved);
    }
    return 20;
  });
  const [currentPage, setCurrentPage] = useState(1);

  // Cột mặc định BẬT
  const DEFAULT_ON_COLS = ['email', 'position', 'department', 'role', 'status', 'last_login'] as const;

  // Nhóm cột mặc định TẮT — chia 5 nhóm để hiển thị trong dropdown
  const COL_GROUP_WORK = ['phone', 'company', 'manager', 'employee_code', 'job_title', 'hire_date', 'employment_type', 'work_location'] as const;
  const COL_GROUP_PERSONAL = ['date_of_birth', 'gender', 'personal_email', 'nationality', 'ethnicity', 'religion', 'marital_status', 'children_count', 'education_level', 'major'] as const;
  const COL_GROUP_ADDRESS = ['home_address', 'temporary_address', 'vehicle_type', 'vehicle_plate', 'vehicle_model'] as const;
  const COL_GROUP_FINANCE = ['bank_name', 'bank_account_no', 'bank_account_name', 'national_id', 'national_id_issue_date', 'national_id_issue_place', 'social_insurance_unit', 'social_insurance_base', 'meal_allowance_rate', 'parking_allowance_rate', 'travel_allowance_rate', 'salary_entity', 'cost_center_code'] as const;
  const COL_GROUP_EMERGENCY = ['emergency_contact_name', 'emergency_contact_relationship', 'emergency_contact_phone', 'emergency_contact_2_name', 'emergency_contact_2_relationship', 'emergency_contact_2_phone'] as const;

  const ALL_COLUMNS = [
    ...DEFAULT_ON_COLS,
    ...COL_GROUP_WORK, ...COL_GROUP_PERSONAL, ...COL_GROUP_ADDRESS,
    ...COL_GROUP_FINANCE, ...COL_GROUP_EMERGENCY,
  ] as const;
  type ColKey = typeof ALL_COLUMNS[number];

  const COL_LABELS: Record<ColKey, string> = {
    // Cơ bản
    email: 'Email', position: 'Chức Vụ', department: 'Phòng Ban',
    role: 'Vai Trò', status: 'Trạng Thái', last_login: 'Sử Dụng Cuối',
    // Công việc
    phone: 'Số Điện Thoại', company: 'Công Ty', manager: 'Quản Lý',
    employee_code: 'Mã Nhân Viên', job_title: 'Chức Danh Công Việc',
    hire_date: 'Ngày Vào Làm', employment_type: 'Loại Hợp Đồng', work_location: 'Nơi Làm Việc',
    // Cá nhân
    date_of_birth: 'Ngày Sinh', gender: 'Giới Tính', personal_email: 'Email Cá Nhân',
    nationality: 'Quốc Tịch', ethnicity: 'Dân Tộc', religion: 'Tôn Giáo',
    marital_status: 'Hôn Nhân', children_count: 'Số Con',
    education_level: 'Trình Độ Học Vấn', major: 'Chuyên Ngành',
    // Địa chỉ & phương tiện
    home_address: 'Địa Chỉ Thường Trú', temporary_address: 'Địa Chỉ Tạm Trú',
    vehicle_type: 'Phương Tiện', vehicle_plate: 'Biển Số Xe', vehicle_model: 'Hiệu Xe',
    // Tài chính & pháp lý
    bank_name: 'Ngân Hàng', bank_account_no: 'Số Tài Khoản', bank_account_name: 'Tên Chủ TK',
    national_id: 'CCCD/Hộ Chiếu', national_id_issue_date: 'Ngày Cấp CCCD', national_id_issue_place: 'Nơi Cấp CCCD',
    social_insurance_unit: 'Đơn Vị BHXH', social_insurance_base: 'Mức Đóng BHXH',
    meal_allowance_rate: 'Phụ Cấp Cơm', parking_allowance_rate: 'Phụ Cấp Gửi Xe',
    travel_allowance_rate: 'Công Tác Phí', salary_entity: 'Đơn Vị Lương', cost_center_code: 'Mã CC',
    // Liên hệ khẩn cấp
    emergency_contact_name: 'Người Thân 1', emergency_contact_relationship: 'Quan Hệ 1',
    emergency_contact_phone: 'SĐT Người Thân 1',
    emergency_contact_2_name: 'Người Thân 2', emergency_contact_2_relationship: 'Quan Hệ 2',
    emergency_contact_2_phone: 'SĐT Người Thân 2',
  };

  // Cấu hình nhóm cho dropdown
  const COL_GROUPS: { label: string; cols: readonly ColKey[] }[] = [
    { label: 'Cơ bản', cols: DEFAULT_ON_COLS },
    { label: 'Công việc', cols: COL_GROUP_WORK },
    { label: 'Cá nhân', cols: COL_GROUP_PERSONAL },
    { label: 'Địa chỉ & phương tiện', cols: COL_GROUP_ADDRESS },
    { label: 'Tài chính & pháp lý', cols: COL_GROUP_FINANCE },
    { label: 'Liên hệ khẩn cấp', cols: COL_GROUP_EMERGENCY },
  ];

  const [visibleColumns, setVisibleColumns] = useState<Set<ColKey>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('usersTableCols');
        if (saved) return new Set(JSON.parse(saved) as ColKey[]);
      } catch { /* ignore */ }
    }
    // Mặc định: chỉ bật nhóm cơ bản
    return new Set<ColKey>([...DEFAULT_ON_COLS]);
  });

  const toggleColumn = (col: ColKey) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col); else next.add(col);
      localStorage.setItem('usersTableCols', JSON.stringify([...next]));
      return next;
    });
  };

  const colSpanTotal = 4 + ALL_COLUMNS.filter(c => visibleColumns.has(c)).length;

  const exportExcel = async () => {
    const XLSXStyle = (await import('xlsx-js-style')).default;

    // Header row — chỉ xuất cột đang bật
    const FIXED_HEADERS = ['STT', 'Tên', 'Email'];
    const dynamicHeaders = ALL_COLUMNS
      .filter(c => visibleColumns.has(c))
      .map(c => COL_LABELS[c]);
    const headers = [...FIXED_HEADERS, ...dynamicHeaders];

    const headerStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
      fill: { fgColor: { rgb: '4F46E5' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: { bottom: { style: 'thin', color: { rgb: 'FFFFFF' } } },
    };

    const headerRow = headers.map(h => ({ v: h, t: 's', s: headerStyle }));

    // Data rows
    const data = getSortedFiltered().map((u, idx) => {
      const row: any[] = [
        { v: idx + 1, t: 'n', s: { alignment: { horizontal: 'center' } } },
        { v: u.name, t: 's' },
        { v: u.email, t: 's' },
      ];
      ALL_COLUMNS.filter(c => visibleColumns.has(c)).forEach(col => {
        let val = '';
        switch (col) {
          case 'email': return; // đã có trong fixed
          case 'position': val = getPositionName(u) || ''; break;
          case 'department': val = getDepartmentName(u) || ''; break;
          case 'role': val = (ROLE_CONFIG[u.role] ?? ROLE_CONFIG.user).label; break;
          case 'status': val = u.status === 'active' ? 'Đang hoạt động' : 'Không hoạt động'; break;
          case 'last_login': val = (u as any).last_active ? new Date((u as any).last_active).toLocaleDateString('vi-VN') : ((u as any).last_login ? new Date((u as any).last_login).toLocaleDateString('vi-VN') : 'Chưa sử dụng'); break;
          case 'phone': val = (u as any).phone || ''; break;
          case 'company': val = dropdownCache.companies.find(c => c.id === u.company_id)?.name || ''; break;
          case 'manager': val = (u as any).manager_name || ''; break;
          case 'employee_code': val = (u as any).employee_code || ''; break;
          case 'job_title': val = u.job_title_id && u.company_id ? (dropdownCache.jobTitles[u.company_id] || []).find(jt => jt.id === u.job_title_id)?.title || '' : ''; break;
          case 'hire_date': val = (u as any).hire_date ? new Date((u as any).hire_date).toLocaleDateString('vi-VN') : ''; break;
          case 'employment_type': val = (u as any).employment_type || ''; break;
          case 'date_of_birth': val = (u as any).date_of_birth ? new Date((u as any).date_of_birth).toLocaleDateString('vi-VN') : ''; break;
          case 'gender': val = (u as any).gender === 'MALE' ? 'Nam' : (u as any).gender === 'FEMALE' ? 'Nữ' : (u as any).gender || ''; break;
          case 'work_location': val = (u as any).work_location || ''; break;
          // Cá nhân
          case 'personal_email': val = (u as any).personal_email || ''; break;
          case 'nationality': val = (u as any).nationality || ''; break;
          case 'ethnicity': val = (u as any).ethnicity || ''; break;
          case 'religion': val = (u as any).religion || ''; break;
          case 'marital_status': val = (u as any).marital_status || ''; break;
          case 'children_count': val = (u as any).children_count != null ? String((u as any).children_count) : ''; break;
          case 'education_level': val = (u as any).education_level || ''; break;
          case 'major': val = (u as any).major || ''; break;
          // Địa chỉ & phương tiện
          case 'home_address': val = (u as any).home_address || ''; break;
          case 'temporary_address': val = (u as any).temporary_address || ''; break;
          case 'vehicle_type': val = (u as any).vehicle_type || ''; break;
          case 'vehicle_plate': val = (u as any).vehicle_plate || ''; break;
          case 'vehicle_model': val = (u as any).vehicle_model || ''; break;
          // Tài chính & pháp lý
          case 'bank_name': val = (u as any).bank_name || ''; break;
          case 'bank_account_no': val = (u as any).bank_account_no || ''; break;
          case 'bank_account_name': val = (u as any).bank_account_name || ''; break;
          case 'national_id': val = (u as any).national_id || ''; break;
          case 'national_id_issue_date': val = (u as any).national_id_issue_date ? new Date((u as any).national_id_issue_date).toLocaleDateString('vi-VN') : ''; break;
          case 'national_id_issue_place': val = (u as any).national_id_issue_place || ''; break;
          case 'social_insurance_unit': val = (u as any).social_insurance_unit || ''; break;
          case 'social_insurance_base': val = (u as any).social_insurance_base != null ? String((u as any).social_insurance_base) : ''; break;
          case 'meal_allowance_rate': val = (u as any).meal_allowance_rate != null ? String((u as any).meal_allowance_rate) : ''; break;
          case 'parking_allowance_rate': val = (u as any).parking_allowance_rate != null ? String((u as any).parking_allowance_rate) : ''; break;
          case 'travel_allowance_rate': val = (u as any).travel_allowance_rate != null ? String((u as any).travel_allowance_rate) : ''; break;
          case 'salary_entity': val = (u as any).salary_entity || ''; break;
          case 'cost_center_code': val = (u as any).cost_center_code || ''; break;
          // Liên hệ khẩn cấp
          case 'emergency_contact_name': val = (u as any).emergency_contact_name || ''; break;
          case 'emergency_contact_relationship': val = (u as any).emergency_contact_relationship || ''; break;
          case 'emergency_contact_phone': val = (u as any).emergency_contact_phone || ''; break;
          case 'emergency_contact_2_name': val = (u as any).emergency_contact_2_name || ''; break;
          case 'emergency_contact_2_relationship': val = (u as any).emergency_contact_2_relationship || ''; break;
          case 'emergency_contact_2_phone': val = (u as any).emergency_contact_2_phone || ''; break;
        }
        row.push({ v: val, t: 's' });
      });
      return row;
    });

    const ws = XLSXStyle.utils.aoa_to_sheet([headerRow, ...data]);

    // Độ rộng cột tự động
    ws['!cols'] = headers.map((h, i) => ({
      wch: Math.max(h.length + 2, i === 1 ? 24 : i === 2 ? 28 : 18),
    }));
    ws['!rows'] = [{ hpt: 28 }]; // header row cao hơn

    const wb = XLSXStyle.utils.book_new();
    XLSXStyle.utils.book_append_sheet(wb, ws, 'Người Dùng');

    const date = new Date().toLocaleDateString('vi-VN').replace(/\//g, '-');
    XLSXStyle.writeFile(wb, `danh-sach-nguoi-dung_${date}.xlsx`);
  };

  useEffect(() => {
    // Try both possible keys for backward compatibility
    let userData = localStorage.getItem('assetflow_auth');
    if (!userData) {
      userData = localStorage.getItem('currentUser');
    }
    if (userData) {
      setCurrentUser(JSON.parse(userData));
    }
    loadAllUsers();
    loadDropdownData();
  }, []);

  // Load users whenever filters change (bao gồm lần đầu mount)
  useEffect(() => {
    if (currentUser) {
      loadUsers();
    }
  }, [filters, currentUser]);

  // Fetch presence (ai đang có mặt văn phòng) và refresh mỗi 2 phút
  useEffect(() => {
    const fetchPresence = () => {
      fetch('/api/users/presence')
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.presence) setPresence(data.presence); })
        .catch(() => {});
    };
    fetchPresence();
    const interval = setInterval(fetchPresence, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Badge số hồ sơ onboarding chờ duyệt
  useEffect(() => {
    if (!currentUser) return;
    if (!canAccess(currentUser?.module_permissions, 'users', 'create')) return;
    listOnbSubmissions('sent_to_admin')
      .then(r => setPendingApprovalCount(r.data.length))
      .catch(() => setPendingApprovalCount(0));
  }, [currentUser, showApprove]);

  useEffect(() => {
    localStorage.setItem('usersViewMode', viewMode);
  }, [viewMode]);

  // Reset về trang 1 khi filter hoặc pageSize thay đổi
  useEffect(() => { setCurrentPage(1); }, [filters, pageSize]);

  const loadDropdownData = async () => {
    try {
      // Fetch companies
      const companiesResponse = await fetch('/api/organizations/companies');
      if (!companiesResponse.ok) throw new Error('Failed to fetch companies');
      const companiesData = await companiesResponse.json();
      const companies = companiesData || [];

      // Logo công ty (nền tối → CHỈ dùng biến thể âm bản full_dark; chưa có thì để trống)
      const logoMap: Record<string, string> = {};
      companies.forEach((c: any) => { const url = c.logo_urls?.full_dark; if (url) logoMap[c.id] = url; });
      setCompanyLogos(logoMap);

      // Fetch departments for each company
      const deptMap: Record<string, Department[]> = {};
      const jobTitlesMap: Record<string, JobTitle[]> = {};
      const positionsMap: Record<string, Array<{ id: string; name: string }>> = {};
      const subDeptMap: Record<string, SubDepartment[]> = {};

      const promises = companies.map((company: any) =>
        Promise.all([
          fetch(`/api/organizations/departments?company_id=${company.id}`)
            .then(res => res.ok ? res.json() : [])
            .then(data => ({ companyId: company.id, departments: Array.isArray(data) ? data : [] }))
            .catch(() => ({ companyId: company.id, departments: [] })),
          fetch(`/api/organizations/job-titles?company_id=${company.id}`)
            .then(res => res.ok ? res.json() : [])
            .then(data => ({ companyId: company.id, jobTitles: Array.isArray(data) ? data : [] }))
            .catch(() => ({ companyId: company.id, jobTitles: [] })),
          fetch(`/api/organizations/positions?company_id=${company.id}`)
            .then(res => res.ok ? res.json() : [])
            .then(data => ({ companyId: company.id, positions: Array.isArray(data) ? data : [] }))
            .catch(() => ({ companyId: company.id, positions: [] })),
        ])
      );

      const results = await Promise.all(promises);

      results.forEach(([deptResult, jtResult, posResult]) => {
        if (deptResult.departments.length > 0) {
          deptMap[deptResult.companyId] = deptResult.departments.map((dept: any) => ({
            id: dept.id,
            name: dept.name,
            parent_department_id: dept.parent_department_id || null,
          }));
        }
        if (jtResult.jobTitles.length > 0) {
          jobTitlesMap[jtResult.companyId] = jtResult.jobTitles;
        }
        if (posResult.positions.length > 0) {
          positionsMap[posResult.companyId] = posResult.positions;
        }
      });

      // Fetch sub-departments for each parent department
      const allDepartments = Object.values(deptMap).flat();
      const subDeptPromises = allDepartments.map((dept: Department) =>
        fetch(`/api/organizations/sub-departments?department_id=${dept.id}`)
          .then(res => res.ok ? res.json() : [])
          .then(data => ({
            departmentId: dept.id,
            subDepartments: Array.isArray(data) ? data : []
          }))
          .catch(() => ({ departmentId: dept.id, subDepartments: [] }))
      );

      const subDeptResults = await Promise.all(subDeptPromises);
      subDeptResults.forEach((result: any) => {
        if (result.subDepartments.length > 0) {
          subDeptMap[result.departmentId] = result.subDepartments.map((subDept: any) => ({
            id: subDept.id,
            name: subDept.name,
            parent_department_id: subDept.parent_department_id || result.departmentId,
          }));
        }
      });

      // Fetch tags
      let allTags: Tag[] = [];
      try {
        const tagsResponse = await fetch('/api/tags');
        if (tagsResponse.ok) {
          const tagsData = await tagsResponse.json();
          allTags = Array.isArray(tagsData) ? tagsData : [];
        }
      } catch (error) {
        console.error('Error fetching tags:', error);
      }

      setDropdownCache({
        companies: companies.map((c: any) => ({ id: c.id, name: c.name })),
        companyDepartmentsMap: deptMap,
        subDepartmentsByDepartmentId: subDeptMap,
        jobTitles: jobTitlesMap,
        positions: positionsMap,
        allTags,
      });
    } catch (error) {
      console.error('Error loading dropdown data:', error);
    }
  };

  const loadAllUsers = async () => {
    try {
      const activeUsers = await fetchUsers({ status: 'active' });
      const inactiveUsers = await fetchUsers({ status: 'inactive' });
      setAllUsers([...activeUsers, ...inactiveUsers]);
    } catch (error) {
      console.error('Error loading all users:', error);
    }
  };

  const loadUsers = React.useCallback(async (silent = false) => {
    try {
      if (!silent) { setLoading(true); setUsersError(false); }
      const apiFilters: any = {};
      if (filters.company_id) apiFilters.company_id = filters.company_id;
      if (filters.status) apiFilters.status = filters.status;
      const data = await fetchUsers(apiFilters);
      setUsers(data);
    } catch (error) {
      console.error('Error loading users:', error);
      if (!silent) { setUsers([]); setUsersError(true); }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filters]);

  // ⚠️ Rules of Hooks: MỌI hook phải khai báo TRƯỚC early return bên dưới. Đặt hook sau
  // `if (!currentUser) return null` sẽ khiến render đầu (currentUser=null) chạy ít hook hơn
  // render sau → React ném "Rendered more hooks than during the previous render".
  // Tập id người ĐANG là quản lý của ai đó (cho lọc nhanh "có cấp dưới").
  const managerIds = useMemo(() => {
    const s = new Set<string>();
    for (const u of users) if ((u as any).manager_id) s.add(String((u as any).manager_id));
    return s;
  }, [users]);
  const [bulkSyncing, setBulkSyncing] = useState(false);

  if (!currentUser) return null;

  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      company_id: '',
      department_id: '',
      role: [],
      status: 'active',
      job_title_id: '',
      quick: [],
    });
  };

  // Count active filters
  const activeFilterCount = [
    filters.search,
    filters.company_id,
    filters.department_id,
    filters.role.length > 0,
    filters.status && filters.status !== 'active',
    filters.job_title_id,
    filters.quick.length > 0,
  ].filter(Boolean).length;

  const currentMonth = new Date().getMonth() + 1;

  /** Predicate cho từng lọc nhanh — key khớp QUICK_FILTERS. */
  const matchesQuick = (u: any, key: string): boolean => {
    switch (key) {
      case 'no_manager':     return !u.manager_id;
      case 'no_department':  return !u.department_id && !u.sub_department_id;
      case 'no_position':    return !(u.position_id || u.job_title_id || (u.position && String(u.position).trim()));
      case 'no_company':     return !u.company_id;
      case 'no_phone':       return !(u.phone && String(u.phone).trim());
      case 'no_avatar':      return !(u.avatar && String(u.avatar).trim());
      case 'is_manager':     return managerIds.has(String(u.id));
      case 'tg_linked':      return !!u.telegram_chat_id;
      case 'tg_unlinked':    return !u.telegram_chat_id;
      case 'birthday_month': {
        const d = u.date_of_birth ? new Date(u.date_of_birth) : null;
        return !!d && !Number.isNaN(d.getTime()) && d.getMonth() + 1 === currentMonth;
      }
      default: return true;
    }
  };

  // Dùng helper chuẩn hoá tiếng Việt — không phân biệt dấu/hoa-thường.
  const q = normalizeVN(filters.search).trim();
  const filtered = users.filter(u => {
    const matchSearch = !q ||
      normalizeVN(u.name).includes(q) ||
      normalizeVN(u.email).includes(q) ||
      normalizeVN(u.department ?? '').includes(q);

    const matchRole = filters.role.length === 0 || filters.role.includes(u.role);

    const matchStatus = !filters.status || u.status === filters.status;

    // Đa Công Ty: user "thuộc" công ty nếu là công ty chính HOẶC có membership active ở đó.
    const matchCompany = !filters.company_id
      || u.company_id === filters.company_id
      || (Array.isArray((u as any).company_memberships)
        && (u as any).company_memberships.some(
          (m: any) => m.company_id === filters.company_id && m.is_active !== false
        ));

    const matchDepartment = !filters.department_id || u.department_id === filters.department_id;

    const matchJobTitle = !filters.job_title_id || u.job_title_id === filters.job_title_id;

    // Lọc nhanh: phải thoả TẤT CẢ chip đang bật (AND).
    const matchQuick = filters.quick.length === 0 || filters.quick.every((k) => matchesQuick(u, k));

    return matchSearch && matchRole && matchStatus && matchCompany && matchDepartment && matchJobTitle && matchQuick;
  }).sort((a, b) =>
    // Sắp theo tên A→Z, hỗ trợ tiếng Việt (DB query không có ORDER BY nên trước đây thứ tự ngẫu nhiên)
    (a.name ?? '').localeCompare(b.name ?? '', 'vi', { sensitivity: 'base' })
  );

  const handleSave = (u: User) => {
    setUsers(prev => {
      const exists = prev.find(x => x.id === u.id);
      if (exists) return prev.map(x => x.id === u.id ? u : x);
      return [...prev, u];
    });
    // Refresh dropdown cache to reflect updated department/position data
    void loadDropdownData();
    // Refetch users list silently (không setLoading → không scroll về top)
    void loadUsers(true);
    setModal(null);
  };

  const getDepartmentName = (user: User): string => {
    if (!user.company_id || !user.department_id) return '';
    const departments = dropdownCache.companyDepartmentsMap[user.company_id] || [];
    const department = departments.find(d => d.id === user.department_id);
    return department?.name || '';
  };

  const getPositionName = (user: User): string => {
    if (!user.company_id || !user.position_id) return user.position || '';
    const positions = dropdownCache.positions[user.company_id] || [];
    const position = positions.find(p => p.id === user.position_id);
    return position?.name || user.position || '';
  };

  const getJobTitle = (user: User): string => {
    const posName = getPositionName(user);

    // If has sub-department, show Position + Sub-department
    if (user.sub_department_id && user.department_id) {
      const subDepts = dropdownCache.subDepartmentsByDepartmentId[user.department_id] || [];
      const subDept = subDepts.find(sd => sd.id === user.sub_department_id);
      const subDeptName = subDept?.name || '';
      if (subDeptName) {
        return `${posName} ${subDeptName}`.trim();
      }
    }

    // Otherwise, show Position + Department
    const deptName = getDepartmentName(user);
    return `${posName} ${deptName}`.trim();
  };

  const getCompanyName = (user: User): string => {
    if (!user.company_id) return '';
    const company = dropdownCache.companies.find(c => c.id === user.company_id);
    return company?.name || '';
  };

  /** Badge trạng thái đồng bộ SSO — hiển thị cạnh badge trạng thái user. */
  const renderSsoBadge = (u: any) => {
    if (u.sso_sync_status === 'synced') {
      return <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-2xs font-600 bg-green-500/15 text-green-300" title="Đã đồng bộ SSO">✓ SSO</span>;
    }
    if (u.sso_sync_status === 'skipped_zimbra') {
      return <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-2xs font-600 bg-sky-500/15 text-sky-300" title="Đăng nhập SSO bằng tài khoản Zimbra">Zimbra</span>;
    }
    if (u.sso_sync_status === 'error') {
      return <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-2xs font-600 bg-amber-500/15 text-amber-300" title={u.sso_sync_error || 'Đồng bộ SSO lỗi'}>⚠ SSO</span>;
    }
    return <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-2xs font-600 bg-white/5 text-muted-foreground" title="Chưa đồng bộ SSO">— SSO</span>;
  };

  /**
   * Gửi (lại) email cấp tài khoản: username = working email; mật khẩu AssetFlow
   * không khôi phục được (chỉ lưu hash) → QTV tự nhập; mật khẩu Zimbra lấy từ config.
   */
  const openAccountEmail = (u: User) => {
    setAccountEmail({
      to: String((u as unknown as { personal_email?: string }).personal_email || ''),
      ung_vien: u.name,
      cong_ty: getCompanyName(u),
      assetflow_user: u.email,
      assetflow_pass: '',
      zimbra_user: u.email,
      zimbra_pass: '',
    });
  };

  const handleSort = (field: 'name' | 'email' | 'last_active') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const getSortedFiltered = () => {
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      let aVal = '';
      let bVal = '';

      if (sortBy === 'name') {
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
      } else if (sortBy === 'email') {
        aVal = a.email.toLowerCase();
        bVal = b.email.toLowerCase();
      } else if (sortBy === 'last_active') {
        aVal = (a as any).last_active || a.last_login || '';
        bVal = (b as any).last_active || b.last_login || '';
      }

      if (sortOrder === 'asc') {
        return aVal.localeCompare(bVal);
      } else {
        return bVal.localeCompare(aVal);
      }
    });
    return sorted;
  };

  const sortedAll = getSortedFiltered();
  const totalPages = Math.max(1, Math.ceil(sortedAll.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedData = sortedAll.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleArchive = async () => {
    if (!archiveId) return;
    setDeleting(true);
    try {
      const user = users.find(u => u.id === archiveId);
      if (!user) return;

      const newStatus = user.status === 'active' ? 'inactive' : 'active';
      await updateUser(archiveId, { status: newStatus });
      setUsers(p => p.map(u => u.id === archiveId ? { ...u, status: newStatus } : u));
      setArchiveId(null);
      toast.success(newStatus === 'inactive' ? 'Đã lưu trữ người dùng' : 'Đã kích hoạt lại người dùng');
    } catch (error) {
      console.error('Error archiving/activating user:', error);
      toast.error('Không thể cập nhật trạng thái người dùng. Vui lòng thử lại.');
    } finally {
      setDeleting(false);
    }
  };

  const handleSsoSync = async (u: any) => {
    try {
      const res = await fetch(`/api/users/${u.id}/sso-sync`, { method: 'POST' });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.result?.status !== 'error') {
        toast.success('Đã đồng bộ SSO');
      } else {
        toast.error(j?.result?.error || j?.error || 'Đồng bộ SSO thất bại');
      }
      await loadUsers(true);
    } catch {
      toast.error('Đồng bộ SSO thất bại');
    }
  };

  const handleSsoSyncAll = async () => {
    if (!confirm('Đồng bộ toàn bộ người dùng đang hoạt động sang SSO? Quá trình chạy theo lô, có thể mất vài phút.')) return;
    setBulkSyncing(true);
    const total = { synced: 0, skippedZimbra: 0, emailed: 0, errors: [] as Array<{ email: string; error: string }> };
    try {
      // Gọi lặp theo batch tới khi hết; dừng nếu 1 batch toàn lỗi (tránh vòng vô hạn).
      for (let i = 0; i < 100; i++) {
        const res = await fetch('/api/users/sso-sync-all', { method: 'POST' });
        const j = await res.json();
        if (!res.ok) { toast.error(j?.error || 'Đồng bộ hàng loạt thất bại'); break; }
        total.synced += j.synced; total.skippedZimbra += j.skippedZimbra; total.emailed += j.emailed || 0; total.errors.push(...j.errors);
        if (j.remaining === 0 || (j.processed > 0 && j.synced + j.skippedZimbra === 0)) break;
      }
      // emailed = số user MỚI được gửi email mật khẩu ban đầu — đây là cách DUY NHẤT
      // user không thuộc Zimbra biết mật khẩu SSO của mình, nên phải báo rõ cho admin.
      const summary = `Đồng bộ SSO xong: ${total.synced} thành công (${total.emailed} đã gửi email mật khẩu), ${total.skippedZimbra} Zimbra, ${total.errors.length} lỗi`;
      if (total.errors.length) toast.error(summary); else toast.success(summary);
    } finally {
      setBulkSyncing(false);
      await loadUsers(true);
    }
  };

  const handleHardDelete = async () => {
    if (!hardDelId || !hdPassword) return;
    setHdBusy(true); setHdError('');
    try {
      const res = await fetch(`/api/users/${hardDelId}/hard-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-current-user-id': currentUser?.id || '' },
        body: JSON.stringify({ password: hdPassword }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setHdError(json.error || 'Không xoá được'); return; }
      setUsers(p => p.filter(u => u.id !== hardDelId));
      setHardDelId(null); setHdPassword('');
    } catch {
      setHdError('Lỗi kết nối');
    } finally {
      setHdBusy(false);
    }
  };

  const loadAuditLogs = async (userId: string) => {
    try {
      const logs = await getAuditLogs(userId);
      setAuditLogs(logs);
    } catch (error) {
      console.error('Error loading audit logs:', error);
      toast.error('Không tải được lịch sử thao tác.');
    }
  };

  const renderCardView = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {loading ? (
        <div className="col-span-full flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : usersError ? (
        <div className="col-span-full"><ErrorState onRetry={() => loadUsers()} /></div>
      ) : filtered.length === 0 ? (
        <div className="col-span-full"><EmptyState icon={UsersIcon} title="Không tìm thấy người dùng nào" description="Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm." /></div>
      ) : (
        filtered.map(u => {
          const rc = ROLE_CONFIG[u.role] ?? ROLE_CONFIG.user;
          const initials = u.name.split(' ').map(w => w[0]).slice(-2).join('').toUpperCase();
          const lastLogin = (u as any).last_active
            ? new Date((u as any).last_active).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : u.last_login
              ? new Date(u.last_login).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
              : 'Chưa sử dụng';
          const statusColor = u.status === 'active' ? 'bg-green-500' : 'bg-red-500';
          const hr = computeHrCompleteness(u as unknown as Record<string, unknown>);
          return (
            <div key={u.id} className="relative rounded-2xl border border-white/05 p-5 hover:border-line transition-all" style={{ background: 'var(--card)' }}>
              {/* Logo công ty — định vị tuyệt đối ở góc phải-dưới (khoảng trống), không tăng chiều cao card */}
              {u.company_id && companyLogos[u.company_id] && (
                <div className="pointer-events-none absolute bottom-4 right-4 flex h-[88px] items-center" title={getCompanyName(u)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={companyLogos[u.company_id]}
                    alt={getCompanyName(u) || 'logo'}
                    className="h-[72px] w-auto max-w-[320px] object-contain"
                  />
                </div>
              )}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 flex-1">
                  <div className="relative shrink-0">
                    <CompletenessRing
                      percent={hr.percent}
                      size={52}
                      stroke={3}
                      title={`Hồ sơ nhân sự: ${hr.filled}/${hr.total} field đã điền (${hr.percent}%)`}
                    >
                      {u.avatar && u.avatar.startsWith('/') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.avatar} alt={u.name} className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                          style={{ background: 'linear-gradient(135deg, #6366f1, #C62828)' }}>
                          {initials}
                        </div>
                      )}
                    </CompletenessRing>
                    {/* Chấm trạng thái: xanh = đang ở văn phòng, vàng = nghỉ phép đã duyệt, xám = không có mặt */}
                    <div
                      className={`absolute top-0 right-0 w-3 h-3 rounded-full border-2 border-[#0B1F3B] transition-colors ${presenceDot(presence[u.id]).color}`}
                      title={presenceDot(presence[u.id]).title}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-600 text-foreground">{u.name}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className={`inline-flex items-center gap-1 text-2xs font-600 px-2 py-0.5 rounded-full border ${rc.bg} ${rc.color}`}>
                        <Shield size={9} />
                        {rc.label}
                      </span>
                      {renderSsoBadge(u)}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => setModal({ mode: 'view', user: u })}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-cyan-300 hover:bg-cyan-500/15 transition-colors"
                    title="Xem thẻ tên"
                  >
                    <IdCard size={13} />
                  </button>
                  {(isSuperAdmin(currentUser) || currentUser?.role === 'admin') && (
                    <button
                      onClick={() => setProfileUser(u)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-violet-300 hover:bg-violet-500/15 transition-colors"
                      title="Sơ yếu lý lịch"
                    >
                      <FileText size={13} />
                    </button>
                  )}
                  {(isSuperAdmin(currentUser) || currentUser?.role === 'admin') && (
                    <button
                      onClick={() => openAccountEmail(u)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-indigo-300 hover:bg-indigo-500/15 transition-colors"
                      title="Gửi email cấp tài khoản"
                    >
                      <Send size={13} />
                    </button>
                  )}
                  {isSuperAdmin(currentUser) && u.id !== currentUser.id && (
                    <button
                      onClick={() => setArchiveId(u.id)}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                        u.status === 'active'
                          ? 'text-orange-400 hover:bg-orange-500/15'
                          : 'text-green-400 hover:bg-green-500/15'
                      }`}
                      title={u.status === 'active' ? 'Lưu trữ' : 'Kích hoạt'}
                    >
                      {u.status === 'active' ? <Archive size={13} /> : <RotateCcw size={13} />}
                    </button>
                  )}
                  {isSuperAdmin(currentUser) && u.id !== currentUser.id && (
                    <button
                      onClick={() => { setHardDelId(u.id); setHdPassword(''); setHdError(''); }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-500/15 transition-colors"
                      title="Xoá vĩnh viễn"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                  {(isSuperAdmin(currentUser) || currentUser?.role === 'admin') && (
                    <button
                      onClick={() => setModal({ mode: 'edit', user: u })}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-amber-300 hover:bg-amber-500/15 transition-colors"
                      title="Sửa"
                    >
                      <Edit2 size={13} />
                    </button>
                  )}
                  {(isSuperAdmin(currentUser) || currentUser?.role === 'admin') && (
                    <button
                      onClick={() => handleSsoSync(u)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-indigo-400 hover:bg-white/5 transition-colors"
                      title="Đồng bộ SSO"
                    >
                      <RefreshCw size={13} />
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Mail size={12} className="shrink-0" />
                  <span className="truncate">{u.email}</span>
                </div>
                {u.phone && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone size={12} className="shrink-0" />
                    <span>{u.phone}</span>
                  </div>
                )}
                {getJobTitle(u) && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Shield size={12} className="shrink-0" />
                    <span>{getJobTitle(u)}</span>
                  </div>
                )}
                {getDepartmentName(u) && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Building size={12} className="shrink-0" />
                    <span>{getDepartmentName(u)}</span>
                  </div>
                )}
                {getCompanyName(u) && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Building size={12} className="shrink-0" />
                    <span>{getCompanyName(u)}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground" title="Lần sử dụng cuối">
                  <Clock size={12} className="shrink-0" />
                  <span>{lastLogin}</span>
                </div>
                {u.tags && u.tags.length > 0 && (
                  <div className="flex items-start gap-1.5 flex-wrap mt-2 pt-1.5">
                    {u.tags.map(tag => (
                      <span
                        key={tag.id}
                        className="tag-badge inline-flex items-center text-2xs font-500 px-2 py-0.5 rounded-full"
                        style={{ ['--tag' as string]: tag.color } as React.CSSProperties}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  const renderTableView = () => (
    <div className="rounded-2xl border border-white/05 overflow-hidden" style={{ background: 'var(--card)' }}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/05">
              <th className="px-3 py-3 text-center w-10">
                <input type="checkbox" className="w-4 h-4 rounded accent-indigo-500 align-middle"
                  title="Chọn tất cả theo bộ lọc hiện tại"
                  checked={sortedAll.length > 0 && sortedAll.every(u => selectedIds.has(u.id))}
                  ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && !sortedAll.every(u => selectedIds.has(u.id)); }}
                  onChange={e => setSelectedIds(e.target.checked ? new Set(sortedAll.map(u => u.id)) : new Set())} />
              </th>
              <th className="px-4 py-3 text-center text-xs font-600 text-muted-foreground w-12">STT</th>
              <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground sticky left-0 z-10" style={{ background: 'var(--card)' }}>
                <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Avatar & Tên
                  <span className="text-2xs">{sortBy === 'name' ? (sortOrder === 'asc' ? '↑' : '↓') : '·'}</span>
                </button>
              </th>
              {visibleColumns.has('email') && (
                <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">
                  <button onClick={() => handleSort('email')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                    Email
                    <span className="text-2xs">{sortBy === 'email' ? (sortOrder === 'asc' ? '↑' : '↓') : '·'}</span>
                  </button>
                </th>
              )}
              {visibleColumns.has('position') && (
                <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Chức Vụ</th>
              )}
              {visibleColumns.has('department') && (
                <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Phòng Ban</th>
              )}
              {visibleColumns.has('role') && (
                <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Vai Trò</th>
              )}
              {visibleColumns.has('status') && (
                <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Trạng Thái</th>
              )}
              {visibleColumns.has('last_login') && (
                <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">
                  <button onClick={() => handleSort('last_active')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                    Sử Dụng Cuối
                    <span className="text-2xs">{sortBy === 'last_active' ? (sortOrder === 'asc' ? '↑' : '↓') : '·'}</span>
                  </button>
                </th>
              )}
              {visibleColumns.has('phone') && (
                <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Số Điện Thoại</th>
              )}
              {visibleColumns.has('company') && (
                <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Công Ty</th>
              )}
              {visibleColumns.has('manager') && (
                <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Quản Lý</th>
              )}
              {visibleColumns.has('employee_code') && (
                <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Mã NV</th>
              )}
              {visibleColumns.has('job_title') && (
                <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Chức Danh</th>
              )}
              {visibleColumns.has('hire_date') && (
                <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Ngày Vào Làm</th>
              )}
              {visibleColumns.has('employment_type') && (
                <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Hợp Đồng</th>
              )}
              {visibleColumns.has('date_of_birth') && (
                <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Ngày Sinh</th>
              )}
              {visibleColumns.has('gender') && (
                <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Giới Tính</th>
              )}
              {visibleColumns.has('work_location') && (
                <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Nơi Làm Việc</th>
              )}
              {/* Nhóm Cá nhân */}
              {visibleColumns.has('personal_email') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Email Cá Nhân</th>}
              {visibleColumns.has('nationality') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Quốc Tịch</th>}
              {visibleColumns.has('ethnicity') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Dân Tộc</th>}
              {visibleColumns.has('religion') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Tôn Giáo</th>}
              {visibleColumns.has('marital_status') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Hôn Nhân</th>}
              {visibleColumns.has('children_count') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Số Con</th>}
              {visibleColumns.has('education_level') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Học Vấn</th>}
              {visibleColumns.has('major') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Chuyên Ngành</th>}
              {/* Nhóm Địa chỉ & phương tiện */}
              {visibleColumns.has('home_address') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Địa Chỉ TT</th>}
              {visibleColumns.has('temporary_address') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Địa Chỉ Tạm Trú</th>}
              {visibleColumns.has('vehicle_type') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Phương Tiện</th>}
              {visibleColumns.has('vehicle_plate') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Biển Số</th>}
              {visibleColumns.has('vehicle_model') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Hiệu Xe</th>}
              {/* Nhóm Tài chính & pháp lý */}
              {visibleColumns.has('bank_name') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Ngân Hàng</th>}
              {visibleColumns.has('bank_account_no') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Số TK</th>}
              {visibleColumns.has('bank_account_name') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Tên Chủ TK</th>}
              {visibleColumns.has('national_id') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">CCCD</th>}
              {visibleColumns.has('national_id_issue_date') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Ngày Cấp</th>}
              {visibleColumns.has('national_id_issue_place') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Nơi Cấp</th>}
              {visibleColumns.has('social_insurance_unit') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Đơn Vị BHXH</th>}
              {visibleColumns.has('social_insurance_base') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Mức BHXH</th>}
              {visibleColumns.has('meal_allowance_rate') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">PC Cơm</th>}
              {visibleColumns.has('parking_allowance_rate') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">PC Gửi Xe</th>}
              {visibleColumns.has('travel_allowance_rate') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Công Tác Phí</th>}
              {visibleColumns.has('salary_entity') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Đơn Vị Lương</th>}
              {visibleColumns.has('cost_center_code') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Mã CC</th>}
              {/* Nhóm Liên hệ khẩn cấp */}
              {visibleColumns.has('emergency_contact_name') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Người Thân 1</th>}
              {visibleColumns.has('emergency_contact_relationship') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Quan Hệ 1</th>}
              {visibleColumns.has('emergency_contact_phone') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">SĐT NT1</th>}
              {visibleColumns.has('emergency_contact_2_name') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Người Thân 2</th>}
              {visibleColumns.has('emergency_contact_2_relationship') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Quan Hệ 2</th>}
              {visibleColumns.has('emergency_contact_2_phone') && <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">SĐT NT2</th>}
              <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground">Hành Động</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colSpanTotal} className="px-4 py-10 text-center"><Loader2 className="inline h-6 w-6 animate-spin text-muted-foreground" /></td></tr>
            ) : usersError ? (
              <tr><td colSpan={colSpanTotal} className="px-4 py-2"><ErrorState onRetry={() => loadUsers()} /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={colSpanTotal} className="px-4 py-2"><EmptyState icon={UsersIcon} title="Không tìm thấy người dùng nào" description="Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm." /></td></tr>
            ) : (
              pagedData.map((u, idx) => {
                const rc = ROLE_CONFIG[u.role] ?? ROLE_CONFIG.user;
                const initials = u.name.split(' ').map(w => w[0]).slice(-2).join('').toUpperCase();
                const lastLogin = (u as any).last_active
                  ? new Date((u as any).last_active).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  : u.last_login
                    ? new Date(u.last_login).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    : 'Chưa sử dụng';
                const statusColor = u.status === 'active' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300';
                const statusLabel = u.status === 'active' ? 'Đang hoạt động' : 'Không hoạt động';
                const globalIdx = (safePage - 1) * pageSize + idx;
                return (
                  <tr
                    key={u.id}
                    className={`border-b border-white/05 hover:bg-white/02 transition-colors ${
                      selectedIds.has(u.id) ? 'bg-indigo-500/[0.07]' : idx % 2 === 0 ? 'bg-white/[0.01]' : ''
                    }`}
                  >
                    <td className="px-3 py-3 text-center">
                      <input type="checkbox" className="w-4 h-4 rounded accent-indigo-500 align-middle"
                        checked={selectedIds.has(u.id)} onChange={() => toggleSelect(u.id)} />
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-muted-foreground tabular-nums">{globalIdx + 1}</td>
                    <td className="px-4 py-3 sticky left-0 z-10" style={{ background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'var(--card)' }}>
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          {u.avatar && u.avatar.startsWith('/') ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={u.avatar} alt={u.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                              style={{ background: 'linear-gradient(135deg, #6366f1, #C62828)' }}>
                              {initials}
                            </div>
                          )}
                          <div
                            className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-[#0B1F3B] transition-colors ${presenceDot(presence[u.id]).color}`}
                            title={presenceDot(presence[u.id]).title}
                          />
                        </div>
                        <div>
                          <p className="text-sm font-500 text-foreground">{u.name}</p>
                        </div>
                      </div>
                    </td>
                    {visibleColumns.has('email') && (
                      <td className="px-4 py-3 text-sm text-muted-foreground truncate max-w-[180px]">{u.email}</td>
                    )}
                    {visibleColumns.has('position') && (
                      <td className="px-4 py-3 text-sm text-muted-foreground">{getPositionName(u) || '—'}</td>
                    )}
                    {visibleColumns.has('department') && (
                      <td className="px-4 py-3 text-sm text-muted-foreground">{getDepartmentName(u) || '—'}</td>
                    )}
                    {visibleColumns.has('role') && (
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-2xs font-600 px-2 py-0.5 rounded-full border ${rc.bg} ${rc.color}`}>
                          <Shield size={9} />
                          {rc.label}
                        </span>
                      </td>
                    )}
                    {visibleColumns.has('status') && (
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`inline-flex text-2xs font-500 px-2 py-0.5 rounded-full ${statusColor}`}>
                            {statusLabel}
                          </span>
                          {renderSsoBadge(u)}
                        </div>
                      </td>
                    )}
                    {visibleColumns.has('last_login') && (
                      <td className="px-4 py-3 text-sm text-muted-foreground">{lastLogin}</td>
                    )}
                    {visibleColumns.has('phone') && (
                      <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).phone || '—'}</td>
                    )}
                    {visibleColumns.has('company') && (
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {dropdownCache.companies.find(c => c.id === u.company_id)?.name || '—'}
                      </td>
                    )}
                    {visibleColumns.has('manager') && (
                      <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).manager_name || '—'}</td>
                    )}
                    {visibleColumns.has('employee_code') && (
                      <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{(u as any).employee_code || '—'}</td>
                    )}
                    {visibleColumns.has('job_title') && (
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {u.job_title_id && u.company_id
                          ? (dropdownCache.jobTitles[u.company_id] || []).find(jt => jt.id === u.job_title_id)?.title || '—'
                          : '—'}
                      </td>
                    )}
                    {visibleColumns.has('hire_date') && (
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {(u as any).hire_date ? new Date((u as any).hire_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                      </td>
                    )}
                    {visibleColumns.has('employment_type') && (
                      <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).employment_type || '—'}</td>
                    )}
                    {visibleColumns.has('date_of_birth') && (
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {(u as any).date_of_birth ? new Date((u as any).date_of_birth).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                      </td>
                    )}
                    {visibleColumns.has('gender') && (
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {(u as any).gender === 'MALE' ? 'Nam' : (u as any).gender === 'FEMALE' ? 'Nữ' : (u as any).gender || '—'}
                      </td>
                    )}
                    {visibleColumns.has('work_location') && (
                      <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).work_location || '—'}</td>
                    )}
                    {/* Nhóm Cá nhân */}
                    {visibleColumns.has('personal_email') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).personal_email || '—'}</td>}
                    {visibleColumns.has('nationality') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).nationality || '—'}</td>}
                    {visibleColumns.has('ethnicity') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).ethnicity || '—'}</td>}
                    {visibleColumns.has('religion') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).religion || '—'}</td>}
                    {visibleColumns.has('marital_status') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).marital_status || '—'}</td>}
                    {visibleColumns.has('children_count') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).children_count ?? '—'}</td>}
                    {visibleColumns.has('education_level') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).education_level || '—'}</td>}
                    {visibleColumns.has('major') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).major || '—'}</td>}
                    {/* Nhóm Địa chỉ & phương tiện */}
                    {visibleColumns.has('home_address') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).home_address || '—'}</td>}
                    {visibleColumns.has('temporary_address') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).temporary_address || '—'}</td>}
                    {visibleColumns.has('vehicle_type') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).vehicle_type || '—'}</td>}
                    {visibleColumns.has('vehicle_plate') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).vehicle_plate || '—'}</td>}
                    {visibleColumns.has('vehicle_model') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).vehicle_model || '—'}</td>}
                    {/* Nhóm Tài chính & pháp lý */}
                    {visibleColumns.has('bank_name') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).bank_name || '—'}</td>}
                    {visibleColumns.has('bank_account_no') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).bank_account_no || '—'}</td>}
                    {visibleColumns.has('bank_account_name') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).bank_account_name || '—'}</td>}
                    {visibleColumns.has('national_id') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).national_id || '—'}</td>}
                    {visibleColumns.has('national_id_issue_date') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).national_id_issue_date || '—'}</td>}
                    {visibleColumns.has('national_id_issue_place') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).national_id_issue_place || '—'}</td>}
                    {visibleColumns.has('social_insurance_unit') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).social_insurance_unit || '—'}</td>}
                    {visibleColumns.has('social_insurance_base') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).social_insurance_base || '—'}</td>}
                    {visibleColumns.has('meal_allowance_rate') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).meal_allowance_rate ?? '—'}</td>}
                    {visibleColumns.has('parking_allowance_rate') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).parking_allowance_rate ?? '—'}</td>}
                    {visibleColumns.has('travel_allowance_rate') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).travel_allowance_rate ?? '—'}</td>}
                    {visibleColumns.has('salary_entity') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).salary_entity || '—'}</td>}
                    {visibleColumns.has('cost_center_code') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).cost_center_code || '—'}</td>}
                    {/* Nhóm Liên hệ khẩn cấp */}
                    {visibleColumns.has('emergency_contact_name') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).emergency_contact_name || '—'}</td>}
                    {visibleColumns.has('emergency_contact_relationship') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).emergency_contact_relationship || '—'}</td>}
                    {visibleColumns.has('emergency_contact_phone') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).emergency_contact_phone || '—'}</td>}
                    {visibleColumns.has('emergency_contact_2_name') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).emergency_contact_2_name || '—'}</td>}
                    {visibleColumns.has('emergency_contact_2_relationship') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).emergency_contact_2_relationship || '—'}</td>}
                    {visibleColumns.has('emergency_contact_2_phone') && <td className="px-4 py-3 text-sm text-muted-foreground">{(u as any).emergency_contact_2_phone || '—'}</td>}
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => setModal({ mode: 'view', user: u })}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-cyan-300 hover:bg-cyan-500/15 transition-colors"
                          title="Xem thẻ tên"
                        >
                          <IdCard size={13} />
                        </button>
                        {(isSuperAdmin(currentUser) || currentUser?.role === 'admin') && (
                          <button
                            onClick={() => setProfileUser(u)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-violet-300 hover:bg-violet-500/15 transition-colors"
                            title="Sơ yếu lý lịch"
                          >
                            <FileText size={13} />
                          </button>
                        )}
                        {(isSuperAdmin(currentUser) || currentUser?.role === 'admin') && (
                          <button
                            onClick={() => openAccountEmail(u)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-indigo-300 hover:bg-indigo-500/15 transition-colors"
                            title="Gửi email cấp tài khoản"
                          >
                            <Send size={13} />
                          </button>
                        )}
                        {isSuperAdmin(currentUser) && u.id !== currentUser.id && (
                          <button
                            onClick={() => setArchiveId(u.id)}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                              u.status === 'active'
                                ? 'text-orange-400 hover:bg-orange-500/15'
                                : 'text-green-400 hover:bg-green-500/15'
                            }`}
                            title={u.status === 'active' ? 'Lưu trữ' : 'Kích hoạt'}
                          >
                            {u.status === 'active' ? <Archive size={13} /> : <RotateCcw size={13} />}
                          </button>
                        )}
                        {isSuperAdmin(currentUser) && u.id !== currentUser.id && (
                          <button
                            onClick={() => { setHardDelId(u.id); setHdPassword(''); setHdError(''); }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-500/15 transition-colors"
                            title="Xoá vĩnh viễn"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                        {(isSuperAdmin(currentUser) || currentUser?.role === 'admin') && (
                          <button
                            onClick={() => setModal({ mode: 'edit', user: u })}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-amber-300 hover:bg-amber-500/15 transition-colors"
                            title="Sửa"
                          >
                            <Edit2 size={13} />
                          </button>
                        )}
                        {(isSuperAdmin(currentUser) || currentUser?.role === 'admin') && (
                          <button
                            onClick={() => handleSsoSync(u)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-indigo-400 hover:bg-white/5 transition-colors"
                            title="Đồng bộ SSO"
                          >
                            <RefreshCw size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      {sortedAll.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-line-subtle">
          {/* Tổng & chọn số dòng */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sortedAll.length)} / {sortedAll.length} người dùng
            </span>
            <div className="flex items-center gap-1">
              {[10, 20, 50].map(size => (
                <button
                  key={size}
                  onClick={() => { setPageSize(size); localStorage.setItem('usersTablePageSize', String(size)); }}
                  className={`h-6 w-8 rounded text-2xs font-600 transition-colors ${
                    pageSize === size
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-hover'
                  }`}
                >
                  {size}
                </button>
              ))}
              <span className="text-2xs text-muted-foreground ml-1">/ trang</span>
            </div>
          </div>

          {/* Điều hướng trang */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={safePage === 1}
                className="h-7 w-7 rounded flex items-center justify-center text-xs text-muted-foreground hover:text-foreground hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >«</button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="h-7 w-7 rounded flex items-center justify-center text-xs text-muted-foreground hover:text-foreground hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >‹</button>

              {/* Số trang — hiện tối đa 5 nút */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .reduce<(number | 'ellipsis')[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('ellipsis');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === 'ellipsis' ? (
                    <span key={`e${i}`} className="h-7 w-5 flex items-center justify-center text-xs text-muted-foreground">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p as number)}
                      className={`h-7 min-w-[28px] px-1.5 rounded text-xs font-600 transition-colors ${
                        safePage === p
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          : 'text-muted-foreground hover:text-foreground hover:bg-hover'
                      }`}
                    >{p}</button>
                  )
                )
              }

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="h-7 w-7 rounded flex items-center justify-center text-xs text-muted-foreground hover:text-foreground hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >›</button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={safePage === totalPages}
                className="h-7 w-7 rounded flex items-center justify-center text-xs text-muted-foreground hover:text-foreground hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >»</button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-foreground">Quản Lý Người Dùng</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{filtered.length} người dùng trong hệ thống</p>
          <button
            onClick={() => setBirthdayOpen(true)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-600 text-amber-400 hover:bg-amber-500/20 transition-colors"
          >
            <Cake className="h-3.5 w-3.5" /> Sinh nhật tháng này
          </button>
        </div>

        {/* Đồng bộ SSO (bulk) + Duyệt Người Dùng + Thêm Người Dùng - With Permission Check */}
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {isSuperAdmin(currentUser) && (
            <button
              onClick={handleSsoSyncAll}
              disabled={bulkSyncing}
              className="btn-ghost rounded-xl px-3 py-2 text-sm flex items-center justify-center gap-2 disabled:opacity-60 w-full sm:w-auto"
              title="Đồng bộ toàn bộ người dùng đang hoạt động sang SSO (chỉ Quản trị viên tối cao)"
            >
              {bulkSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Đồng bộ SSO
            </button>
          )}
          {canAccess(currentUser?.module_permissions, 'users', 'create') ? (
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <button
                onClick={() => setShowApprove(true)}
                className="relative flex items-center justify-center gap-2 h-9 px-4 rounded-xl text-sm font-600 border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 w-full sm:w-auto transition-colors"
                title="Duyệt nhân sự mới từ luồng onboarding"
              >
                <UserCheck size={15} />
                Duyệt Người Dùng
                {pendingApprovalCount > 0 && (
                  <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-2xs font-700 text-white"
                    style={{ background: '#C62828' }}>
                    {pendingApprovalCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setModal({ mode: 'create' })}
                className="flex items-center justify-center gap-2 h-9 px-4 rounded-xl text-sm font-600 btn-accent w-full sm:w-auto hover:bg-indigo-700 transition-colors"
                title="Tạo người dùng mới"
              >
                <Plus size={15} />
                Thêm Người Dùng
              </button>
            </div>
          ) : (
            <button
              disabled
              className="flex items-center justify-center gap-2 h-9 px-4 rounded-xl text-sm font-600 bg-gray-600/30 text-gray-400 border border-gray-600/30 w-full sm:w-auto cursor-not-allowed"
              title="Bạn không có quyền tạo người dùng mới"
            >
              <Lock size={15} />
              Thêm Người Dùng
            </button>
          )}
        </div>
      </div>

      {/* Stats - Roles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        {[
          { label: 'Super Admin', value: users.filter(u => u.role === 'super_admin').length, color: 'text-violet-400' },
          { label: 'Admin', value: users.filter(u => u.role === 'admin').length, color: 'text-indigo-400' },
          { label: 'Quản Lý', value: users.filter(u => u.role === 'manager').length, color: 'text-emerald-400' },
          { label: 'Người Dùng', value: users.filter(u => u.role === 'user').length, color: 'text-ink-bright' },
        ].map((s, i) => (
          <div key={i} className="rounded-2xl p-3 sm:p-4 border border-white/05" style={{ background: 'var(--card)' }}>
            <p className={`text-xl sm:text-2xl font-700 ${s.color}`}>{s.value}</p>
            <p className="text-2xs sm:text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Stats - Status */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {[
          { label: 'Đang hoạt động', value: allUsers.filter(u => u.status === 'active').length, color: 'text-green-400' },
          { label: 'Không hoạt động', value: allUsers.filter(u => u.status === 'inactive').length, color: 'text-red-400' },
        ].map((s, i) => (
          <div key={i} className="rounded-2xl p-3 sm:p-4 border border-white/05" style={{ background: 'var(--card)' }}>
            <p className={`text-xl sm:text-2xl font-700 ${s.color}`}>{s.value}</p>
            <p className="text-2xs sm:text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <UsersFilters
            companies={dropdownCache.companies}
            departments={filters.company_id ? (dropdownCache.companyDepartmentsMap[filters.company_id] || []) : []}
            jobTitles={filters.company_id ? (dropdownCache.jobTitles[filters.company_id] || []) : []}
            filters={filters}
            activeFilterCount={activeFilterCount}
            onFilterChange={handleFilterChange}
            onReset={handleResetFilters}
          />
        </div>

        {/* Xuất Excel (chỉ hiện khi ở chế độ bảng) */}
        {viewMode === 'table' && (
          <button
            onClick={exportExcel}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-600 border border-line bg-surface-2 text-emerald-400 hover:text-emerald-300 hover:border-emerald-500/30 transition-colors"
            title="Xuất Excel"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Xuất Excel</span>
          </button>
        )}

        {/* Column visibility (chỉ hiện khi ở chế độ bảng) */}
        {viewMode === 'table' && (
          <div className="relative">
            <button
              onClick={() => setShowColMenu(v => !v)}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-600 border border-line bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Columns size={14} />
              <span className="hidden sm:inline">Cột</span>
            </button>
            {showColMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowColMenu(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-50 w-52 rounded-xl border border-line shadow-xl overflow-hidden" style={{ background: 'var(--card)' }}>
                  <div className="px-3 py-2 border-b border-line-subtle flex items-center justify-between">
                    <p className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Hiển thị cột</p>
                    <button
                      onClick={() => {
                        const allOn = new Set<ColKey>([...ALL_COLUMNS]);
                        setVisibleColumns(allOn);
                        localStorage.setItem('usersTableCols', JSON.stringify([...allOn]));
                      }}
                      className="text-2xs text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      Bật tất cả
                    </button>
                  </div>
                  <div className="p-1.5 max-h-[520px] overflow-y-auto">
                    {COL_GROUPS.map((group, gi) => (
                      <div key={group.label}>
                        <p className={`px-2.5 pb-0.5 text-2xs font-600 text-muted-foreground/60 uppercase tracking-wider ${gi > 0 ? 'pt-2.5 border-t border-line-subtle mt-1.5' : 'pt-1'}`}>
                          {group.label}
                        </p>
                        {group.cols.map(col => (
                          <button
                            key={col}
                            onClick={() => toggleColumn(col)}
                            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-hover transition-colors text-left"
                          >
                            <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors flex-shrink-0 ${visibleColumns.has(col) ? 'bg-indigo-500 border-indigo-500' : 'border-line-strong'}`}>
                              {visibleColumns.has(col) && (
                                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                  <path d="M1 4L3.5 6.5L9 1.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </div>
                            <span className="text-xs text-foreground">{COL_LABELS[col]}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* View Mode Toggle - Fixed Position */}
        <div className="flex gap-1 bg-surface-2 border border-line rounded-lg p-1 h-fit">
          <button
            onClick={() => setViewMode('card')}
            className={`flex items-center justify-center gap-1.5 h-8 px-3 rounded-md text-2xs sm:text-xs font-600 transition-all ${
              viewMode === 'card'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Xem dạng thẻ"
          >
            <LayoutGrid size={14} />
            <span className="hidden sm:inline">Thẻ</span>
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center justify-center gap-1.5 h-8 px-3 rounded-md text-2xs sm:text-xs font-600 transition-all ${
              viewMode === 'table'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Xem dạng bảng"
          >
            <LayoutList size={14} />
            <span className="hidden sm:inline">Bảng</span>
          </button>
        </div>
      </div>

      {/* Thanh hành động khi chọn nhiều người */}
      {selectedIds.size > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3">
          <p className="text-sm text-foreground">Đã chọn <b className="text-indigo-300">{selectedIds.size}</b> người</p>
          <div className="flex items-center gap-2">
            <button onClick={clearSelection} className="btn-ghost rounded-xl px-3 py-1.5 text-sm">Bỏ chọn</button>
            <button onClick={() => setBulkOpen(true)} className="btn-indigo rounded-xl px-4 py-1.5 text-sm font-600">Sửa hàng loạt</button>
          </div>
        </div>
      )}

      {/* User cards or table */}
      {viewMode === 'card' ? renderCardView() : renderTableView()}

      {showApprove && (
        <ApproveUsersModal
          onClose={() => setShowApprove(false)}
          onApproved={() => { void loadUsers(); }}
        />
      )}

      {bulkOpen && (
        <BulkUserEditModal
          count={selectedIds.size}
          ids={Array.from(selectedIds)}
          onClose={() => setBulkOpen(false)}
          onApplied={() => { setBulkOpen(false); clearSelection(); void loadUsers(); }}
        />
      )}

      {modal && modal.mode === 'view' && modal.user ? (
        <UserNameCard
          user={modal.user}
          dropdownCache={dropdownCache}
          onClose={() => setModal(null)}
        />
      ) : modal ? (
        <UsersModalTabside
          user={modal.user}
          mode={modal.mode === 'change-password' ? 'edit' : modal.mode}
          currentUser={currentUser}
          onClose={() => setModal(null)}
          onSave={handleSave as (u: any) => void}
        />
      ) : null}

      {archiveId && (() => {
        const user = users.find(u => u.id === archiveId);
        const isArchiving = user?.status === 'active';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
            <div className="w-full max-w-xs sm:max-w-sm rounded-2xl sm:rounded-3xl border border-line p-4 sm:p-6" style={{ background: 'var(--card)' }}>
              <h3 className="text-base sm:text-lg font-700 text-foreground mb-2">
                {isArchiving ? 'Xác nhận lưu trữ tài khoản' : 'Xác nhận kích hoạt tài khoản'}
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground mb-4 sm:mb-6">
                {isArchiving
                  ? 'Bạn có chắc muốn lưu trữ tài khoản này không? Tài khoản sẽ chuyển sang trạng thái không hoạt động.'
                  : 'Bạn có chắc muốn kích hoạt tài khoản này không? Tài khoản sẽ chuyển sang trạng thái hoạt động.'}
              </p>
              <div className="flex gap-2 sm:gap-3">
                <button onClick={() => setArchiveId(null)} className="flex-1 h-9 rounded-xl btn-ghost text-xs sm:text-sm" disabled={deleting}>Hủy</button>
                <button onClick={handleArchive} className="flex-1 h-9 rounded-xl btn-accent text-xs sm:text-sm font-600 disabled:opacity-50" disabled={deleting}>
                  {deleting ? (isArchiving ? 'Đang lưu trữ...' : 'Đang kích hoạt...') : (isArchiving ? 'Lưu trữ' : 'Kích hoạt')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {birthdayOpen && <BirthdayMonthModal onClose={() => setBirthdayOpen(false)} />}

      {/* Xoá CỨNG tài khoản — yêu cầu mật khẩu admin */}
      {hardDelId && (() => {
        const user = users.find(u => u.id === hardDelId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
            <div className="w-full max-w-sm rounded-3xl border border-red-500/30 p-5 sm:p-6" style={{ background: 'var(--card)' }}>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                </div>
                <h3 className="text-base font-700 text-foreground">Xoá vĩnh viễn tài khoản</h3>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground mb-3">
                Xoá <span className="text-foreground font-600">{user?.name || 'tài khoản này'}</span> khỏi hệ thống —
                <span className="text-red-400 font-600"> KHÔNG THỂ HỒI PHỤC</span>. Tài sản đang cấp sẽ được gỡ về kho.
                Nhập <span className="text-foreground font-600">mật khẩu admin</span> để xác nhận.
              </p>
              <input
                type="password"
                value={hdPassword}
                onChange={(e) => { setHdPassword(e.target.value); setHdError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleHardDelete(); }}
                placeholder="Mật khẩu admin"
                autoFocus
                className="w-full h-10 px-3 rounded-xl text-sm bg-surface-2 border border-line text-foreground placeholder:text-ink-faint focus:outline-none focus:border-red-500/60 mb-2"
              />
              {hdError && <p className="text-xs text-red-400 mb-2 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> {hdError}</p>}
              <div className="flex gap-2 sm:gap-3 mt-2">
                <button onClick={() => { setHardDelId(null); setHdPassword(''); setHdError(''); }} disabled={hdBusy}
                  className="flex-1 h-9 rounded-xl btn-ghost text-xs sm:text-sm">Hủy</button>
                <button onClick={handleHardDelete} disabled={hdBusy || !hdPassword}
                  className="flex-1 h-9 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs sm:text-sm font-600 disabled:opacity-50">
                  {hdBusy ? 'Đang xoá...' : 'Xoá vĩnh viễn'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {profileUser && (
        <QuickProfileModal
          user={profileUser}
          dropdownCache={dropdownCache}
          onClose={() => setProfileUser(null)}
        />
      )}

      {accountEmail && (
        <SendAccountEmailModal defaults={accountEmail} onClose={() => setAccountEmail(null)} />
      )}

      {auditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm sm:max-w-2xl rounded-2xl sm:rounded-3xl border border-line overflow-hidden" style={{ background: 'var(--card)' }}>
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-white/08">
              <h2 className="text-sm sm:text-lg font-700 text-foreground truncate">Lịch sử: {auditModal.userName}</h2>
              <button onClick={() => setAuditModal(null)} className="w-8 h-8 rounded-xl btn-ghost flex items-center justify-center text-muted-foreground flex-shrink-0 ml-2">
                <XCircle size={16} className="sm:w-[18px] sm:h-[18px]" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-2 sm:space-y-3 max-h-[70vh] sm:max-h-[60vh] overflow-y-auto">
              {auditLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Không có hoạt động nào</p>
              ) : (
                auditLogs.map((log, i) => (
                  <div key={i} className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl border border-white/05" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-500 text-foreground truncate">{log.action}</p>
                      <p className="text-2xs sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 line-clamp-2">{log.details}</p>
                      <p className="text-2xs text-muted-foreground/60 mt-1">
                        {new Date(log.timestamp).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })} {new Date(log.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} bởi {log.performedBy}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
