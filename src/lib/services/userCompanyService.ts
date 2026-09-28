/**
 * Đa Công Ty — quản lý vai trò của 1 user ở nhiều công ty.
 *
 * Quy ước:
 *  - Công ty CHÍNH = users.company_id (+ users.role/department_id/... ). Nguồn sự thật,
 *    KHÔNG lưu trùng vào bảng memberships.
 *  - Công ty PHỤ = các dòng trong user_company_memberships (migration 149).
 *
 * "Ngữ cảnh hiệu lực" (effective context) của cặp (user, công ty đang chọn):
 *  - Nếu công ty đang chọn = công ty chính (hoặc không chỉ định) → đọc từ users.
 *  - Nếu = công ty phụ có membership active → đọc role/vị trí/quyền từ membership.
 *  - Nếu user không thuộc công ty đó → trả null (gọi nơi nên từ chối / fallback chính).
 *
 * Bảo mật: client chỉ gửi "muốn làm việc ở công ty X"; server gọi getEffectiveContext()
 * để TỰ suy role — client không thể tự khai role.
 */
import { query, queryOne, execute } from '@/lib/db';
import { getEffectiveRolePermissions, UserModulePermissions } from '@/lib/modules';

export type Role = 'super_admin' | 'admin' | 'manager' | 'user';

export interface CompanyMembership {
  company_id: string;
  company_name?: string | null;
  role: Role;
  department_id: string | null;
  sub_department_id: string | null;
  position_id: string | null;
  job_title_id: string | null;
  manager_id: string | null;
  module_permissions: UserModulePermissions | null;
  is_primary: boolean;
  is_active: boolean;
}

export interface EffectiveContext {
  user_id: string;
  company_id: string | null;
  role: Role;
  department_id: string | null;
  sub_department_id: string | null;
  position_id: string | null;
  job_title_id: string | null;
  manager_id: string | null;
  module_permissions: UserModulePermissions;
  is_primary: boolean;
}

interface UserRow {
  id: string;
  company_id: string | null;
  role: string | null;
  department_id: string | null;
  sub_department_id: string | null;
  position_id: string | null;
  job_title_id: string | null;
  manager_id: string | null;
  module_permissions: UserModulePermissions | null;
}

async function getUserRow(userId: string): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `SELECT id, company_id, role, department_id, sub_department_id,
            position_id, job_title_id, manager_id, module_permissions
       FROM users WHERE id = $1`,
    [userId]
  );
}

/**
 * Danh sách công ty của user = công ty chính (từ users) + các công ty phụ (memberships).
 * Trả về kèm tên công ty để hiển thị (switcher / form).
 */
export async function getUserMemberships(userId: string): Promise<CompanyMembership[]> {
  const u = await getUserRow(userId);
  if (!u) return [];

  const result: CompanyMembership[] = [];

  if (u.company_id) {
    const co = await queryOne<{ name: string }>(
      `SELECT name FROM companies WHERE id = $1`,
      [u.company_id]
    );
    result.push({
      company_id: u.company_id,
      company_name: co?.name ?? null,
      role: (u.role as Role) || 'user',
      department_id: u.department_id,
      sub_department_id: u.sub_department_id,
      position_id: u.position_id,
      job_title_id: u.job_title_id,
      manager_id: u.manager_id,
      module_permissions: u.module_permissions ?? null,
      is_primary: true,
      is_active: true,
    });
  }

  const rows = await query<any>(
    `SELECT m.company_id, c.name AS company_name, m.role,
            m.department_id, m.sub_department_id, m.position_id, m.job_title_id,
            m.manager_id, m.module_permissions, m.is_active
       FROM user_company_memberships m
       LEFT JOIN companies c ON c.id = m.company_id
      WHERE m.user_id = $1
      ORDER BY c.name ASC`,
    [userId]
  );
  for (const r of rows) {
    // Bỏ qua nếu trùng công ty chính (an toàn — không nên xảy ra do tab loại trừ)
    if (u.company_id && r.company_id === u.company_id) continue;
    result.push({
      company_id: r.company_id,
      company_name: r.company_name,
      role: (r.role as Role) || 'user',
      department_id: r.department_id,
      sub_department_id: r.sub_department_id,
      position_id: r.position_id,
      job_title_id: r.job_title_id,
      manager_id: r.manager_id,
      module_permissions: r.module_permissions ?? null,
      is_primary: false,
      is_active: r.is_active,
    });
  }

  return result;
}

/**
 * Tập company_id user ĐƯỢC PHÉP thấy / thao tác trong Tổ Chức.
 *  - super_admin → null (mọi công ty).
 *  - còn lại (admin/manager/user) → CHỈ các công ty họ thuộc về (chính + đa công ty).
 * Mảng rỗng = không thuộc công ty nào (không thấy gì).
 */
