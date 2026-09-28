'use client';

import { useEffect, useState } from 'react';
import { getCurrentUser } from '@/lib/authStore';
import { canAccessInherited } from '@/lib/permissions';
import {
  getEffectiveRolePermissions,
  PermissionAction,
  UserModulePermissions,
} from '@/lib/modules';
import { isStrictRbacUnit, normalizeRole } from '@/lib/rolePolicy';

/**
 * Kiểm tra quyền phía client cho 1 đơn vị (module mẹ hoặc con), có kế thừa quyền mẹ.
 * Chỉ super_admin luôn được phép. Đọc quyền từ localStorage (assetflow_auth).
 * Module con chưa cấu hình riêng → fallback quyền module mẹ (không khóa nhầm).
 */
export function clientCanAccess(unitId: string, action: PermissionAction = 'view'): boolean {
  const u = getCurrentUser() as { role?: string; module_permissions?: UserModulePermissions } | null;
  if (!u) return false;
  if (isStrictRbacUnit(unitId)) {
    return canAccessInherited(u.module_permissions ?? {}, unitId, action);
  }
  if (u.role === 'super_admin') return true;
  const role = normalizeRole(u.role);
  const perms = getEffectiveRolePermissions(role, u.module_permissions);
  return canAccessInherited(perms, unitId, action);
}

/**
 * Hook an toàn với SSR: chỉ đọc localStorage sau khi mount (tránh hydration mismatch).
 * `ready=false` trong lần render đầu, sau đó cập nhật `allowed` thật.
 */
export function useClientCanAccess(unitId: string, action: PermissionAction = 'view') {
  const [state, setState] = useState<{ ready: boolean; allowed: boolean }>({ ready: false, allowed: false });
  useEffect(() => {
    setState({ ready: true, allowed: clientCanAccess(unitId, action) });
  }, [unitId, action]);
  return state;
}
