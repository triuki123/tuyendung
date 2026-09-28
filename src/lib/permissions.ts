import { PermissionAction, UserModulePermissions, getParentModuleId } from '@/lib/modules';

/**
 * Check if a user has a specific permission for a module
 */
export function canAccess(
  permissions: UserModulePermissions | undefined,
  moduleId: string,
  action: PermissionAction
): boolean {
  if (!permissions) return false;
  const modulePermissions = permissions[moduleId];
  if (!modulePermissions || !Array.isArray(modulePermissions)) return false;
  return modulePermissions.includes(action);
}

/**
 * Kiểm tra quyền có KẾ THỪA module mẹ cho module con.
 * - Nếu module con ĐÃ được cấu hình riêng (key tồn tại trong permissions) → dùng đúng quyền con đó.
 * - Nếu module con CHƯA được cấu hình (key chưa có) → fallback về quyền module mẹ.
 * - Với module mẹ (không có cha) → hành xử như canAccess thường.
 * Mục đích: không khóa nhầm người dùng cũ khi mới thêm module con vào hệ thống.
 */
export function canAccessInherited(
  permissions: UserModulePermissions | undefined,
  unitId: string,
  action: PermissionAction
): boolean {
  if (!permissions) return false;
  // Đã cấu hình riêng cho đơn vị này (kể cả rỗng = cố ý bỏ) → tôn trọng cấu hình
  if (permissions[unitId] !== undefined) {
    return canAccess(permissions, unitId, action);
  }
  // Chưa cấu hình → nếu là module con thì kế thừa quyền mẹ
  const parentId = getParentModuleId(unitId);
  if (parentId) return canAccess(permissions, parentId, action);
  return false;
}

/**
 * Check if a user has any permission for a module
 */
export function hasModuleAccess(
  permissions: UserModulePermissions | undefined,
  moduleId: string
): boolean {
  if (!permissions) return false;
  const modulePermissions = permissions[moduleId];
  return Array.isArray(modulePermissions) && modulePermissions.length > 0;
}

/**
 * Get all permissions for a specific module
 */
export function getModulePermissions(
  permissions: UserModulePermissions | undefined,
  moduleId: string
): PermissionAction[] {
  if (!permissions) return [];
  return permissions[moduleId] || [];
}

/**
 * Check if user has all specified actions for a module
 */
export function hasAllActions(
  permissions: UserModulePermissions | undefined,
  moduleId: string,
  actions: PermissionAction[]
): boolean {
  if (!permissions) return false;
  const modulePermissions = permissions[moduleId];
  if (!modulePermissions) return false;
  return actions.every(action => modulePermissions.includes(action));
}

/**
 * Check if user has any of the specified actions for a module
 */
export function hasAnyAction(
  permissions: UserModulePermissions | undefined,
  moduleId: string,
  actions: PermissionAction[]
): boolean {
  if (!permissions) return false;
  const modulePermissions = permissions[moduleId];
  if (!modulePermissions) return false;
  return actions.some(action => modulePermissions.includes(action));
}

/**
 * Get list of modules user has access to
 */
export function getAccessibleModules(permissions: UserModulePermissions | undefined): string[] {
  if (!permissions) return [];
  return Object.keys(permissions).filter(moduleId => {
    const perms = permissions[moduleId];
    return Array.isArray(perms) && perms.length > 0;
  });
}

/**
 * Count total permissions across all modules
 */
export function countPermissions(permissions: UserModulePermissions | undefined): number {
  if (!permissions) return 0;
  return Object.values(permissions).reduce((total, perms) => {
    return total + (Array.isArray(perms) ? perms.length : 0);
  }, 0);
}

/**
 * Count modules with at least one permission
 */
export function countAccessibleModules(permissions: UserModulePermissions | undefined): number {
  return getAccessibleModules(permissions).length;
}

/**
 * ========== TẦNG 1: MODULE VISIBILITY ==========
 * Check if user should see a module in sidebar/navigation
 * Option A: module_permissions priority, fall back to role
 */
