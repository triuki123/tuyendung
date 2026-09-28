'use client';

import React from 'react';
import { Mail, Phone, Building, Calendar, Edit2, Eye, Trash2, Key } from 'lucide-react';
import CompletenessRing from '@/components/ui/CompletenessRing';
import { computeHrCompleteness } from '@/lib/hrProfileCompleteness';

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
  manager_id?: string;
  manager_name?: string;
  tags?: Array<{ id: string; name: string; color: string }>;
}

interface UsersCardsProps {
  users: User[];
  isLoading?: boolean;
  isSuperAdmin?: boolean;
  onAudit: (user: User) => void;
  onEdit: (user: User) => void;
  onChangePassword: (user: User) => void;
  onDelete: (user: User) => void;
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

function formatDate(dateString?: string): string {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('vi-VN', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    }).format(date);
  } catch {
    return '—';
  }
}

export function UsersCards({
  users,
  isLoading = false,
  isSuperAdmin = false,
  onAudit,
  onEdit,
  onChangePassword,
  onDelete,
}: UsersCardsProps) {
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      {users.map((user) => {
        const roleConfig = ROLE_CONFIG[user.role] || ROLE_CONFIG.user;
        const statusConfig = STATUS_CONFIG[user.status] || STATUS_CONFIG.active;
        const hr = computeHrCompleteness(user as unknown as Record<string, unknown>);

        return (
          <div
            key={user.id}
            className={`bg-slate-900/50 backdrop-blur-sm p-4 sm:p-5 rounded-lg sm:rounded-xl border transition-all ${
              user.status === 'inactive'
                ? 'opacity-60 border-line-subtle hover:border-line'
                : 'border-line hover:border-line-strong hover:bg-slate-900/60'
            }`}
          >
            {/* Header: Name and Status */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-3 mb-3 sm:mb-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm sm:text-base font-600 text-foreground break-words">{user.name}</h3>
                <p className="text-2xs sm:text-xs text-muted-foreground mt-0.5 break-all">{user.email}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <CompletenessRing
                  percent={hr.percent}
                  size={42}
                  title={`Hồ sơ nhân sự: ${hr.filled}/${hr.total} field đã điền (${hr.percent}%)`}
                />
                <span className={`inline-flex items-center px-2 sm:px-3 py-1 rounded-full border text-2xs sm:text-xs font-600 whitespace-nowrap ${statusConfig.bg}`}>
                  <span className={statusConfig.color}>{statusConfig.label}</span>
                </span>
              </div>
            </div>

            {/* Role Badge */}
            <div className="mb-3 sm:mb-4">
              <span className={`inline-flex items-center px-2 sm:px-3 py-1 rounded-full border text-2xs sm:text-xs font-600 ${roleConfig.bg}`}>
                <span className={roleConfig.color}>{roleConfig.label}</span>
              </span>
            </div>

            {/* Divider */}
            <div className="border-t border-line-subtle my-3 sm:my-4" />

            {/* Info Grid */}
            <div className="space-y-2 sm:space-y-2.5 mb-4 sm:mb-5">
              {/* Email */}
              <div className="flex items-center gap-2 min-w-0">
                <Mail size={16} className="text-muted-foreground flex-shrink-0" />
                <span className="text-2xs sm:text-xs text-muted-foreground truncate">{user.email}</span>
              </div>

              {/* Phone */}
              {user.phone && (
                <div className="flex items-center gap-2 min-w-0">
                  <Phone size={16} className="text-muted-foreground flex-shrink-0" />
                  <span className="text-2xs sm:text-xs text-muted-foreground truncate">{user.phone}</span>
                </div>
              )}

              {/* Company */}
              {user.company && (
                <div className="flex items-center gap-2 min-w-0">
                  <Building size={16} className="text-muted-foreground flex-shrink-0" />
                  <span className="text-2xs sm:text-xs text-muted-foreground truncate">{user.company}</span>
                </div>
              )}

              {/* Department */}
              {user.department && (
                <div className="flex items-center gap-2 min-w-0">
                  <Building size={16} className="text-muted-foreground flex-shrink-0" />
                  <span className="text-2xs sm:text-xs text-muted-foreground truncate">{user.department}</span>
                </div>
              )}

              {/* Manager */}
              {user.manager_name && (
                <div className="flex items-center gap-2 min-w-0">
                  <Edit2 size={16} className="text-muted-foreground flex-shrink-0" />
                  <span className="text-2xs sm:text-xs text-muted-foreground truncate">👤 {user.manager_name}</span>
                </div>
              )}

              {/* Last Login */}
              {user.last_login && (
                <div className="flex items-center gap-2 min-w-0">
                  <Calendar size={16} className="text-muted-foreground flex-shrink-0" />
                  <span className="text-2xs sm:text-xs text-muted-foreground">{formatDate(user.last_login)}</span>
                </div>
              )}
            </div>

            {/* Tags */}
            {user.tags && user.tags.length > 0 && (
              <div className="mb-4 sm:mb-5">
                <div className="flex flex-wrap gap-1.5">
                  {user.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-500"
                      style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between gap-1.5 sm:gap-2 pt-3 sm:pt-4 border-t border-line-subtle">
              {/* Audit Logs */}
              <button
                onClick={() => onAudit(user)}
                className="flex-1 p-2 rounded-lg hover:bg-hover-strong transition-colors text-muted-foreground hover:text-indigo-400 text-2xs sm:text-xs font-600 flex items-center justify-center gap-1 min-h-[40px]"
                title="Xem nhật ký"
              >
                <Eye size={16} className="sm:hidden" />
                <Eye size={14} className="hidden sm:block" />
                <span className="hidden sm:inline">Nhật Ký</span>
              </button>

              {/* Edit */}
              <button
                onClick={() => onEdit(user)}
                className="flex-1 p-2 rounded-lg hover:bg-hover-strong transition-colors text-muted-foreground hover:text-amber-400 text-2xs sm:text-xs font-600 flex items-center justify-center gap-1 min-h-[40px]"
                title="Chỉnh sửa"
              >
                <Edit2 size={16} className="sm:hidden" />
                <Edit2 size={14} className="hidden sm:block" />
                <span className="hidden sm:inline">Sửa</span>
              </button>

              {/* Change Password (Super Admin only) */}
              {isSuperAdmin && (
                <button
                  onClick={() => onChangePassword(user)}
                  className="flex-1 p-2 rounded-lg hover:bg-hover-strong transition-colors text-muted-foreground hover:text-blue-400 text-2xs sm:text-xs font-600 flex items-center justify-center gap-1 min-h-[40px]"
                  title="Đổi mật khẩu"
                >
                  <Key size={16} className="sm:hidden" />
                  <Key size={14} className="hidden sm:block" />
                  <span className="hidden sm:inline">MK</span>
                </button>
              )}

              {/* Delete */}
              <button
                onClick={() => onDelete(user)}
                className="flex-1 p-2 rounded-lg hover:bg-hover-strong transition-colors text-muted-foreground hover:text-red-400 text-2xs sm:text-xs font-600 flex items-center justify-center gap-1 min-h-[40px]"
                title="Khóa tài khoản"
              >
                <Trash2 size={16} className="sm:hidden" />
                <Trash2 size={14} className="hidden sm:block" />
                <span className="hidden sm:inline">Khóa</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
