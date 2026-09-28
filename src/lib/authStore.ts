'use client';

import { MockUser } from './mockData';
import { getEffectiveRolePermissions, type UserModulePermissions } from './modules';
import { normalizeRole } from './rolePolicy';

const AUTH_KEY = 'assetflow_auth';

export function logout(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem('currentUser');
    // Đa Công Ty: xóa công ty đang chọn để không tồn dư sang phiên/người dùng khác.
    localStorage.removeItem('active_company_id');
  }
}

export function getCurrentUser(): MockUser | null {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(AUTH_KEY);
    if (stored) {
      try {
        const user = JSON.parse(stored) as MockUser & {
          module_permissions?: UserModulePermissions;
        };
        const role = normalizeRole(user.role);
        return {
          ...user,
          role,
          module_permissions: getEffectiveRolePermissions(role, user.module_permissions),
        } as MockUser;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function isSuperAdmin(user: MockUser | null): boolean {
  return user?.role === 'super_admin';
}

export function isAdmin(user: MockUser | null): boolean {
  return user?.role === 'admin' || user?.role === 'super_admin';
}

export function isManager(user: MockUser | null): boolean {
  return user?.role === 'manager';
}

export function isUser(user: MockUser | null): boolean {
  return user?.role === 'user';
}

export function canDeleteAsset(user: MockUser | null): boolean {
  return user?.role === 'super_admin';
}

export function canManageAssets(user: MockUser | null): boolean {
  return user?.role === 'super_admin' || user?.role === 'admin';
}

export function canManageUsers(user: MockUser | null): boolean {
  return user?.role === 'super_admin' || user?.role === 'admin';
}

export function canViewDashboard(user: MockUser | null): boolean {
  return user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'manager';
}
