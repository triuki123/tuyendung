'use client';

import React, { useState } from 'react';
import { Download, Lock, Shield, CheckCircle, Tag, Building, Briefcase } from 'lucide-react';

interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  last_login?: string;
  role: 'super_admin' | 'admin' | 'manager' | 'user';
  company?: string;
  company_id?: string;
  department?: string;
  department_id?: string;
  status: 'active' | 'inactive';
  job_title_id?: string;
  tags?: Array<{ id: string; name: string }>;
}

interface Company {
  id: string;
  name: string;
}

interface Department {
  id: string;
  name: string;
}

interface JobTitle {
  id: string;
  title: string;
  is_active: boolean;
}

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface UsersBulkActionsToolbarProps {
  selectedCount: number;
  selectedUsers: User[];
  companies: Company[];
  departments: Department[];
  jobTitles: JobTitle[];
  allTags: Tag[];
  isLoading?: boolean;
  isSuperAdmin?: boolean;
  onChangeRole: (userIds: string[], role: 'super_admin' | 'admin' | 'manager' | 'user') => Promise<void>;
  onChangeStatus: (userIds: string[], status: 'active' | 'inactive') => Promise<void>;
  onAssignCompany: (userIds: string[], companyId: string) => Promise<void>;
  onAssignDepartment: (userIds: string[], departmentId: string) => Promise<void>;
  onAssignJobTitle: (userIds: string[], jobTitleId: string) => Promise<void>;
  onAssignTags: (userIds: string[], tagIds: string[]) => Promise<void>;
  onDelete: (userIds: string[]) => Promise<void>;
  onClose: () => void;
}

