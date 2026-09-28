/**
 * Chi Phí — quyền per-company (roadmap 11.0): quyền `expense.<action>` xét theo
 * effective context của user TẠI CÔNG TY CHỊU CHI (membership đa công ty).
 *
 * LUẬT: chỉ super_admin được bỏ qua. MỌI vai trò khác (kể cả admin) phải được
 * BẬT TƯỜNG MINH từng quyền trong Phân Quyền → Chi Phí, và phải bật RIÊNG ở
 * từng công ty (quyền ở công ty chính KHÔNG lan sang công ty phụ — xem
 * getEffectiveContext: công ty phụ đọc user_company_memberships.module_permissions).
 */
import { getEffectiveContext } from './userCompanyService';

export type ExpenseAction = 'view' | 'create' | 'approve' | 'export' | 'delete' | 'manage';

export async function hasExpensePerm(userId: string, companyId: string | null, action: ExpenseAction): Promise<boolean> {
  const ctx = await getEffectiveContext(userId, companyId ?? null);
  if (!ctx) return false;
  if (ctx.role === 'super_admin') return true;
  const perms = (ctx.module_permissions as Record<string, string[]> | null)?.['expense'];
  return Array.isArray(perms) && perms.includes(action);
}

/** Phạm vi xem danh sách: super_admin → mọi công ty; có expense.view tại công ty → cả công ty; còn lại chỉ của mình/đến lượt duyệt. */
export async function canViewCompanyWide(userId: string, companyId: string): Promise<boolean> {
  return hasExpensePerm(userId, companyId, 'view');
}
