/**
 * signatureService — business logic cho module Chữ Ký Email.
 * Truy cập DB qua helper từ db.ts. Render HTML qua engine signature/templates.
 */
import { query, queryOne, execute } from '@/lib/db';
import {
  renderSignatureHtml,
  renderSignatureText,
  type SignatureData,
} from '@/lib/signature/templates';

export interface UserSignatureRow {
  id: string;
  user_id: string;
  company_id: string | null;
  template_id: string;
  data: SignatureData;
  html: string | null;
  text_plain: string | null;
  created_at: string;
  updated_at: string;
}

/** Lấy chữ ký đang dùng của 1 người dùng (null nếu chưa tạo). */
export async function getUserSignature(userId: string): Promise<UserSignatureRow | null> {
  return queryOne<UserSignatureRow>(
    `SELECT * FROM user_signatures WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
}

/**
 * Tạo/cập nhật chữ ký của người dùng (upsert theo user_id).
 * HTML & plain-text được render server-side để đảm bảo nhất quán với engine.
 */
export async function saveUserSignature(params: {
  userId: string;
  companyId?: string | null;
  data: SignatureData;
}): Promise<UserSignatureRow> {
  const { userId, companyId = null, data } = params;
  const html = renderSignatureHtml(data);
  const textPlain = renderSignatureText(data);
  const id = `sig_${userId}`;

  await execute(
    `INSERT INTO user_signatures
       (id, user_id, company_id, template_id, data, html, text_plain, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       company_id  = EXCLUDED.company_id,
       template_id = EXCLUDED.template_id,
       data        = EXCLUDED.data,
       html        = EXCLUDED.html,
       text_plain  = EXCLUDED.text_plain,
       updated_at  = NOW()`,
    [id, userId, companyId, data.templateId, JSON.stringify(data), html, textPlain]
  );

  const saved = await getUserSignature(userId);
  if (!saved) throw new Error('Lưu chữ ký thất bại');
  return saved;
}

/** Xóa chữ ký của người dùng. */
export async function deleteUserSignature(userId: string): Promise<void> {
  await execute(`DELETE FROM user_signatures WHERE user_id = $1`, [userId]);
}

/**
 * Lấy dữ liệu gợi ý điền sẵn từ hồ sơ người dùng (auto-fill).
 * Kéo họ tên, chức danh, phòng ban, công ty, SĐT, email + logo công ty.
 *
 * Cơ cấu tổ chức mới (org_assignments): chức danh + phòng ban ưu tiên lấy từ
 * PHÂN CÔNG CHÍNH (is_primary, is_active) tại công ty chính của user (users.company_id);
 * COALESCE fallback về cột đơn lẻ trên users khi chưa có phân công — không đổi hành vi cũ.
 */
export async function getSignatureAutofill(userId: string): Promise<Partial<SignatureData>> {
  const row = await queryOne<{
    name: string | null;
    email: string | null;
    phone: string | null;
    position: string | null;
    job_title: string | null;
    dept_name: string | null;
    sub_dept_name: string | null;
    company_name: string | null;
    company_id: string | null;
  }>(
    `SELECT u.name, u.email, u.phone,
            u."position" AS position,
            COALESCE(pos_oa.name, pos.name) AS job_title,
            COALESCE(d_oa.name, d1.name, d2.name) AS dept_name,
            COALESCE(sd_oa.name, sd_u.name) AS sub_dept_name,
            c.name AS company_name,
            c.id::text AS company_id
       FROM users u
       LEFT JOIN public.org_assignments oa
              ON oa.user_id::text = u.id::text
             AND oa.company_id::text = u.company_id::text
             AND oa.is_primary AND oa.is_active
       LEFT JOIN public.positions pos_oa ON pos_oa.id::text = oa.position_id::text
       LEFT JOIN public.departments d_oa ON d_oa.id::text = oa.department_id::text
       LEFT JOIN public.positions pos ON pos.id::text = u.position_id::text
       LEFT JOIN public.departments d1 ON d1.id::text = u.department_id::text
       LEFT JOIN public.departments d2 ON d2.id::text = NULLIF(u.department, '')
       LEFT JOIN public.sub_departments sd_oa ON sd_oa.id::text = oa.sub_department_id::text
       LEFT JOIN public.sub_departments sd_u ON sd_u.id::text = u.sub_department_id::text
       LEFT JOIN public.companies c ON c.id::text = u.company_id::text
      WHERE u.id = $1`,
    [userId]
  );

  if (!row) return {};
  return {
    fullName: row.name || '',
    jobTitle: row.job_title || row.position || '',
    department: row.dept_name || '',
    subDepartment: row.sub_dept_name || '',
    company: row.company_name || '',
    phone: row.phone || '',
    email: row.email || '',
  };
}

/**
 * Meta công ty của người dùng cho tính năng "Dùng logo công ty":
 * trả companyId + có logo hay không (để client hiện/ẩn nút).
 */
export async function getSignatureCompanyMeta(
  userId: string
): Promise<{ companyId: string | null; hasLogo: boolean }> {
  const row = await queryOne<{ company_id: string | null; has_logo: boolean }>(
    `SELECT c.id::text AS company_id,
            EXISTS(SELECT 1 FROM company_logos cl WHERE cl.company_id::text = c.id::text AND cl.variant = 'full_light') AS has_logo
       FROM users u
       JOIN public.companies c ON c.id::text = u.company_id::text
      WHERE u.id = $1`,
    [userId]
  );
  return { companyId: row?.company_id ?? null, hasLogo: !!row?.has_logo };
}
