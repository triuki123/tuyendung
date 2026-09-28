import { getEffectiveContext } from '@/lib/services/userCompanyService';
import { getOrgSubtreeUserIds } from '@/lib/services/attendanceService';

type HrAction = 'view' | 'create' | 'edit' | 'delete' | 'approve';

function hasHrAction(role: string, permissions: Record<string, string[]> | null, action: HrAction): boolean {
  if (role === 'super_admin' || role === 'admin') return true;
  const list: string[] = Array.isArray(permissions?.hr) ? (permissions!.hr as string[]) : [];
  return list.includes(action);
}

export async function canManageEvaluations(userId: string, action: HrAction, companyId?: string | null): Promise<boolean> {
  const ctx = await getEffectiveContext(userId, companyId ?? null);
  if (!ctx) return false;
  return hasHrAction(ctx.role, ctx.module_permissions as any, action);
}

/** Ai có quyền xem evaluation của nhân viên employeeId — scoped theo công ty active. */
export async function canViewEmployeeEvaluation(userId: string, employeeId: string, companyId?: string | null): Promise<boolean> {
  const uid = userId.toLowerCase();
  const eid = employeeId.toLowerCase();
  if (uid === eid) return true;
  const ctx = await getEffectiveContext(userId, companyId ?? null);
  if (!ctx) return false;
  if (hasHrAction(ctx.role, ctx.module_permissions as any, 'view')) return true;
  const subtree = await getOrgSubtreeUserIds(userId, companyId ?? undefined).catch(() => []);
  return subtree.map((s) => s.toLowerCase()).includes(eid);
}

/** Visibility: admin/hr thấy tất cả trong công ty; manager thấy cấp dưới trong công ty. */
export async function getEvaluationVisibility(
  userId: string,
  companyId?: string | null
): Promise<{ all: boolean; allowedEmployeeIds: string[] | null }> {
  const ctx = await getEffectiveContext(userId, companyId ?? null);
  if (!ctx) return { all: false, allowedEmployeeIds: [] };
  if (hasHrAction(ctx.role, ctx.module_permissions as any, 'view')) return { all: true, allowedEmployeeIds: null };

  const subtree = await getOrgSubtreeUserIds(userId, companyId ?? undefined).catch(() => []);
  const ids = Array.from(new Set([userId.toLowerCase(), ...subtree.map((s) => s.toLowerCase())]));
  return { all: false, allowedEmployeeIds: ids };
}