export function shouldShowModule(
  role: string,
  moduleId: string,
  userModulePermissions: UserModulePermissions | undefined | null
): boolean {
  // Map of module IDs from NAV_ITEMS to module names in module_permissions
  const moduleMap: Record<string, string> = {
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
    'nav-the-dien-tu': 'ho-so-nang-luc',
    'nav-email-center': 'email-center',
    'nav-solace': 'solace',
    'nav-warehouse': 'warehouse',
    'nav-system-config': 'system-config',
    'nav-expense': 'expense',
    'nav-kpi': 'kpi',
  };

  // Convert nav-* ID to actual module name
  const actualModuleId = moduleMap[moduleId] || moduleId;

  // Hồ Sơ Năng Lực (biên soạn có phân quyền): super_admin luôn thấy; người khác cần được cấp quyền.
  if (actualModuleId === 'ho-so-nang-luc') {
    if (role === 'super_admin') return true;
    const perms = userModulePermissions?.['ho-so-nang-luc'];
    return Array.isArray(perms) && perms.length > 0;
  }

  // Trung Tâm Email: super_admin luôn thấy; user khác cần ít nhất 1 tab được cấp.
  if (actualModuleId === 'email-center') {
    if (role === 'super_admin') return true;
    const perms = userModulePermissions?.['email-center'];
    return Array.isArray(perms) && perms.length > 0;
  }

  // Quán Cà Phê Solace: phần khách (đặt món, ví, minigame) mở cho MỌI user đã
  // đăng nhập; khu vận hành bên trong tự kiểm RBAC theo các unit con solace-*.
  if (actualModuleId === 'solace') return true;

  // Kho / Xưởng: RBAC NGHIÊM NGẶT — KHÔNG bypass super_admin, không tick
  // quyền Xem là ẩn (đồng bộ với Sidebar desktop).
  if (actualModuleId === 'warehouse') {
    return canAccess(userModulePermissions ?? undefined, 'warehouse', 'view');
  }

  // Cấu Hình Hệ Thống: CHỈ super_admin (không theo module_permissions).
  if (actualModuleId === 'system-config') return role === 'super_admin';

  // Module Chữ Ký Email (tự phục vụ) luôn hiển thị với mọi user đã đăng nhập
  if (actualModuleId === 'email-signature') return true;

  // Tiện ích Tạo Mã QR (rút gọn link) — mọi user đã đăng nhập đều dùng được
  if (actualModuleId === 'qr') return true;

  // Cổng đặt Yêu Cầu Tuyển Dụng (mục Hoạt Động): super_admin/admin/manager mặc định thấy;
  // hoặc được cấp quyền 'recruitment-order' trong Phân Quyền.
  if (actualModuleId === 'recruitment-order') {
    if (role === 'super_admin' || role === 'admin' || role === 'manager') return true;
    const perms = userModulePermissions?.['recruitment-order'];
    return Array.isArray(perms) && perms.length > 0;
  }

  // Module Tra Cứu luôn hiển thị với tất cả user đã đăng nhập
  if (actualModuleId === 'tra-cuu') return true;

  // Module Chấm Công luôn hiển thị với tất cả user đã đăng nhập
  if (actualModuleId === 'cham-cong') return true;

  // "Hợp đồng & Hồ sơ" (tự phục vụ) luôn hiển thị với mọi user đã đăng nhập
  if (actualModuleId === 'my-hr') return true;

  // Module Nhân Sự (C&B): admin/super_admin luôn thấy; người khác cần được cấp
  // quyền 'hr' trong module_permissions (xử lý ở nhánh bên dưới).
  if (actualModuleId === 'hr' && (role === 'super_admin' || role === 'admin')) return true;

  // Biểu Mẫu & Nguồn Nhân Lực: admin/super_admin luôn thấy (user cũ chưa có
  // key 'forms'/'hr-resources' trong module_permissions nên không thể dựa vào đó).
  if (
    (actualModuleId === 'forms' || actualModuleId === 'hr-resources') &&
    (role === 'super_admin' || role === 'admin')
  ) {
    return true;
  }

  // Module Duyệt Yêu Cầu: admin/super_admin/manager đều thấy.
  // Manager luôn có thể xét duyệt Bù Công & Tăng Ca.
  // Nút Duyệt Bảng Công chỉ hiển thị trong tab nếu có quyền attendance.approve.
  if (actualModuleId === 'duyet-yeu-cau') {
    if (role === 'super_admin' || role === 'admin' || role === 'manager') return true;
    // Cộng thêm: user được cấp quyền 'duyet-yeu-cau' trong Phân Quyền cũng thấy
    const perms = userModulePermissions?.['duyet-yeu-cau'];
    return Array.isArray(perms) && perms.length > 0;
  }

  // If user has module_permissions defined → Use it (Option A)
  if (userModulePermissions && Object.keys(userModulePermissions).length > 0) {
    // Check if module has permissions in module_permissions
    const hasModulePerms = userModulePermissions[actualModuleId];
    return hasModulePerms !== undefined && Array.isArray(hasModulePerms) && hasModulePerms.length > 0;
  }

  // Fall back to role-based defaults
  return isModuleVisibleByRole(role, moduleId);
}

