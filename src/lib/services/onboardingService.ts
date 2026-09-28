/**
 * Onboarding Service — luồng tiếp nhận nhân sự mới
 *
 * Luồng: HR tạo lời mời (email link) → nhân sự điền form public (token)
 *        → Tuyển dụng chuẩn hóa & xác nhận → gửi Quản trị viên
 *        → QTV duyệt: tạo user + chuyển hồ sơ nháp thành chính thức + Telegram chào mừng.
 */

import crypto from 'crypto';
import { query, queryOne, execute, withTransaction } from '@/lib/db';
import * as usersService from '@/lib/services/usersService';
import { createHrDocument } from '@/lib/services/hrDocumentService';
import {
  notifyOnboardingSubmitted,
  notifyOnboardingSentToAdmin,
  notifyOnboardingApproved,
  notifyOnboardingRejected,
} from '@/lib/services/notificationsService';
import { isRecruiterOnlyField } from '@/lib/onboardingFieldRules';
import { notify } from '@/lib/notifications/engine';

/** ID biểu mẫu Onboarding cố định (tạo ở migration 100). Public tại /onboarding/thong-tin-nhan-su-dau-vao. */
export const ONBOARDING_FORM_ID = 'form_onboarding_default';

export interface OnboardingFormField {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  section: string;
  required: boolean;
  enabled: boolean;
  sort_order: number;
  help_text: string | null;
  options: string[] | null;
  is_system: boolean;
  visible_if: VisibleIf | null;
}

export interface VisibleCondition { field: string; op: string; value?: string }
export interface VisibleIf { mode: 'all' | 'any'; conditions: VisibleCondition[] }