export async function getVisibleCompanyIds(
  userId: string | null | undefined,
  effectiveRole?: string | null
): Promise<string[] | null> {
  if (!userId) return [];
  const u = await getUserRow(userId);
  if (!u) return [];

  // ⚠️ Vai trò dùng ở đây phải là vai HIỆU LỰC tại công ty ĐANG CHỌN, không phải
  // users.role (vai ở công ty chính). Middleware đã tính vai hiệu lực qua
  // getEffectiveContext và đặt vào header x-current-user-role.
  //
  // Nếu lấy users.role: một super_admin chuyển sang công ty phụ với vai Admin vẫn bị
  // coi là super_admin → trả null → thấy toàn bộ công ty của tập đoàn, tức KHÔNG hề
  // "thoát vai" như thiết kế đa công ty yêu cầu.
  const role = effectiveRole ?? (await readEffectiveRoleFromRequest()) ?? u.role;
  if (role === 'super_admin') return null;

  const ms = await getUserMemberships(userId);
  return [...new Set(ms.filter((m) => m.is_active !== false && m.company_id).map((m) => m.company_id as string))];
}

/**
 * Vai trò hiệu lực của request hiện tại (header do middleware đặt).
 * Trả null khi chạy NGOÀI ngữ cảnh request (scheduler, script) — lúc đó người gọi
 * rơi về users.role như cũ.
 */
async function readEffectiveRoleFromRequest(): Promise<string | null> {
  try {
    const { headers } = await import('next/headers');
    return headers().get('x-current-user-role');
  } catch {
    return null;
  }
}

/**
 * Công ty mặc định cho 1 request khi client KHÔNG chỉ định công ty.
 *
 * Quy tắc: ưu tiên công ty ĐANG CHỌN trên company switcher (header
 * `x-current-user-company`, đã được middleware đối chiếu membership) — chỉ khi
 * người dùng thực sự thuộc công ty đó. Không có/không hợp lệ mới rơi về công ty
 * chính (`allowed[0]`).
 *
 * ⚠️ Đừng mặc định thẳng về `allowed[0]`: người kiêm nhiệm đang đứng ở công ty phụ
 * sẽ ĐỌC nhầm dữ liệu công ty chính, và tệ hơn là GHI (tạo phòng ban/chức danh)
 * nhầm vào công ty chính.
 *
 * @param allowed  kết quả getVisibleCompanyIds (null = super_admin, mọi công ty)
 * @returns null = không lọc theo công ty (chỉ xảy ra với super_admin)
 */
export function resolveDefaultCompanyId(
  allowed: string[] | null,
  activeCompanyId: string | null | undefined
): string | null {
  // Vai hiệu lực super_admin TẠI công ty đang đứng → không khoá theo công ty nào.
  // Đây là cửa duy nhất để quản trị công ty mình KHÔNG là thành viên (switcher chỉ
  // liệt kê công ty mình thuộc về) — siết chỗ này là tự khoá super_admin ra ngoài.
  if (allowed === null) return null;

  if (activeCompanyId && allowed.includes(activeCompanyId)) return activeCompanyId;
  return allowed[0] ?? null;
}

/**
 * Lấy danh sách công ty PHỤ thô (chỉ memberships) — dùng cho form chỉnh sửa.
 */
export async function getSecondaryMemberships(userId: string): Promise<CompanyMembership[]> {
  const all = await getUserMemberships(userId);
  return all.filter((m) => !m.is_primary);
}

/**
 * Ngữ cảnh hiệu lực cho cặp (user, công ty). companyId rỗng => dùng công ty chính.
 * Trả null nếu user KHÔNG thuộc công ty đó (cả chính lẫn phụ).
 */
