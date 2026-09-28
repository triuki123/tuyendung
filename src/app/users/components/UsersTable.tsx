'use client';

import React from 'react';
import { Eye, Edit2, Trash2, Key, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'admin' | 'manager' | 'user';
  company?: string;
  company_id?: string;
  department?: string;
  department_id?: string;
  phone?: string;
  status: 'active' | 'inactive';
  last_login?: string;
  created_at: string;
  updated_at: string;
  tags?: Array<{ id: string; name: string; color: string }>;
}

interface UsersTableProps {
  users: User[];
  selectedIds: Set<string>;
  sortCol: keyof User | null;
  sortDir: 'asc' | 'desc' | null;
  isLoading?: boolean;
  currentUser?: any;
  onSelectAll: (checked: boolean) => void;
  onSelectUser: (userId: string, checked: boolean) => void;
  onSort: (col: keyof User) => void;
  onAudit: (user: User) => void;
  onEdit: (user: User) => void;
  onChangePassword: (user: User) => void;
  onDelete: (user: User) => void;
  isSuperAdmin?: boolean;
}

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  super_admin: { label: 'Super Admin', color: 'text-violet-400', bg: 'bg-violet-500/15 border-violet-500/30' },
  admin: { label: 'Admin', color: 'text-indigo-400', bg: 'bg-indigo-500/15 border-indigo-500/30' },
  manager: { label: 'Quản Lý', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' },
  user: { label: 'Người Dùng', color: 'text-ink-muted', bg: 'bg-slate-500/15 border-slate-500/30' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: 'Đang Hoạt Động', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' },
  inactive: { label: 'Không Hoạt Động', color: 'text-red-400', bg: 'bg-red-500/15 border-red-500/30' },
};

const SORTABLE_COLUMNS: (keyof User)[] = ['name', 'email', 'company', 'department', 'role', 'status'];

function getSortIcon(col: keyof User, currentSort: keyof User | null, sortDir: 'asc' | 'desc' | null) {
  if (col !== currentSort) {
    return <ArrowUpDown size={14} className="text-muted-foreground" />;
  }
  if (sortDir === 'asc') {
    return <ArrowUp size={14} className="text-indigo-400" />;
  }
  return <ArrowDown size={14} className="text-indigo-400" />;
}

function formatDate(dateString?: string): string {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return '—';
  }
}

