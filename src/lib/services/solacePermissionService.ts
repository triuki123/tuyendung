/**
 * Phân quyền vận hành quán SOLACE (server-side).
 * CHỈ super_admin luôn được phép; admin/manager/user đều cần unit RBAC tương ứng (có kế thừa
 * module mẹ 'solace'). Đọc role + module_permissions trực tiếp từ DB theo userId.
 */
import { query, queryOne } from '@/lib/db';
import { canAccessInherited } from '@/lib/permissions';
import type { PermissionAction, UserModulePermissions } from '@/lib/modules';

export type SolaceUnit =
  | 'solace-pos' | 'solace-menu' | 'solace-inventory' | 'solace-wallet'
  | 'solace-debt' | 'solace-minigame' | 'solace-reports' | 'solace-settings' | 'solace-cash'
  | 'solace-marketing';

/** Kiểm tra user có quyền {action} trên {unit} vận hành quán không. */
export async function canManageSolace(
  userId: string | null | undefined,
  unit: SolaceUnit,
  action: PermissionAction
): Promise<boolean> {
  if (!userId) return false;
  const row = await queryOne<{ role: string; module_permissions: UserModulePermissions | null }>(
    `SELECT role, module_permissions FROM users WHERE id::text = $1`,
    [userId]
  );
  if (!row) return false;
  if (row.role === 'super_admin') return true;
  return canAccessInherited(row.module_permissions ?? undefined, unit, action);
}

/**
 * Danh sách userId ĐƯỢC PHÉP {action} trên {unit} — dùng để CHỌN NGƯỜI NHẬN THÔNG BÁO vận hành.
 *
 * Phải khớp ĐÚNG luật của canManageSolace: chỉ super_admin bypass; còn lại xét RBAC theo unit
 * (có kế thừa module mẹ 'solace'). TUYỆT ĐỐI không fan-out theo role 'admin' — admin không được
 * gán vận hành quán thì không nhận thông báo vận hành.
 */
export async function solaceUnitUserIds(unit: SolaceUnit, action: PermissionAction): Promise<string[]> {
  const rows = await query<{ id: string; role: string; module_permissions: UserModulePermissions | null }>(
    `SELECT id::text AS id, role, module_permissions
       FROM users
      WHERE status = 'active' AND (role = 'super_admin' OR module_permissions IS NOT NULL)`
  );
  return rows
    .filter((r) => r.role === 'super_admin' || canAccessInherited(r.module_permissions ?? undefined, unit, action))
    .map((r) => r.id);
}

/** Kiểm tra user có phải super_admin không (dùng cho các thao tác chỉ super_admin: cấu hình quán). */
export async function isSolaceSuperAdmin(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const row = await queryOne<{ role: string }>(
    `SELECT role FROM users WHERE id::text = $1`,
    [userId]
  );
  return row?.role === 'super_admin';
}