export async function getEffectiveContext(
  userId: string,
  companyId?: string | null
): Promise<EffectiveContext | null> {
  const u = await getUserRow(userId);
  if (!u) return null;

  const resolveCtx = (m: {
    company_id: string | null;
    role: Role;
    department_id: string | null;
    sub_department_id: string | null;
    position_id: string | null;
    job_title_id: string | null;
    manager_id: string | null;
    module_permissions: UserModulePermissions | null;
    is_primary: boolean;
  }): EffectiveContext => ({
    user_id: userId,
    company_id: m.company_id,
    role: m.role,
    department_id: m.department_id,
    sub_department_id: m.sub_department_id,
    position_id: m.position_id,
    job_title_id: m.job_title_id,
    manager_id: m.manager_id,
    // Quyền hiệu lực = quyền nền bắt buộc của role + các module được cấp riêng.
    module_permissions: getEffectiveRolePermissions(m.role, m.module_permissions),
    is_primary: m.is_primary,
  });

  // Phase 4 cải tổ cơ cấu: các trường ORG (đơn vị/chức danh/quản lý) ưu tiên lấy từ
  // PHÂN CÔNG CHÍNH trong org_assignments (nguồn sự thật mới); role + module_permissions
  // vẫn thuộc users/memberships (RBAC không đổi). Fallback cột cũ khi chưa có phân công.
  const overlayFromAssignment = async (
    base: EffectiveContext,
    forCompanyId: string | null
  ): Promise<EffectiveContext> => {
    if (!forCompanyId) return base;
    const a = await queryOne<any>(
      `SELECT department_id, sub_department_id, position_id, job_title_id, manager_id
         FROM org_assignments
        WHERE user_id::text = $1 AND company_id::text = $2 AND is_primary AND is_active`,
      [userId, forCompanyId]
    );
    if (!a) return base;
    return {
      ...base,
      department_id: a.department_id ?? null,
      sub_department_id: a.sub_department_id ?? null,
      position_id: a.position_id ?? null,
      job_title_id: a.job_title_id ?? base.job_title_id,
      manager_id: a.manager_id ?? null,
    };
  };

  // Không chỉ định, hoặc trùng công ty chính → dùng users.
  if (!companyId || (u.company_id && companyId === u.company_id)) {
    return overlayFromAssignment(
      resolveCtx({
        company_id: u.company_id,
        role: (u.role as Role) || 'user',
        department_id: u.department_id,
        sub_department_id: u.sub_department_id,
        position_id: u.position_id,
        job_title_id: u.job_title_id,
        manager_id: u.manager_id,
        module_permissions: u.module_permissions ?? null,
        is_primary: true,
      }),
      u.company_id
    );
  }

  // Công ty phụ → tra membership active.
  const m = await queryOne<any>(
    `SELECT company_id, role, department_id, sub_department_id, position_id,
            job_title_id, manager_id, module_permissions
       FROM user_company_memberships
      WHERE user_id = $1 AND company_id = $2 AND is_active = true`,
    [userId, companyId]
  );
  if (!m) return null;
  return overlayFromAssignment(
    resolveCtx({
      company_id: m.company_id,
      role: (m.role as Role) || 'user',
      department_id: m.department_id,
      sub_department_id: m.sub_department_id,
      position_id: m.position_id,
      job_title_id: m.job_title_id,
      manager_id: m.manager_id,
      module_permissions: m.module_permissions ?? null,
      is_primary: false,
    }),
    m.company_id
  );
}

export interface MembershipInput {
  company_id: string;
  role: Role;
  department_id?: string | null;
  sub_department_id?: string | null;
  position_id?: string | null;
  job_title_id?: string | null;
  manager_id?: string | null;
  module_permissions?: UserModulePermissions | null;
  is_active?: boolean;
}

/**
 * Thay thế TOÀN BỘ công ty phụ của user bằng danh sách mới (đồng bộ từ form).
 * Tự loại công ty trùng công ty chính. Dùng transaction để nhất quán.
 */
export async function setMemberships(
  userId: string,
  memberships: MembershipInput[]
): Promise<void> {
  const u = await getUserRow(userId);
  const primaryCompanyId = u?.company_id ?? null;

  // Loại trùng công ty chính + dedupe theo company_id
  const seen = new Set<string>();
  const clean = memberships.filter((m) => {
    if (!m.company_id) return false;
    if (primaryCompanyId && m.company_id === primaryCompanyId) return false;
    if (seen.has(m.company_id)) return false;
    seen.add(m.company_id);
    return true;
  });

  await execute('DELETE FROM user_company_memberships WHERE user_id = $1', [userId]);

  const { randomUUID } = await import('crypto');
  for (const m of clean) {
    // App tự sinh id (bảng không dùng DEFAULT gen_random_uuid để khỏi phụ thuộc pgcrypto/PG13+).
    await execute(
      `INSERT INTO user_company_memberships
         (id, user_id, company_id, role, department_id, sub_department_id,
          position_id, job_title_id, manager_id, module_permissions, is_active, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())`,
      [
        randomUUID(),
        userId,
        m.company_id,
        m.role || 'user',
        m.department_id || null,
        m.sub_department_id || null,
        m.position_id || null,
        m.job_title_id || null,
        m.manager_id || null,
        m.module_permissions ? JSON.stringify(m.module_permissions) : null,
        m.is_active !== false,
      ]
    );
  }

  // Dual-write cơ cấu tổ chức → org_assignments (công ty phụ đổi thì phân công đổi theo)
  const { trySyncAssignments } = await import('@/lib/services/orgStructureService');
  await trySyncAssignments(userId);
}

/**
 * Tập user_id thuộc 1 công ty = primary (users.company_id) ∪ secondary (membership active).
 * Dùng để scope dữ liệu theo công ty đang chọn.
 */
export async function getCompanyMemberUserIds(companyId: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM users WHERE company_id = $1 AND status = 'active'
     UNION
     SELECT user_id AS id FROM user_company_memberships
       WHERE company_id = $1 AND is_active = true`,
    [companyId]
  );
  return rows.map((r) => r.id);
}

/**
 * manager_id của user TẠI 1 công ty cụ thể:
 *  - công ty chính → users.manager_id
 *  - công ty phụ   → membership.manager_id
 */
export async function getManagerIdInCompany(
  userId: string,
  companyId: string
): Promise<string | null> {
  const ctx = await getEffectiveContext(userId, companyId);
  return ctx?.manager_id ?? null;
}
