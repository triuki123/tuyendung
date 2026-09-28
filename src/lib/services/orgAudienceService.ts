/**
 * Resolve danh sách nhân sự theo tổ chức (Công ty / Phòng ban / Bộ phận) — dùng để nhắm đối
 * tượng gửi email/Telegram hàng loạt (Trung Tâm Email, tab Nội Bộ). Nguồn sự thật là
 * org_assignments (mig 223) — department_id NULL = phân công cấp công ty (tường minh).
 */
import { query } from '@/lib/db';

export interface AudienceMember {
  id: string;
  name: string;
  email: string | null;
  has_telegram: boolean;
}

export interface ResolveAudienceInput {
  companyId: string;
  departmentId?: string | null;
  subDepartmentId?: string | null;
}

/**
 * Trả danh sách nhân sự đang active thuộc phạm vi chọn — DISTINCT theo user (tránh trùng do
 * kiêm nhiệm nhiều đơn vị). Không chọn phòng ban/bộ phận = toàn công ty (gồm cả phân công cấp
 * công ty department_id NULL, và fallback nhân sự chưa có org_assignments nào).
 */
export async function resolveOrgAudience(input: ResolveAudienceInput): Promise<AudienceMember[]> {
  const { companyId, departmentId, subDepartmentId } = input;

  if (subDepartmentId) {
    return query<AudienceMember>(
      `SELECT DISTINCT u.id::text AS id, u.name, u.email, (u.telegram_chat_id IS NOT NULL) AS has_telegram
         FROM org_assignments oa
         JOIN users u ON u.id = oa.user_id
        WHERE oa.company_id = $1 AND oa.sub_department_id = $2 AND oa.is_active = true AND u.status = 'active'
        ORDER BY u.name`,
      [companyId, subDepartmentId]
    );
  }

  if (departmentId) {
    return query<AudienceMember>(
      `SELECT DISTINCT u.id::text AS id, u.name, u.email, (u.telegram_chat_id IS NOT NULL) AS has_telegram
         FROM org_assignments oa
         JOIN users u ON u.id = oa.user_id
        WHERE oa.company_id = $1 AND oa.department_id = $2 AND oa.is_active = true AND u.status = 'active'
        ORDER BY u.name`,
      [companyId, departmentId]
    );
  }

  // Toàn công ty: mọi user có phân công active tại công ty này, HOẶC (fallback) chưa có
  // org_assignments nào nhưng users.company_id vẫn trỏ tới công ty này (chưa migrate dữ liệu).
  return query<AudienceMember>(
    `SELECT DISTINCT u.id::text AS id, u.name, u.email, (u.telegram_chat_id IS NOT NULL) AS has_telegram
       FROM users u
       LEFT JOIN org_assignments oa ON oa.user_id = u.id AND oa.is_active = true
      WHERE u.status = 'active'
        AND (
          oa.company_id = $1
          OR (oa.id IS NULL AND u.company_id::text = $1)
        )
      ORDER BY u.name`,
    [companyId]
  );
}
