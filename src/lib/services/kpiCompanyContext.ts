/**
 * KPI & Đánh Giá — xác định công ty đang thao tác cho 1 request.
 *
 * Ưu tiên:
 *  1. company_id TƯỜNG MINH do client gửi (query param/body) — dùng khi Super Admin chọn
 *     công ty qua dropdown riêng trên trang KPI (Super Admin không nhất thiết có membership
 *     ở mọi công ty nên không dùng được switcher Đa Công Ty thông thường).
 *  2. Header x-current-user-company — công ty đang chọn qua switcher Đa Công Ty (Topbar).
 *  3. Không có gì → công ty chính của user (getEffectiveContext trả về khi companyId rỗng).
 *
 * Super Admin + company_id tường minh: TIN TRỰC TIẾP, không đòi hỏi user_company_memberships
 * (super_admin vốn bypass RBAC toàn hệ thống — consistent với các nơi khác trong app).
 */
import { NextRequest } from 'next/server';
import { getEffectiveContext, Role } from './userCompanyService';

export interface KpiScope {
  company_id: string;
  role: Role;
}

export async function resolveKpiScope(
  request: NextRequest,
  userId: string,
  explicitCompanyId?: string | null
): Promise<KpiScope | null> {
  const role = (request.headers.get('x-current-user-role') || 'user') as Role;

  if (role === 'super_admin' && explicitCompanyId) {
    return { company_id: explicitCompanyId, role: 'super_admin' };
  }

  const companyId = explicitCompanyId || request.headers.get('x-current-user-company');
  const ctx = await getEffectiveContext(userId, companyId);
  if (!ctx?.company_id) return null;
  return { company_id: ctx.company_id, role: ctx.role };
}