export function UsersTable({
  users,
  selectedIds,
  sortCol,
  sortDir,
  isLoading = false,
  currentUser,
  onSelectAll,
  onSelectUser,
  onSort,
  onAudit,
  onEdit,
  onChangePassword,
  onDelete,
  isSuperAdmin = false,
}: UsersTableProps) {
  const isAllSelected = users.length > 0 && selectedIds.size === users.length;
  const isIndeterminate = selectedIds.size > 0 && selectedIds.size < users.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Đang tải...</p>
        </div>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 max-w-2xl mx-auto">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Không tìm thấy người dùng nào</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-line rounded-lg">
      <table className="w-full">
        <thead>
          <tr className="border-b border-line bg-white/2">
            {/* Checkbox Column */}
            <th className="w-12 px-4 py-3">
              <input
                type="checkbox"
                checked={isAllSelected}
                ref={(el) => {
                  if (el) {
                    el.indeterminate = isIndeterminate;
                  }
                }}
                onChange={(e) => onSelectAll(e.target.checked)}
                className="w-4 h-4 rounded cursor-pointer accent-indigo-600"
              />
            </th>

            {/* Tên Người Dùng */}
            <th className="px-4 py-3 text-left min-w-[200px]">
              <button
                onClick={() => onSort('name')}
                className="flex items-center gap-2 hover:text-foreground transition-colors text-muted-foreground group"
              >
                <span className="text-2xs sm:text-xs font-600 uppercase">Tên Người Dùng</span>
                {getSortIcon('name', sortCol, sortDir)}
              </button>
            </th>

            {/* Email */}
            <th className="px-4 py-3 text-left hidden sm:table-cell min-w-[200px]">
              <button
                onClick={() => onSort('email')}
                className="flex items-center gap-2 hover:text-foreground transition-colors text-muted-foreground group"
              >
                <span className="text-2xs sm:text-xs font-600 uppercase">Email</span>
                {getSortIcon('email', sortCol, sortDir)}
              </button>
            </th>

            {/* Vai Trò */}
            <th className="px-4 py-3 text-left min-w-[140px]">
              <button
                onClick={() => onSort('role')}
                className="flex items-center gap-2 hover:text-foreground transition-colors text-muted-foreground group"
              >
                <span className="text-2xs sm:text-xs font-600 uppercase">Vai Trò</span>
                {getSortIcon('role', sortCol, sortDir)}
              </button>
            </th>

            {/* Công Ty */}
            <th className="px-4 py-3 text-left hidden lg:table-cell min-w-[140px]">
              <button
                onClick={() => onSort('company')}
                className="flex items-center gap-2 hover:text-foreground transition-colors text-muted-foreground group"
              >
                <span className="text-2xs sm:text-xs font-600 uppercase">Công Ty</span>
                {getSortIcon('company', sortCol, sortDir)}
              </button>
            </th>

            {/* Phòng Ban */}
            <th className="px-4 py-3 text-left hidden xl:table-cell min-w-[140px]">
              <button
                onClick={() => onSort('department')}
                className="flex items-center gap-2 hover:text-foreground transition-colors text-muted-foreground group"
              >
                <span className="text-2xs sm:text-xs font-600 uppercase">Phòng Ban</span>
                {getSortIcon('department', sortCol, sortDir)}
              </button>
            </th>

            {/* Trạng Thái */}
            <th className="px-4 py-3 text-left min-w-[140px]">
              <button
                onClick={() => onSort('status')}
                className="flex items-center gap-2 hover:text-foreground transition-colors text-muted-foreground group"
              >
                <span className="text-2xs sm:text-xs font-600 uppercase">Trạng Thái</span>
                {getSortIcon('status', sortCol, sortDir)}
              </button>
            </th>

            {/* Thao Tác */}
            <th className="px-4 py-3 text-right min-w-[140px]">
              <span className="text-2xs sm:text-xs font-600 uppercase text-muted-foreground">Thao Tác</span>
            </th>
          </tr>
        </thead>

        <tbody>
          {users.map((user) => {
            const isSelected = selectedIds.has(user.id);
            const roleConfig = ROLE_CONFIG[user.role] || ROLE_CONFIG.user;
            const statusConfig = STATUS_CONFIG[user.status] || STATUS_CONFIG.active;
            const isInactive = user.status === 'inactive';

            return (
              <tr
                key={user.id}
                className={`border-b border-line-subtle transition-colors ${
                  isSelected
                    ? 'bg-indigo-500/5 border-b border-indigo-500/20'
                    : isInactive
                      ? 'opacity-60 hover:bg-white/02'
                      : 'hover:bg-white/05'
                }`}
              >
                {/* Checkbox */}
                <td className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onSelectUser(user.id, e.target.checked)}
                    className="w-4 h-4 rounded cursor-pointer accent-indigo-600"
                  />
                </td>

                {/* Name + Role */}
                <td className="px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm sm:text-base font-600 text-foreground truncate">{user.name}</p>
                    <p className="text-2xs sm:text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                </td>

                {/* Email (hidden on mobile) */}
                <td className="px-4 py-3 hidden sm:table-cell">
                  <p className="text-2xs sm:text-xs text-muted-foreground truncate">{user.email}</p>
                </td>

                {/* Role Badge */}
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 sm:px-3 py-1 rounded-full border text-2xs sm:text-xs font-600 ${roleConfig.bg}`}>
                    <span className={roleConfig.color}>{roleConfig.label}</span>
                  </span>
                </td>

                {/* Company (hidden on tablet) */}
                <td className="px-4 py-3 hidden lg:table-cell">
                  <p className="text-2xs sm:text-xs text-muted-foreground truncate">{user.company || '—'}</p>
                </td>

                {/* Department (hidden on small desktop) */}
                <td className="px-4 py-3 hidden xl:table-cell">
                  <p className="text-2xs sm:text-xs text-muted-foreground truncate">{user.department || '—'}</p>
                </td>

                {/* Status Badge */}
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 sm:px-3 py-1 rounded-full border text-2xs sm:text-xs font-600 ${statusConfig.bg}`}>
                    <span className={statusConfig.color}>{statusConfig.label}</span>
                  </span>
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1 sm:gap-2">
                    {/* Audit Logs */}
                    <button
                      onClick={() => onAudit(user)}
                      className="p-1.5 sm:p-2 rounded-lg hover:bg-hover-strong transition-colors text-muted-foreground hover:text-indigo-400 min-h-[40px] min-w-[40px] flex items-center justify-center"
                      title="Xem nhật ký"
                    >
                      <Eye size={16} className="sm:hidden" />
                      <Eye size={14} className="hidden sm:block" />
                    </button>

                    {/* Edit */}
                    <button
                      onClick={() => onEdit(user)}
                      className="p-1.5 sm:p-2 rounded-lg hover:bg-hover-strong transition-colors text-muted-foreground hover:text-amber-400 min-h-[40px] min-w-[40px] flex items-center justify-center"
                      title="Chỉnh sửa"
                    >
                      <Edit2 size={16} className="sm:hidden" />
                      <Edit2 size={14} className="hidden sm:block" />
                    </button>

                    {/* Change Password (Super Admin only) */}
                    {isSuperAdmin && (
                      <button
                        onClick={() => onChangePassword(user)}
                        className="p-1.5 sm:p-2 rounded-lg hover:bg-hover-strong transition-colors text-muted-foreground hover:text-blue-400 min-h-[40px] min-w-[40px] flex items-center justify-center"
                        title="Đổi mật khẩu"
                      >
                        <Key size={16} className="sm:hidden" />
                        <Key size={14} className="hidden sm:block" />
                      </button>
                    )}

                    {/* Delete */}
                    <button
                      onClick={() => onDelete(user)}
                      className="p-1.5 sm:p-2 rounded-lg hover:bg-hover-strong transition-colors text-muted-foreground hover:text-red-400 min-h-[40px] min-w-[40px] flex items-center justify-center"
                      title="Khóa tài khoản"
                    >
                      <Trash2 size={16} className="sm:hidden" />
                      <Trash2 size={14} className="hidden sm:block" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
