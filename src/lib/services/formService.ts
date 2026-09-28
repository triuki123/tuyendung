/**
 * Form Service — Kho Biểu Mẫu (kiểu Google Forms)
 *
 * Mỗi biểu mẫu có link public riêng (/forms/{token}) — ai có link đều điền được.
 * form_type 'onboarding': submission đi vào luồng Nguồn Nhân Lực.
 * form_type 'general': thu thập thông tin thường, xem kết quả trong kho.
 */

import crypto from 'crypto';
import { query, queryOne, execute } from '@/lib/db';

export interface FormTemplate {
  id: string;
  title: string;
  description: string | null;
  form_type: 'onboarding' | 'general';
  token: string;
  status: 'draft' | 'active' | 'closed';
  is_internal: boolean;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  submission_count?: number;
  field_count?: number;
}

const FORM_COLUMNS = `f.id, f.title, f.description, f.form_type, f.token, f.status,
  f.is_internal, f.expires_at, f.created_by, f.created_at, f.updated_at`;

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Danh sách biểu mẫu kèm số lượt điền + số field đang bật. */
export async function listForms(): Promise<FormTemplate[]> {
  return query<FormTemplate>(
    `SELECT ${FORM_COLUMNS},
            (SELECT COUNT(*) FROM onboarding_submissions s
              WHERE s.form_id = f.id AND s.status <> 'pending')::int AS submission_count,
            (SELECT COUNT(*) FROM onboarding_form_fields ff
              WHERE ff.form_id = f.id AND ff.enabled = true)::int AS field_count
     FROM form_templates f
     WHERE f.deleted_at IS NULL
     ORDER BY f.created_at DESC`
  );
}

export async function getFormById(id: string): Promise<FormTemplate | null> {
  return queryOne<FormTemplate>(
    `SELECT ${FORM_COLUMNS} FROM form_templates f WHERE f.id = $1 AND f.deleted_at IS NULL`,
    [id]
  );
}

export async function getFormByToken(token: string): Promise<FormTemplate | null> {
  return queryOne<FormTemplate>(
    `SELECT ${FORM_COLUMNS} FROM form_templates f WHERE f.token = $1 AND f.deleted_at IS NULL`,
    [token]
  );
}

/**
 * Tạo biểu mẫu mới.
 * - onboarding: copy bộ 36 field chuẩn từ form onboarding mặc định.
 * - general: seed sẵn field "Họ và Tên" (định danh người điền), thêm field tùy ý sau.
 */
export async function createForm(data: {
  title: string;
  description?: string;
  formType: 'onboarding' | 'general';
  createdBy: string | null;
}): Promise<FormTemplate> {
  const id = genId('form');
  const token = crypto.randomBytes(20).toString('hex');
  const row = await queryOne<FormTemplate>(
    `INSERT INTO form_templates (id, title, description, form_type, token, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, title, description, form_type, token, status, is_internal, created_by, created_at, updated_at`,
    [id, data.title.trim(), data.description?.trim() || null, data.formType, token, data.createdBy]
  );

  if (data.formType === 'onboarding') {
    // Copy bộ field chuẩn từ form mặc định (giữ section/required/sort_order)
    await execute(
      `INSERT INTO onboarding_form_fields
         (id, form_id, field_key, label, field_type, section, required, enabled, sort_order, help_text, options, is_system)
       SELECT 'obf_' || $1 || '_' || field_key, $1, field_key, label, field_type, section, required, enabled, sort_order, help_text, options, is_system
       FROM onboarding_form_fields
       WHERE form_id = 'form_onboarding_default'`,
      [id]
    );
  } else {
    await execute(
      `INSERT INTO onboarding_form_fields
         (id, form_id, field_key, label, field_type, section, required, enabled, sort_order, help_text, options, is_system)
       VALUES ('obf_' || $1 || '_full_name', $1, 'full_name', 'Họ và Tên', 'text', 'personal', true, true, 10, NULL, NULL, true)`,
      [id]
    );
  }

  return row as FormTemplate;
}

export async function updateForm(
  id: string,
  data: { title?: string; description?: string; status?: string; is_internal?: boolean; expires_at?: string | null }
): Promise<FormTemplate | null> {
  const sets: string[] = ['updated_at = NOW()'];
  const params: any[] = [];
  let i = 1;
  if (data.title !== undefined) { sets.push(`title = $${i++}`); params.push(data.title); }
  if (data.description !== undefined) { sets.push(`description = $${i++}`); params.push(data.description); }
  if (data.status !== undefined) { sets.push(`status = $${i++}`); params.push(data.status); }
  if (data.is_internal !== undefined) { sets.push(`is_internal = $${i++}`); params.push(data.is_internal); }
  if (data.expires_at !== undefined) { sets.push(`expires_at = $${i++}`); params.push(data.expires_at || null); }
  params.push(id);
  return queryOne<FormTemplate>(
    `UPDATE form_templates SET ${sets.join(', ')}
     WHERE id = $${i} AND deleted_at IS NULL
     RETURNING id, title, description, form_type, token, status, is_internal, expires_at, created_by, created_at, updated_at`,
    params
  );
}

/** Xóa biểu mẫu (soft). Form onboarding mặc định không cho xóa. */
export async function deleteForm(id: string): Promise<boolean> {
  if (id === 'form_onboarding_default') {
    throw new Error('Không thể xóa biểu mẫu Onboarding mặc định');
  }
  const n = await execute(
    `UPDATE form_templates SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return n > 0;
}

// ── Field của biểu mẫu general (thêm/sửa/xóa tùy ý) ──────────────────────────

const FIELD_TYPES = ['text', 'email', 'date', 'select', 'number', 'textarea', 'tel'];

export async function addField(formId: string, data: {
  label: string;
  fieldType: string;
  required?: boolean;
  options?: string[];
  helpText?: string;
}): Promise<void> {
  if (!FIELD_TYPES.includes(data.fieldType)) throw new Error('Loại trường không hợp lệ');
  const key = 'f_' + crypto.randomBytes(4).toString('hex');
  const [{ max }] = await query<{ max: number | null }>(
    `SELECT MAX(sort_order)::int as max FROM onboarding_form_fields WHERE form_id = $1`,
    [formId]
  );
  await execute(
    `INSERT INTO onboarding_form_fields
       (id, form_id, field_key, label, field_type, section, required, enabled, sort_order, help_text, options, is_system)
     VALUES ($1, $2, $3, $4, $5, 'personal', $6, true, $7, $8, $9, false)`,
    [
      `obf_${formId}_${key}`, formId, key, data.label.trim(), data.fieldType,
      data.required ?? false, (max ?? 0) + 10, data.helpText || null,
      data.options ? JSON.stringify(data.options) : null,
    ]
  );
}

export async function deleteField(formId: string, fieldId: string): Promise<boolean> {
  const n = await execute(
    `DELETE FROM onboarding_form_fields WHERE id = $1 AND form_id = $2 AND is_system = false`,
    [fieldId, formId]
  );
  return n > 0;
}