export function UsersBulkActionsToolbar({
  selectedCount,
  selectedUsers,
  companies,
  departments,
  jobTitles,
  allTags,
  isLoading = false,
  isSuperAdmin = false,
  onChangeRole,
  onChangeStatus,
  onAssignCompany,
  onAssignDepartment,
  onAssignJobTitle,
  onAssignTags,
  onDelete,
  onClose,
}: UsersBulkActionsToolbarProps) {
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const userIds = selectedUsers.map((u) => u.id);

  const handleAction = async (action: () => Promise<void>, actionKey: string) => {
    setIsProcessing({ ...isProcessing, [actionKey]: true });
    try {
      await action();
      onClose();
    } finally {
      setIsProcessing({ ...isProcessing, [actionKey]: false });
      setActiveDropdown(null);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Tên', 'Email', 'Điện thoại', 'Vai Trò', 'Công Ty', 'Phòng Ban', 'Chức Danh', 'Trạng Thái', 'Lần Đăng Nhập Cuối'];
    const rows = selectedUsers.map((user) => [
      user.name,
      user.email,
      user.phone || '',
      getRoleLabel(user.role),
      user.company || '',
      user.department || '',
      user.job_title_id || '',
      user.status === 'active' ? 'Đang Hoạt Động' : 'Không Hoạt Động',
      user.last_login || '',
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `users_export_${new Date().getTime()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      super_admin: 'Super Admin',
      admin: 'Admin',
      user: 'Người Dùng',
    };
    return labels[role] || role;
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900 via-slate-900/95 to-slate-900/90 backdrop-blur-sm border-t border-line p-3 sm:p-4 z-40"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
      <div className="max-w-7xl mx-auto">
        {/* Header with selection count */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4">
          <div className="flex items-center gap-3">
            <span className="text-sm sm:text-base font-600 text-foreground">
              ✓ {selectedCount} người dùng được chọn
            </span>
          </div>
        </div>

        {/* Actions Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-2">
          {/* Change Role */}
          {isSuperAdmin && (
            <div className="relative">
              <button
                onClick={() => setActiveDropdown(activeDropdown === 'role' ? null : 'role')}
                disabled={isProcessing['role']}
                className="w-full flex items-center justify-center gap-1.5 h-9 sm:h-10 px-2 sm:px-3 rounded-lg text-2xs sm:text-xs font-600 bg-slate-800/50 border border-line hover:border-line-strong text-foreground hover:bg-slate-800/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px]"
              >
                <Shield size={14} className="flex-shrink-0" />
                <span className="hidden sm:inline">Vai Trò</span>
                <span className="sm:hidden">Vai Trò</span>
              </button>

              {/* Dropdown Menu */}
              {activeDropdown === 'role' && (
                <div className="absolute bottom-full left-0 mb-2 bg-slate-800 border border-line-strong rounded-lg overflow-hidden shadow-xl z-50 w-40">
                  {[
                    { value: 'super_admin', label: 'Super Admin' },
                    { value: 'admin', label: 'Admin' },
                    { value: 'manager', label: 'Quản Lý' },
                    { value: 'user', label: 'Người Dùng' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() =>
                        handleAction(
                          () => onChangeRole(userIds, option.value as 'super_admin' | 'admin' | 'manager' | 'user'),
                          'role'
                        )
                      }
                      disabled={isProcessing['role']}
                      className="w-full text-left px-3 py-2 text-2xs sm:text-xs text-foreground hover:bg-slate-700 transition-colors border-b border-line-subtle last:border-b-0 disabled:opacity-50"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Change Status */}
          <div className="relative">
            <button
              onClick={() => setActiveDropdown(activeDropdown === 'status' ? null : 'status')}
              disabled={isProcessing['status']}
              className="w-full flex items-center justify-center gap-1.5 h-9 sm:h-10 px-2 sm:px-3 rounded-lg text-2xs sm:text-xs font-600 bg-slate-800/50 border border-line hover:border-line-strong text-foreground hover:bg-slate-800/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px]"
            >
              <CheckCircle size={14} className="flex-shrink-0" />
              <span className="hidden sm:inline">Trạng Thái</span>
              <span className="sm:hidden">Trạng Thái</span>
            </button>

            {activeDropdown === 'status' && (
              <div className="absolute bottom-full left-0 mb-2 bg-slate-800 border border-line-strong rounded-lg overflow-hidden shadow-xl z-50 w-44">
                {[
                  { value: 'active', label: 'Kích Hoạt' },
                  { value: 'inactive', label: 'Khóa Tài Khoản' },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() =>
                      handleAction(
                        () => onChangeStatus(userIds, option.value as 'active' | 'inactive'),
                        'status'
                      )
                    }
                    disabled={isProcessing['status']}
                    className="w-full text-left px-3 py-2 text-2xs sm:text-xs text-foreground hover:bg-slate-700 transition-colors border-b border-line-subtle last:border-b-0 disabled:opacity-50"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Assign Company */}
          <div className="relative">
            <button
              onClick={() => setActiveDropdown(activeDropdown === 'company' ? null : 'company')}
              disabled={isProcessing['company']}
              className="w-full flex items-center justify-center gap-1.5 h-9 sm:h-10 px-2 sm:px-3 rounded-lg text-2xs sm:text-xs font-600 bg-slate-800/50 border border-line hover:border-line-strong text-foreground hover:bg-slate-800/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px]"
            >
              <Building size={14} className="flex-shrink-0" />
              <span className="hidden sm:inline">Công Ty</span>
              <span className="sm:hidden">C. Ty</span>
            </button>

            {activeDropdown === 'company' && (
              <div className="absolute bottom-full left-0 mb-2 bg-slate-800 border border-line-strong rounded-lg overflow-hidden shadow-xl z-50 w-48 max-h-56 overflow-y-auto">
                {companies.map((company) => (
                  <button
                    key={company.id}
                    onClick={() =>
                      handleAction(() => onAssignCompany(userIds, company.id), 'company')
                    }
                    disabled={isProcessing['company']}
                    className="w-full text-left px-3 py-2 text-2xs sm:text-xs text-foreground hover:bg-slate-700 transition-colors border-b border-line-subtle last:border-b-0 disabled:opacity-50 truncate"
                  >
                    {company.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Assign Department */}
          <div className="relative">
            <button
              onClick={() => setActiveDropdown(activeDropdown === 'dept' ? null : 'dept')}
              disabled={isProcessing['dept']}
              className="w-full flex items-center justify-center gap-1.5 h-9 sm:h-10 px-2 sm:px-3 rounded-lg text-2xs sm:text-xs font-600 bg-slate-800/50 border border-line hover:border-line-strong text-foreground hover:bg-slate-800/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px]"
            >
              <Briefcase size={14} className="flex-shrink-0" />
              <span className="hidden sm:inline">Phòng Ban</span>
              <span className="sm:hidden">P.B</span>
            </button>

            {activeDropdown === 'dept' && (
              <div className="absolute bottom-full left-0 mb-2 bg-slate-800 border border-line-strong rounded-lg overflow-hidden shadow-xl z-50 w-48 max-h-56 overflow-y-auto">
                {departments.map((dept) => (
                  <button
                    key={dept.id}
                    onClick={() => handleAction(() => onAssignDepartment(userIds, dept.id), 'dept')}
                    disabled={isProcessing['dept']}
                    className="w-full text-left px-3 py-2 text-2xs sm:text-xs text-foreground hover:bg-slate-700 transition-colors border-b border-line-subtle last:border-b-0 disabled:opacity-50 truncate"
                  >
                    {dept.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Assign Job Title */}
          <div className="relative">
            <button
              onClick={() => setActiveDropdown(activeDropdown === 'jobtitle' ? null : 'jobtitle')}
              disabled={isProcessing['jobtitle']}
              className="w-full flex items-center justify-center gap-1.5 h-9 sm:h-10 px-2 sm:px-3 rounded-lg text-2xs sm:text-xs font-600 bg-slate-800/50 border border-line hover:border-line-strong text-foreground hover:bg-slate-800/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px]"
            >
              <Briefcase size={14} className="flex-shrink-0" />
              <span className="hidden sm:inline">Chức Danh</span>
              <span className="sm:hidden">C.Danh</span>
            </button>

            {activeDropdown === 'jobtitle' && (
              <div className="absolute bottom-full left-0 mb-2 bg-slate-800 border border-line-strong rounded-lg overflow-hidden shadow-xl z-50 w-48 max-h-56 overflow-y-auto">
                {jobTitles
                  .filter((jt) => jt.is_active)
                  .map((jt) => (
                    <button
                      key={jt.id}
                      onClick={() => handleAction(() => onAssignJobTitle(userIds, jt.id), 'jobtitle')}
                      disabled={isProcessing['jobtitle']}
                      className="w-full text-left px-3 py-2 text-2xs sm:text-xs text-foreground hover:bg-slate-700 transition-colors border-b border-line-subtle last:border-b-0 disabled:opacity-50 truncate"
                    >
                      {jt.title}
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Assign Tags */}
          <div className="relative">
            <button
              onClick={() => setActiveDropdown(activeDropdown === 'tags' ? null : 'tags')}
              disabled={isProcessing['tags']}
              className="w-full flex items-center justify-center gap-1.5 h-9 sm:h-10 px-2 sm:px-3 rounded-lg text-2xs sm:text-xs font-600 bg-slate-800/50 border border-line hover:border-line-strong text-foreground hover:bg-slate-800/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px]"
            >
              <Tag size={14} className="flex-shrink-0" />
              <span className="hidden sm:inline">Nhãn</span>
              <span className="sm:hidden">Nhãn</span>
            </button>

            {activeDropdown === 'tags' && (
              <div className="absolute bottom-full left-0 mb-2 bg-slate-800 border border-line-strong rounded-lg p-2 shadow-xl z-50 w-56 max-h-64 overflow-y-auto">
                <div className="space-y-1 mb-3">
                  {allTags.map((tag) => (
                    <label key={tag.id} className="flex items-center gap-2 cursor-pointer group p-1 rounded hover:bg-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedTags.includes(tag.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTags([...selectedTags, tag.id]);
                          } else {
                            setSelectedTags(selectedTags.filter((id) => id !== tag.id));
                          }
                        }}
                        className="w-4 h-4 rounded cursor-pointer accent-indigo-600"
                      />
                      <span className="text-2xs text-foreground">{tag.name}</span>
                    </label>
                  ))}
                </div>
                <button
                  onClick={() => {
                    handleAction(() => onAssignTags(userIds, selectedTags), 'tags');
                    setSelectedTags([]);
                  }}
                  disabled={isProcessing['tags'] || selectedTags.length === 0}
                  className="w-full py-1.5 px-2 bg-indigo-600 hover:bg-indigo-700 text-foreground text-2xs font-600 rounded transition-colors disabled:opacity-50"
                >
                  Áp Dụng
                </button>
              </div>
            )}
          </div>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            className="w-full flex items-center justify-center gap-1.5 h-9 sm:h-10 px-2 sm:px-3 rounded-lg text-2xs sm:text-xs font-600 bg-slate-800/50 border border-line hover:border-line-strong text-foreground hover:bg-slate-800/80 transition-colors min-h-[40px]"
            title="Xuất CSV"
          >
            <Download size={14} className="flex-shrink-0" />
            <span className="hidden sm:inline">Xuất</span>
          </button>

          {/* Delete/Lock */}
          <div className="relative">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center justify-center gap-1.5 h-9 sm:h-10 px-2 sm:px-3 rounded-lg text-2xs sm:text-xs font-600 bg-red-500/15 border border-red-500/30 hover:border-red-500/50 text-red-400 hover:bg-red-500/20 transition-colors min-h-[40px]"
            >
              <Lock size={14} className="flex-shrink-0" />
              <span className="hidden sm:inline">Khóa</span>
            </button>

            {/* Delete Confirmation */}
            {showDeleteConfirm && (
              <div className="absolute bottom-full left-0 mb-2 bg-slate-800 border border-red-500/30 rounded-lg p-3 shadow-xl z-50 w-56">
                <p className="text-2xs text-foreground mb-3">
                  Khóa {selectedCount} tài khoản? Những người dùng này sẽ không thể đăng nhập.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 py-1.5 px-2 bg-slate-700 hover:bg-slate-600 text-foreground text-2xs font-600 rounded transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={() => {
                      handleAction(() => onDelete(userIds), 'delete');
                      setShowDeleteConfirm(false);
                    }}
                    disabled={isProcessing['delete']}
                    className="flex-1 py-1.5 px-2 bg-red-600 hover:bg-red-700 text-white text-2xs font-600 rounded transition-colors disabled:opacity-50"
                  >
                    Khóa
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
