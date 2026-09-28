/**
 * Mẫu email tuyển dụng (quản lý qua UI). Biến {{ten_bien}} render khi gửi.
 */
import { query, queryOne, execute } from '@/lib/db';

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export type EmailTemplateCategory = 'interview_invite' | 'rejection' | 'offer' | 'account_provision' | 'other';

export interface EmailTemplate {
  id: string; name: string; category: string; subject: string; body_html: string;
  is_active: boolean; created_at: string; updated_at: string;
}

/** Danh sách biến chuẩn dùng trong mẫu (để hiển thị gợi ý trong UI). */
export const EMAIL_TEMPLATE_VARIABLES: { key: string; label: string }[] = [
  { key: 'ung_vien', label: 'Tên ứng viên' },
  { key: 'vi_tri', label: 'Vị trí tuyển dụng' },
  { key: 'cong_ty', label: 'Công ty' },
  { key: 'thoi_gian', label: 'Thời gian phỏng vấn' },
  { key: 'hinh_thuc', label: 'Hình thức phỏng vấn' },
  { key: 'dia_diem', label: 'Địa điểm / Link' },
  { key: 'nguoi_gui', label: 'Người gửi' },
  { key: 'assetflow_user', label: 'Username AssetFlow' },
  { key: 'assetflow_pass', label: 'Password AssetFlow' },
  { key: 'zimbra_user', label: 'Username Zimbra' },
  { key: 'zimbra_pass', label: 'Password Zimbra' },
];

export async function listTemplates(onlyActive = false): Promise<EmailTemplate[]> {
  return query<EmailTemplate>(
    `SELECT id, name, category, subject, body_html, is_active, created_at, updated_at
       FROM hr_email_templates
      ${onlyActive ? 'WHERE is_active = TRUE' : ''}
      ORDER BY category, name`,
  );
}

export async function getTemplate(id: string): Promise<EmailTemplate | null> {
  return queryOne<EmailTemplate>(
    `SELECT id, name, category, subject, body_html, is_active, created_at, updated_at
       FROM hr_email_templates WHERE id = $1`, [id],
  );
}

export async function createTemplate(data: {
  name: string; category?: string; subject: string; bodyHtml: string; createdBy: string | null;
}): Promise<EmailTemplate> {
  const id = genId('tpl');
  await execute(
    `INSERT INTO hr_email_templates (id, name, category, subject, body_html, created_by)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, data.name, data.category || 'other', data.subject, data.bodyHtml, data.createdBy],
  );
  return (await getTemplate(id))!;
}

export async function updateTemplate(id: string, data: {
  name?: string; category?: string; subject?: string; bodyHtml?: string; isActive?: boolean;
}): Promise<EmailTemplate | null> {
  const sets: string[] = ['updated_at = NOW()'];
  const params: any[] = [];
  const p = (v: any) => { params.push(v); return `$${params.length}`; };
  if (data.name !== undefined) sets.push(`name = ${p(data.name)}`);
  if (data.category !== undefined) sets.push(`category = ${p(data.category)}`);
  if (data.subject !== undefined) sets.push(`subject = ${p(data.subject)}`);
  if (data.bodyHtml !== undefined) sets.push(`body_html = ${p(data.bodyHtml)}`);
  if (data.isActive !== undefined) sets.push(`is_active = ${p(data.isActive)}`);
  const n = await execute(`UPDATE hr_email_templates SET ${sets.join(', ')} WHERE id = ${p(id)}`, params);
  if (n === 0) return null;
  return getTemplate(id);
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const n = await execute(`DELETE FROM hr_email_templates WHERE id = $1`, [id]);
  return n > 0;
}

/** Thay {{bien}} bằng giá trị (bien không có giá trị → để trống). */
export function renderTemplate(text: string, vars: Record<string, string | null | undefined>): string {
  return text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_m, key) => {
    const v = vars[key];
    return v == null ? '' : String(v);
  });
}
