import { NextRequest, NextResponse } from 'next/server';
import {
  getEffectiveRolePermissions,
  PermissionAction,
  UserModulePermissions,
} from '@/lib/modules';
import { canAccess, canAccessInherited } from '@/lib/permissions';
import { isStrictRbacUnit, normalizeRole } from '@/lib/rolePolicy';
import { queryOne } from '@/lib/db';

export interface ProtectedRouteConfig {
  moduleId: string;
  requiredAction: PermissionAction;
}

/**
 * Được phép ghi cấu trúc tổ chức: super_admin TOÀN CỤC (đọc users.role — toàn quyền kể cả khi
 * đứng ở công ty con vai hiệu lực bị hạ), HOẶC có organization:edit theo vai hiệu lực.
 * Tránh 403 câm cho super_admin ở công ty con (xem memory superadmin-global-vs-effective-write-apis).
 */
export async function canEditOrgStructure(request: NextRequest): Promise<boolean> {
  const uid = request.headers.get('x-current-user-id');
  if (uid) {
    const row = await queryOne<{ role: string }>(`SELECT role FROM users WHERE id = $1`, [uid]);
    if (row?.role === 'super_admin') return true;
  }
  return checkPermission(request, { moduleId: 'organization', requiredAction: 'edit' });
}

/**
 * Middleware function to check if user has required permission for API route
 * Usage: const isAllowed = await checkPermission(req, { moduleId: 'users', requiredAction: 'edit' });
 */
export async function checkPermission(
  req: NextRequest,
  config: ProtectedRouteConfig
): Promise<boolean> {
  try {
    const role = req.headers.get('x-current-user-role') || '';
    if (role === 'super_admin') return true;
    const userPermissions = req.headers.get('x-user-permissions');
    const explicit: UserModulePermissions = userPermissions ? JSON.parse(userPermissions) : {};
    const permissions = getEffectiveRolePermissions(normalizeRole(role), explicit);
    return canAccess(permissions, config.moduleId, config.requiredAction);
  } catch (error) {
    console.error('Permission check error:', error);
    return false;
  }
}

/**
 * Check quyền theo module. Chỉ super_admin bypass; mọi role khác cần action
 * tương ứng trong quyền hiệu lực đã được middleware xác thực.
 */
export function checkModuleAccess(
  req: NextRequest,
  moduleId: string,
  action: PermissionAction
): boolean {
  const role = req.headers.get('x-current-user-role') || '';
  if (role === 'super_admin') return true;
  try {
    const userPermissions = req.headers.get('x-user-permissions');
    const explicit: UserModulePermissions = userPermissions ? JSON.parse(userPermissions) : {};
    const permissions = getEffectiveRolePermissions(normalizeRole(role), explicit);
    return canAccess(permissions, moduleId, action);
  } catch {
    return false;
  }
}

/**
 * Check quyền theo ĐƠN VỊ (module mẹ hoặc con) — có kế thừa quyền mẹ.
 * Chỉ super_admin bypass. Module con chưa cấu hình riêng → fallback quyền mẹ.
 * Dùng cho các route con (vd 'hr-offboarding', 'cham-cong-machines').
 */
export function checkUnitAccess(
  req: NextRequest,
  unitId: string,
  action: PermissionAction
): boolean {
  const role = req.headers.get('x-current-user-role') || '';
  try {
    const userPermissions = req.headers.get('x-user-permissions');
    const explicit: UserModulePermissions = userPermissions ? JSON.parse(userPermissions) : {};
    if (isStrictRbacUnit(unitId)) {
      return canAccessInherited(explicit, unitId, action);
    }
    if (role === 'super_admin') return true;
    const permissions = getEffectiveRolePermissions(normalizeRole(role), explicit);
    return canAccessInherited(permissions, unitId, action);
  } catch {
    return false;
  }
}

/**
 * Wrapper function to protect an API route handler
 */
export function withPermissionCheck<T extends (...args: any[]) => Promise<Response>>(
  handler: T,
  config: ProtectedRouteConfig
): T {
  return (async (req: NextRequest, ...args: any[]) => {
    const isAllowed = await checkPermission(req, config);

    if (!isAllowed) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    return handler(req, ...args);
  }) as T;
}

/**
 * Check multiple permissions (AND logic - all must be true)
 */
export async function checkAllPermissions(
  req: NextRequest,
  configs: ProtectedRouteConfig[]
): Promise<boolean> {
  for (const config of configs) {
    if (!(await checkPermission(req, config))) {
      return false;
    }
  }
  return true;
}

/**
 * Check multiple permissions (OR logic - any can be true)
 */
export async function checkAnyPermission(
  req: NextRequest,
  configs: ProtectedRouteConfig[]
): Promise<boolean> {
  for (const config of configs) {
    if (await checkPermission(req, config)) {
      return true;
    }
  }
  return false;
}
