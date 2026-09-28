/**
 * Phân quyền module Nhân Sự (hợp đồng & hồ sơ).
 *
 * Quy tắc XEM một hợp đồng/hồ sơ của nhân viên X:
 *  (a) Có quyền module 'hr' (action 'view') — gồm admin/super_admin;
 *  (b) Là quản lý (theo cây manager_id) của X;
 *  (c) Chính chủ (X === currentUser).
 * Quy tắc TẠO/SỬA/XÓA: có quyền module 'hr' tương ứng (create/edit/delete),
 *  admin/super_admin mặc định có (trừ delete chỉ super_admin/admin).
 */
import { queryOne } from '@/lib/db';
import { getOrgSubtreeUserIds } from './attendanceService';
import { getCompanyMemberUserIds, getEffectiveContext } from './userCompanyService';

type HrAction = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export';

interface HrUser {
  id: string;
  role: string;
  module_permissions: Record<string, string[]> | null;
}

export async function getHrUser(userId: string): Promise<HrUser | null> {
  return queryOne<HrUser>(
    `SELECT id::text AS id, role, module_permissions
       FROM users WHERE id::text = $1`,
    [userId.toLowerCase()]
  );
}

/** Có quyền quản trị module 'hr' với action cụ thể không. */
export function hasHrAction(u: HrUser | null, action: HrAction): boolean {
  if (!u) return false;
  if (u.role === 'super_admin' || u.role === 'admin') return true;
  const perms = u.module_permissions?.['hr'];
  return Array.isArray(perms) && perms.includes(action);
}

export async function canManageContracts(userId: string, action: HrAction, activeCompany?: string | null): Promise<boolean> {
  // Dùng effective context theo công ty active thay vì primary company
  const ctx = await getEffectiveContext(userId, activeCompany ?? null);
  if (!ctx) return false;
  const u: HrUser = { id: userId, role: ctx.role, module_permissions: ctx.module_permissions as any };
  return hasHrAction(u, action);
}

/**
 * Phạm vi xem: nếu có quyền module → xem tất cả trong công ty active.
 * Nếu không → chỉ xem hồ sơ/hợp đồng của chính mình + cấp dưới trong công ty.
 */
export async function getContractVisibility(
  userId: string,
  activeCompany?: string | null
): Promise<{ all: boolean; allowedEmployeeIds: string[] | null }> {
  const ctx = await getEffectiveContext(userId, activeCompany ?? null);
  if (!ctx) return { all: false, allowedEmployeeIds: [userId.toLowerCase()] };

  const u: HrUser = { id: userId, role: ctx.role, module_permissions: ctx.module_permissions as any };

  if (ctx.role === 'super_admin') return { all: true, allowedEmployeeIds: null };
  if (ctx.role === 'admin') {
    const companyId = activeCompany ?? ctx.company_id;
    if (!companyId) return { all: false, allowedEmployeeIds: [userId.toLowerCase()] };
    const ids = await getCompanyMemberUserIds(companyId);
    return {
      all: false,
      allowedEmployeeIds: Array.from(new Set(ids.map((id) => String(id).toLowerCase()))),
    };
  }
  if (hasHrAction(u, 'view')) {
    // HR manager có quyền view: vẫn chỉ trong công ty active
    const companyId = activeCompany ?? ctx.company_id;
    if (companyId) {
      const ids = await getCompanyMemberUserIds(companyId);
      return { all: false, allowedEmployeeIds: Array.from(new Set(ids.map((id) => String(id).toLowerCase()))) };
    }
    return { all: true, allowedEmployeeIds: null };
  }

  const subtree = await getOrgSubtreeUserIds(userId, activeCompany ?? undefined).catch((err) => {
    console.error('getContractVisibility: Failed to fetch org subtree for userId:', userId, err);
    return [] as string[];
  });
  const ids = Array.from(new Set([userId.toLowerCase(), ...subtree.map((s) => String(s).toLowerCase())]));
  return { all: false, allowedEmployeeIds: ids };
}

/** Có được xem hợp đồng/hồ sơ của nhân viên employeeId không. */
export async function canViewEmployeeData(userId: string, employeeId: string, activeCompany?: string | null): Promise<boolean> {
  const uid = userId.toLowerCase();
  const eid = employeeId.toLowerCase();
  if (uid === eid) return true; // chính chủ
  const ctx = await getEffectiveContext(userId, activeCompany ?? null);
  if (!ctx) return false;
  const u: HrUser = { id: userId, role: ctx.role, module_permissions: ctx.module_permissions as any };
  if (ctx.role === 'super_admin') return true;
  if (ctx.role === 'admin') {
    const companyId = activeCompany ?? ctx.company_id;
    if (!companyId) return false;
    const ids = await getCompanyMemberUserIds(companyId);
    return ids.map((s) => String(s).toLowerCase()).includes(eid);
  }
  if (hasHrAction(u, 'view')) {
    const companyId = activeCompany ?? ctx.company_id;
    if (companyId) {
      const ids = await getCompanyMemberUserIds(companyId);
      return ids.map((s) => String(s).toLowerCase()).includes(eid);
    }
    return true;
  }
  const subtree = await getOrgSubtreeUserIds(userId, activeCompany ?? undefined).catch((err) => {
    console.error('canViewEmployeeData: Failed to fetch org subtree for userId:', userId, err);
    return [] as string[];
  });
  return subtree.map((s) => String(s).toLowerCase()).includes(eid);
}