export interface OnboardingSubmission {
  id: string;
  form_id?: string | null;
  token: string;
  candidate_name: string;
  candidate_email: string;
  status: 'pending' | 'submitted' | 'confirmed' | 'sent_to_admin' | 'approved' | 'rejected';
  data: Record<string, any>;
  invited_by: string | null;
  invited_at: string;
  email_sent: boolean;
  email_error: string | null;
  submitted_at: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  sent_to_admin_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
  user_id: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

const SUBMISSION_COLUMNS = `id, form_id, token, candidate_name, candidate_email, status, data,
  invited_by, invited_at, email_sent, email_error, submitted_at,
  confirmed_by, confirmed_at, sent_to_admin_at,
  approved_by, approved_at, rejected_by, rejected_at, reject_reason,
  user_id, expires_at, created_at, updated_at`;

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cấu hình field (module Biểu Mẫu)
// ─────────────────────────────────────────────────────────────────────────────

/** Field của một biểu mẫu, sắp theo section + sort_order. */
export async function listFormFields(formId: string, onlyEnabled = false): Promise<OnboardingFormField[]> {
  const extra = onlyEnabled ? 'AND enabled = true' : '';
  return query<OnboardingFormField>(
    `SELECT id, field_key, label, field_type, section, required, enabled, sort_order, help_text, options, is_system, visible_if
     FROM onboarding_form_fields
     WHERE form_id = $1 ${extra}
     ORDER BY CASE section
       WHEN 'personal' THEN 1 WHEN 'work' THEN 2 WHEN 'identity' THEN 3
       WHEN 'bank' THEN 4 WHEN 'other' THEN 5 WHEN 'emergency' THEN 6
       WHEN 'emergency2' THEN 7 WHEN 'attachments' THEN 8 ELSE 9 END, sort_order`,
    [formId]
  );
}

/** Cập nhật hàng loạt cấu hình field: enabled / required / label / help_text / sort_order. */
export async function updateFormFields(
  updates: { id: string; enabled?: boolean; required?: boolean; label?: string; help_text?: string | null; sort_order?: number; visible_if?: VisibleIf | null }[]
): Promise<void> {
  await withTransaction(async (client) => {
    for (const u of updates) {
      const sets: string[] = ['updated_at = NOW()'];
      const params: any[] = [];
      let i = 1;
      if (u.enabled !== undefined) { sets.push(`enabled = $${i++}`); params.push(u.enabled); }
      if (u.required !== undefined) { sets.push(`required = $${i++}`); params.push(u.required); }
      if (u.label !== undefined) { sets.push(`label = $${i++}`); params.push(u.label); }
      if (u.help_text !== undefined) { sets.push(`help_text = $${i++}`); params.push(u.help_text); }
      if (u.sort_order !== undefined) { sets.push(`sort_order = $${i++}`); params.push(u.sort_order); }
      if (u.visible_if !== undefined) { sets.push(`visible_if = $${i++}::jsonb`); params.push(u.visible_if ? JSON.stringify(u.visible_if) : null); }
      params.push(u.id);
      await client.query(
        `UPDATE onboarding_form_fields SET ${sets.join(', ')} WHERE id = $${i}`,
        params
      );
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Bài nộp (submission) — tạo khi người dùng submit qua link public của biểu mẫu
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Nộp biểu mẫu qua link public (kiểu Google Forms).
 * Mỗi lượt submit tạo một submission mới — không cần tài khoản, không cần lời mời.
 * Validate field bắt buộc theo cấu hình của biểu mẫu.
 */
export async function submitToForm(
  formId: string,
  formType: 'onboarding' | 'general',
  data: Record<string, any>
): Promise<OnboardingSubmission> {
  const fields = await listFormFields(formId, true);
  const missing: string[] = [];
  for (const f of fields) {
    // Bỏ qua field không bắt buộc, file, và field chỉ-Tuyển-dụng (không hiện trên form public).
    if (!f.required || f.field_type === 'file' || isRecruiterOnlyField(f.field_key)) continue;
    const v = data[f.field_key];
    if (v === undefined || v === null || String(v).trim() === '') missing.push(f.label);
  }
  if (missing.length > 0) throw new Error(`Vui lòng điền: ${missing.join(', ')}`);

  const id = genId('onb');
  const token = crypto.randomBytes(24).toString('hex'); // token nội bộ của submission (dùng cho upload hồ sơ)
  const candidateName = String(data.full_name || 'Không rõ tên').trim();
  const candidateEmail = String(data.personal_email || data.email || '').trim().toLowerCase();

  const row = await queryOne<OnboardingSubmission>(
    `INSERT INTO onboarding_submissions
       (id, form_id, token, candidate_name, candidate_email, status, data, submitted_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, 'submitted', $6, NOW(), NOW() + INTERVAL '1 day')
     RETURNING ${SUBMISSION_COLUMNS}`,
    [id, formId, token, candidateName, candidateEmail, JSON.stringify(data)]
  );

  // Chỉ biểu mẫu onboarding mới báo bộ phận Tuyển Dụng (fire-and-forget)
  if (formType === 'onboarding') {
    notifyOnboardingSubmitted(row).catch((e) => console.error('[submitToForm] notify error:', e));
  }

  return row as OnboardingSubmission;
}

export async function listSubmissions(opts: {
  status?: string;
  formId?: string;
  onboardingOnly?: boolean;
} = {}): Promise<OnboardingSubmission[]> {
  const where: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (opts.status) { where.push(`s.status = $${i++}`); params.push(opts.status); }
  if (opts.formId) { where.push(`s.form_id = $${i++}`); params.push(opts.formId); }
  if (opts.onboardingOnly) {
    where.push(`(s.form_id IS NULL OR s.form_id IN (SELECT id FROM form_templates WHERE form_type = 'onboarding'))`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return query<OnboardingSubmission>(
    `SELECT ${SUBMISSION_COLUMNS.split(', ').map(c => 's.' + c.trim()).join(', ')}
     FROM onboarding_submissions s ${clause} ORDER BY s.created_at DESC`,
    params
  );
}

/** Đếm theo trạng thái — chỉ tính submission thuộc biểu mẫu onboarding. */
export async function countByStatus(): Promise<Record<string, number>> {
  const rows = await query<{ status: string; count: string }>(
    `SELECT status, COUNT(*) as count FROM onboarding_submissions
     WHERE form_id IS NULL OR form_id IN (SELECT id FROM form_templates WHERE form_type = 'onboarding')
     GROUP BY status`
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = parseInt(r.count, 10);
  return out;
}

export async function getSubmission(id: string): Promise<OnboardingSubmission | null> {
  return queryOne<OnboardingSubmission>(
    `SELECT ${SUBMISSION_COLUMNS} FROM onboarding_submissions WHERE id = $1`,
    [id]
  );
}

export async function getSubmissionByToken(token: string): Promise<OnboardingSubmission | null> {
  return queryOne<OnboardingSubmission>(
    `SELECT ${SUBMISSION_COLUMNS} FROM onboarding_submissions WHERE token = $1`,
    [token]
  );
}

/** Tuyển dụng chuẩn hóa dữ liệu (sửa bất kỳ field nào). */
export async function updateSubmissionData(
  id: string,
  data: Record<string, any>,
  candidateName?: string
): Promise<OnboardingSubmission> {
  const sub = await getSubmission(id);
  if (!sub) throw new Error('Không tìm thấy bài nộp');
  if (sub.status === 'approved') throw new Error('Bài nộp đã được duyệt — không thể sửa');

  const row = await queryOne<OnboardingSubmission>(
    `UPDATE onboarding_submissions
     SET data = $2, candidate_name = COALESCE($3, candidate_name), updated_at = NOW()
     WHERE id = $1
     RETURNING ${SUBMISSION_COLUMNS}`,
    [id, JSON.stringify(data), candidateName ?? null]
  );
  return row as OnboardingSubmission;
}

/** Tuyển dụng xác nhận thông tin đã chuẩn hóa. */
export async function confirmSubmission(id: string, userId: string): Promise<OnboardingSubmission> {
  const row = await queryOne<OnboardingSubmission>(
    `UPDATE onboarding_submissions
     SET status = 'confirmed', confirmed_by = $2, confirmed_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status IN ('submitted', 'confirmed')
     RETURNING ${SUBMISSION_COLUMNS}`,
    [id, userId]
  );
  if (!row) throw new Error('Chỉ xác nhận được bài nộp ở trạng thái "Đã nộp"');
  return row;
}

/** Gửi quản trị viên để duyệt tạo user. */
export async function sendToAdmin(id: string, _userId: string): Promise<OnboardingSubmission> {
  const row = await queryOne<OnboardingSubmission>(
    `UPDATE onboarding_submissions
     SET status = 'sent_to_admin', sent_to_admin_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'confirmed'
     RETURNING ${SUBMISSION_COLUMNS}`,
    [id]
  );
  if (!row) throw new Error('Chỉ gửi được bài nộp đã "Xác nhận thông tin"');
  notifyOnboardingSentToAdmin(row, _userId).catch((e) => console.error('[sendToAdmin] notify error:', e));
  return row;
}

/** QTV từ chối. */
export async function rejectSubmission(id: string, adminId: string, reason: string): Promise<OnboardingSubmission> {
  const row = await queryOne<OnboardingSubmission>(
    `UPDATE onboarding_submissions
     SET status = 'rejected', rejected_by = $2, rejected_at = NOW(), reject_reason = $3, updated_at = NOW()
     WHERE id = $1 AND status NOT IN ('approved', 'rejected')
     RETURNING ${SUBMISSION_COLUMNS}`,
    [id, adminId, reason]
  );
  if (!row) throw new Error('Không thể từ chối bài nộp này');
  // Hồ sơ nháp đính kèm → soft-delete (nhân sự không nhận việc)
  await execute(
    `UPDATE hr_documents SET deleted_at = NOW() WHERE employee_id = $1 AND is_draft = true AND deleted_at IS NULL`,
    [id]
  );
  notifyOnboardingRejected(row, adminId, reason).catch((e) => console.error('[rejectSubmission] notify error:', e));
  return row;
}

/**
 * QTV duyệt: tạo user chính thức từ dữ liệu onboarding.
 * - Tạo user (kế thừa usersService.createUser: hash password, audit log, check email trùng)
 * - Cập nhật toàn bộ trường cá nhân vào user
 * - Chuyển hồ sơ nháp (hr_documents is_draft) sang employee_id user mới, thành chính thức
 * - Gửi Telegram chào mừng nếu có telegram_id
 */
export async function approveSubmission(
  id: string,
  adminId: string,
  opts: {
    workingEmail: string; password: string; role?: string;
    company_id?: string; department_id?: string; sub_department_id?: string; position_id?: string;
    /** Hình thức làm việc chọn ngay lúc duyệt (id + tên snapshot — cùng cặp cột modal Chỉnh Sửa dùng). */
    employment_type_id?: string; employment_type?: string;
    /** Quản lý trực tiếp chọn ngay lúc duyệt — nếu bỏ trống thì user tạo ra chưa có quản lý. */
    manager_id?: string;
  }
): Promise<{ submission: OnboardingSubmission; userId: string }> {
  const sub = await getSubmission(id);
  if (!sub) throw new Error('Không tìm thấy bài nộp');
  if (sub.status !== 'sent_to_admin') throw new Error('Bài nộp chưa được gửi tới quản trị viên');
  if (!opts.workingEmail?.trim()) throw new Error('Working email không được để trống');
  // Chỉ SSO: mật khẩu tạo user đi tiếp sang SSO (yêu cầu ≥10 ký tự). Dưới 10 sẽ khiến
  // SSO từ chối trong khi local không giữ hash → tài khoản không đăng nhập được ở đâu cả.
  if (!opts.password || opts.password.length < 10) throw new Error('Mật khẩu phải có ít nhất 10 ký tự');

  const d = sub.data || {};

  // 1. Tạo user qua service chuẩn (bcrypt hash + audit + check email trùng)
  const created = await usersService.createUser(
    {
      name: d.full_name || sub.candidate_name,
      email: opts.workingEmail.trim().toLowerCase(),
      password: opts.password,
      role: opts.role || 'user',
      company_id: d.company_id || '',
      department_id: d.department_id || null,
      department: d.department_id || '',
      sub_department_id: d.sub_department_id || null,
      position_id: d.position_id || null,
      position: d.job_title || '',
      phone: d.phone || '',
      manager_id: opts.manager_id || null,
    },
    adminId
  );
  const newUserId = String((created as any).id);

  // 2. Bổ sung toàn bộ trường cá nhân (cột mới migration 099 + cột HR có sẵn)
  const personal: Record<string, any> = {
    personal_email: d.personal_email || null,
    date_of_birth: d.date_of_birth || null,
    gender: d.gender || null,
    nationality: d.nationality || null,
    ethnicity: d.ethnicity || null,
    religion: d.religion || null,
    marital_status: d.marital_status || null,
    children_count: d.children_count !== undefined && d.children_count !== '' ? parseInt(String(d.children_count), 10) || 0 : null,
    education_level: d.education_level || null,
    major: d.major || null,
    national_id: d.national_id || null,
    national_id_issue_date: d.national_id_issue_date || null,
    national_id_issue_place: d.national_id_issue_place || null,
    home_address: d.home_address || null,
    temporary_address: d.temporary_address || null,
    hire_date: d.hire_date || null,
    bank_account_no: d.bank_account_no || null,
    bank_name: d.bank_name || null,
    bank_account_name: d.bank_account_name || null,
    vehicle_type: d.vehicle_type && d.vehicle_type !== 'Không có' ? d.vehicle_type : null,
    vehicle_plate: d.vehicle_plate || null,
    vehicle_model: d.vehicle_model || null,
    emergency_contact_name: d.emergency_contact_name || null,
    emergency_contact_relationship: d.emergency_contact_relationship || null,
    emergency_contact_phone: d.emergency_contact_phone || null,
    emergency_contact_address: d.emergency_contact_address || null,
    emergency_contact_2_name: d.emergency_contact_2_name || null,
    emergency_contact_2_relationship: d.emergency_contact_2_relationship || null,
    emergency_contact_2_phone: d.emergency_contact_2_phone || null,
    emergency_contact_2_address: d.emergency_contact_2_address || null,
  };
  if (d.telegram_id) {
    personal.telegram_chat_id = String(d.telegram_id).trim();
    personal.telegram_enabled = true;
  }
  // Hình thức làm việc do QTV chọn lúc duyệt (không bắt buộc — bỏ trống thì C&B bổ sung sau).
  if (opts.employment_type_id) {
    personal.employment_type_id = opts.employment_type_id;
    personal.employment_type = opts.employment_type || null;
  }

  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  for (const [col, val] of Object.entries(personal)) {
    sets.push(`"${col}" = $${i++}`);
    params.push(val);
  }
  params.push(newUserId);
  await execute(`UPDATE users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i}`, params);

  // 3. Hồ sơ nháp → chính thức (gắn vào user mới)
  await execute(
    `UPDATE hr_documents SET employee_id = $2, is_draft = false
     WHERE employee_id = $1 AND is_draft = true AND deleted_at IS NULL`,
    [id, newUserId]
  );

  // 4. Đánh dấu submission approved
  const row = await queryOne<OnboardingSubmission>(
    `UPDATE onboarding_submissions
     SET status = 'approved', approved_by = $2, approved_at = NOW(), user_id = $3,
         data = data || $4::jsonb, updated_at = NOW()
     WHERE id = $1
     RETURNING ${SUBMISSION_COLUMNS}`,
    [id, adminId, newUserId, JSON.stringify({ working_email: opts.workingEmail.trim().toLowerCase() })]
  );

  // 5. Chào mừng nhân sự mới (in-app + Telegram qua engine — nội dung sửa qua UI).
  //    User vừa tạo đã được set telegram_chat_id/telegram_enabled ở bước 2 nên engine
  //    tự phân giải kênh Telegram theo newUserId.
  notify('onboarding.welcome', { name: d.full_name || sub.candidate_name }, { recipients: [newUserId] })
    .catch((err) => console.error('[Onboarding] welcome notify error:', err));

  // 6. Báo lại bộ phận Tuyển Dụng đã duyệt xong
  notifyOnboardingApproved(row, adminId).catch((e) => console.error('[approveSubmission] notify error:', e));

  return { submission: row as OnboardingSubmission, userId: newUserId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hồ sơ đính kèm (nháp) của một submission
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lưu một tệp đính kèm cho submission (hồ sơ NHÁP).
 * Dùng chung infra hr_documents: employee_id = id submission, is_draft = true.
 * Khi QTV duyệt (onboarding) → chuyển sang user_id + is_draft=false.
 */
export async function saveSubmissionAttachment(
  submissionId: string,
  file: { fileName: string; mimeType: string | null; buffer: Buffer },
  candidateName: string,
  docTypeId: string | null = null
): Promise<{ id: string; file_name: string; size_bytes: number | null }> {
  const row = await createHrDocument({
    employeeId: submissionId,
    docTypeId,
    title: `[Form] ${candidateName}`,
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: file.buffer.length,
    buffer: file.buffer,
    uploadedBy: null,
  });
  await execute(`UPDATE hr_documents SET is_draft = true WHERE id = $1`, [row.id]);
  return { id: row.id, file_name: row.file_name, size_bytes: row.size_bytes };
}

export async function listSubmissionAttachments(submissionId: string): Promise<
  { id: string; file_name: string; mime_type: string | null; size_bytes: number | null; created_at: string }[]
> {
  return query(
    `SELECT id, file_name, mime_type, size_bytes, created_at
     FROM hr_documents
     WHERE employee_id = $1 AND is_draft = true AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [submissionId]
  );
}

/** Dữ liệu tổ chức cho landing page public (chỉ id + name, không nhạy cảm). */
export async function getPublicOrgData(): Promise<{
  companies: { id: string; name: string }[];
  departments: { id: string; name: string; company_id: string; parent_department_id: string | null }[];
  subDepartments: { id: string; name: string; department_id: string }[];
  positions: { id: string; name: string; company_id: string }[];
}> {
  const [companies, departments, subDepartments, positions] = await Promise.all([
    query<{ id: string; name: string }>(`SELECT id, name FROM companies WHERE is_active = true ORDER BY name`),
    query<{ id: string; name: string; company_id: string; parent_department_id: string | null }>(
      `SELECT id, name, company_id, parent_department_id FROM departments ORDER BY name`
    ),
    query<{ id: string; name: string; department_id: string }>(
      `SELECT id, name, department_id FROM sub_departments ORDER BY name`
    ),
    query<{ id: string; name: string; company_id: string }>(
      `SELECT id, name, company_id FROM positions WHERE is_active = true ORDER BY name`
    ),
  ]);
  return { companies, departments, subDepartments, positions };
}