/**
 * Check module visibility by role (fallback when no module_permissions)
 */
function isModuleVisibleByRole(role: string, moduleId: string): boolean {
  // Map of module IDs from NAV_ITEMS to module names
  const moduleMap: Record<string, string> = {
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
  };

  const actualModuleId = moduleMap[moduleId] || moduleId;

  // Module Tra Cứu luôn hiển thị với tất cả user đã đăng nhập
  if (actualModuleId === 'tra-cuu') return true;

  // "Hợp đồng & Hồ sơ" (tự phục vụ) luôn hiển thị với mọi user đã đăng nhập
  if (actualModuleId === 'my-hr') return true;

  // Quán Solace (phần khách) luôn hiển thị với mọi user đã đăng nhập
  if (actualModuleId === 'solace') return true;

  // Super Admin sees everything
  if (role === 'super_admin') return true;

  // Admin sees most, except settings restrictions
  if (role === 'admin') {
    return actualModuleId !== 'delete-requests';
  }

  // Manager sees most modules
  if (role === 'manager') {
    return ['dashboard', 'asset-management', 'tasks', 'tickets', 'organization', 'history', 'settings', 'tra-cuu'].includes(actualModuleId);
  }

  // User sees limited modules
  if (role === 'user') {
    return ['tickets', 'room-bookings', 'settings', 'tra-cuu'].includes(actualModuleId);
  }

  return false;
}

/**
 * ========== TẦNG 2: DATA ACCESS LEVEL ==========
 * Determine what level of data access user has
 * Super Admin: thấy tất cả data toàn hệ thống
 * Admin: thấy data của company mà họ được gán
 * User: thấy chỉ data của chính họ
 */
export type DataAccessLevel = 'super_admin' | 'admin' | 'manager' | 'user';

export function getDataAccessLevel(role: string, hasModulePermissions: boolean): DataAccessLevel {
  // Super Admin: Always full access
  if (role === 'super_admin') return 'super_admin';

  // Admin: Có company_id filtering
  if (role === 'admin') return 'admin';

  // Manager: Có company_id filtering (like admin)
  if (role === 'manager') return 'manager';

  // User: Chỉ thấy data của chính họ
  return 'user';
}

/**
 * Generate where clause filter for data queries based on access level
 * Usage: Thêm vào database query tùy theo loại data
 */
export interface DataFilter {
  level: DataAccessLevel;
  userId?: string;
  companyId?: string;
}

export function buildDataFilter(
  role: string,
  userId: string,
  userCompanyId: string | null
): DataFilter {
  const level = getDataAccessLevel(role, false);

  return {
    level,
    userId,
    companyId: userCompanyId || undefined,
  };
}
