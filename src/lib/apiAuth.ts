import { NextRequest, NextResponse } from 'next/server';
import { UserModulePermissions } from '@/lib/modules';
import {
  getEffectiveContext,
  getCompanyMemberUserIds,
  type EffectiveContext,
} from '@/lib/services/userCompanyService';

/**
 * Xác thực server-side cho API route.
 *
 * `x-current-user-id` / `x-current-user-role` do MIDDLEWARE tiêm vào từ cookie
 * phiên đã ký HMAC (xem src/middleware.ts) — header client tự gửi đã bị strip,
 * nên các giá trị này TIN CẬY. Tuy vậy, với thao tác phá huỷ (xoá cứng) ta tra
 * lại role từ DB để tránh dùng role cũ trong cookie nếu quyền vừa bị thay đổi.
 */
export interface Actor {
  id: string;
  role: string;
}

/** Lấy actor (id + role tra từ DB). Trả null nếu chưa đăng nhập / không tồn tại. */
export async function getActor(request: NextRequest): Promise<Actor | null> {
  const id = request.headers.get('x-current-user-id');
  if (!id) return null;
  const companyId = request.headers.get('x-current-user-company');
  const context = await getEffectiveContext(id, companyId);
  if (!context) return null;
  return { id, role: context.role };
}

export interface ActorWithPerms extends Actor {
  perms: UserModulePermissions;
}

/** Lấy actor kèm module_permissions (JSONB) để kiểm tra quyền chi tiết. */
export async function getActorWithPerms(request: NextRequest): Promise<ActorWithPerms | null> {
  const id = request.headers.get('x-current-user-id');
  if (!id) return null;
  const companyId = request.headers.get('x-current-user-company');
  const context = await getEffectiveContext(id, companyId);
  if (!context) return null;
  return {
    id,
    role: context.role,
    perms: context.module_permissions as UserModulePermissions,
  };
}

/**
 * Ai được XOÁ / DUYỆT xoá / nhận yêu cầu xoá tài sản:
 * phải LÀ super_admin VÀ có quyền 'delete' trong module 'asset-management'
 * (Phân Quyền → Quản Lý Tài Sản → Xóa). Super Admin không tích "Xóa" cũng KHÔNG xoá được.
 * Dùng chung cho check xoá trực tiếp, duyệt yêu cầu, và lọc người nhận thông báo.
 */
export function canDeleteAssets(actor: { role: string; perms?: Record<string, string[]> }): boolean {
  if (actor.role !== 'super_admin') return false;
  const a = actor.perms?.['asset-management'];
  return Array.isArray(a) && a.includes('delete');
}

/** Điều kiện SQL (JSONB) chọn user được xoá/duyệt xoá tài sản — khớp canDeleteAssets. */
export const ASSET_DELETE_APPROVER_SQL =
  `role = 'super_admin' AND (module_permissions -> 'asset-management') ? 'delete'`;

export function unauthorized(message = 'Chưa đăng nhập') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = 'Bạn không có quyền thực hiện thao tác này') {
  return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * Đảm bảo actor là super_admin (hoặc nằm trong danh sách role cho phép).
 * Trả về { actor } nếu hợp lệ, hoặc { response } là NextResponse lỗi để route return thẳng.
 */
export async function requireRole(
  request: NextRequest,
  allowed: string[]
): Promise<{ actor: Actor } | { response: NextResponse }> {
  const actor = await getActor(request);
  if (!actor) return { response: unauthorized() };
  if (!allowed.includes(actor.role)) return { response: forbidden() };
  return { actor };
}

// ─────────────────────────────────────────────────────────────────────────────
// Đa Công Ty — ngữ cảnh hiệu lực cho 1 request
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ngữ cảnh hiệu lực của cặp (user, công ty đang làm việc) cho MỘT API request.
 *
 * `x-current-user-id` và `x-current-user-company` do MIDDLEWARE tiêm sau khi xác
 * minh cookie phiên đã ký + đối chiếu membership (xem src/middleware.ts). Vì vậy
 * cả hai TIN CẬY — client không thể tự khai công ty mình không thuộc.
 *
 * Dùng ở đầu mỗi route có dữ liệu company-scope thay vì lặp lại tay:
 * ```ts
 * const ctx = await requireCompanyContext(request);
 * if ('response' in ctx) return ctx.response;
 * const { context } = ctx; // context.company_id, context.role, context.module_permissions...
 * ```
 * Trả `{ response }` là NextResponse 401/403 để route return thẳng.
 */
export async function requireCompanyContext(
  request: NextRequest
): Promise<{ context: EffectiveContext } | { response: NextResponse }> {
  const id = request.headers.get('x-current-user-id');
  if (!id) return { response: unauthorized() };
  const companyId = request.headers.get('x-current-user-company');
  const context = await getEffectiveContext(id, companyId);
  if (!context) return { response: forbidden('Bạn không thuộc công ty đang chọn') };
  return { context };
}

/**
 * Phạm vi dữ liệu theo công ty của một ngữ cảnh — dùng để scope các truy vấn list.
 *  - `super_admin` → `null` (toàn hệ thống, không giới hạn).
 *  - role khác + có công ty → mảng user_id thuộc công ty active (chính ∪ kiêm nhiệm).
 *  - không có công ty → chỉ chính user đó (fallback an toàn).
 *
 * Đây là scope cấp CÔNG TY. Nếu module cần thu hẹp thêm theo manager (chỉ thấy cấp
 * dưới) hoặc theo bản thân (user thường), lọc tiếp trên tập này ở tầng module.
 */
export async function resolveCompanyScope(
  context: EffectiveContext
): Promise<{ memberUserIds: string[] | null }> {
  if (context.role === 'super_admin') return { memberUserIds: null };
  if (!context.company_id) return { memberUserIds: [context.user_id] };
  const ids = await getCompanyMemberUserIds(context.company_id);
  return { memberUserIds: ids };
}
