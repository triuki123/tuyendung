import {
  MANAGER_CORE_MODULE_IDS,
  SELF_SERVICE_MODULE_IDS,
  UserModulePermissions,
  getEffectiveRolePermissions,
} from '@/lib/modules';
import { canAccess } from '@/lib/permissions';

const NAV_TO_PERMISSION_UNIT: Record<string, string> = {
  'nav-dashboard': 'dashboard',
  'nav-assets': 'asset-management',
  'nav-organization': 'organization',
  'nav-duyet-yeu-cau': 'duyet-yeu-cau',
  'nav-tickets': 'tickets',
  'nav-ticket-config': 'ticket-config',
  'nav-tasks': 'tasks',
  'nav-tasks-analytics': 'tasks-analytics',
  'nav-room-bookings': 'room-bookings',
  'nav-tra-cuu': 'tra-cuu',
  'nav-history': 'history',
  'nav-users': 'users',
  'nav-delete-requests': 'delete-requests',
  'nav-settings': 'settings',
  'nav-hr': 'hr',
  'nav-my-hr': 'my-hr',
  'nav-forms': 'forms',
  'nav-hr-resources': 'hr-resources',
  'nav-recruitment-order': 'recruitment-order',
  'nav-design-requests': 'design-requests',
  'nav-cham-cong': 'cham-cong',
  'nav-email-signature': 'email-signature',
  'nav-qr': 'qr',
  'nav-solace': 'solace',
  'nav-notifications': 'notifications',
  'nav-system-config': 'system-config',
  'nav-kpi': 'kpi',
  'nav-legal': 'legal',
  'nav-warehouse': 'warehouse',
};

/**
 * Module RBAC NGHIÊM NGẶT: vào được hay không CHỈ do dấu tích trong ma trận
 * Phân Quyền quyết định — không có lối tắt theo vai trò.
 *
 * Thiếu mapping trong NAV_TO_PERMISSION_UNIT + lối tắt `super_admin` từng làm
 * Kho / Xưởng chỉ super_admin vào được, người đã được tick vẫn bị chặn ở
 * AppLayout. Đơn vị nào cần "tick mới vào" thì thêm vào đây (và nhớ khai báo
 * mapping nav-* ở trên).
 */
const STRICT_RBAC_UNIT_IDS: readonly string[] = ['warehouse', 'design-requests'];

export function isStrictRbacUnit(unitId: string): boolean {
  return STRICT_RBAC_UNIT_IDS.includes(unitId);
}

export type AppRole = 'super_admin' | 'admin' | 'manager' | 'user';

export function normalizeRole(role: string | null | undefined): AppRole {
  if (role === 'super_admin' || role === 'admin' || role === 'manager') return role;
  return 'user';
}

export function getPermissionUnitForNavigation(moduleId: string): string {
  return NAV_TO_PERMISSION_UNIT[moduleId] || moduleId;
}

export function isRoleCoreModule(role: string, unitId: string): boolean {
  if ((SELF_SERVICE_MODULE_IDS as readonly string[]).includes(unitId)) return true;
  return role === 'manager' &&
    (MANAGER_CORE_MODULE_IDS as readonly string[]).includes(unitId);
}

/**
 * Sidebar/navigation visibility policy.
 * Only Super Admin bypasses RBAC. Every other role sees mandatory core modules
 * plus modules carrying at least one explicit/effective permission.
 *
 * Ngoại lệ: đơn vị trong STRICT_RBAC_UNIT_IDS chỉ đi theo dấu tích Phân Quyền.
 */
export function shouldShowNavigationModule(
  roleValue: string,
  moduleId: string,
  explicitPermissions: UserModulePermissions | undefined | null
): boolean {
  const role = normalizeRole(roleValue);
  const unitId = getPermissionUnitForNavigation(moduleId);

  // Kiểm TRƯỚC lối tắt super_admin — đây là điểm khác biệt của nhóm nghiêm ngặt.
  if (isStrictRbacUnit(unitId)) {
    return canAccess(explicitPermissions ?? undefined, unitId, 'view');
  }

  if (role === 'super_admin') return true;
  if (unitId === 'system-config') return false;
  if (isRoleCoreModule(role, unitId)) return true;

  const effective = getEffectiveRolePermissions(role, explicitPermissions);
  const actions = effective[unitId];
  return Array.isArray(actions) && actions.length > 0;
}
