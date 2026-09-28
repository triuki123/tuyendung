/**
 * Offboarding Service — Quy Trình Nghỉ Việc (Nguồn Nhân Lực)
 *
 * Luồng: nhân sự gửi ticket xin nghỉ / HCNS nhận yêu cầu ngoài
 *        → HCNS tạo quy trình (snapshot checklist từ cấu hình, tự bung từng tài sản đang gán)
 *        → check từng đầu mục → khi đủ đầu mục bắt buộc: HCNS xác nhận hoàn tất
 *        → hệ thống inactive tài khoản ngay lập tức + đăng xuất mọi phiên + set left_date.
 */

import { query, queryOne, execute, withTransaction, buildInsert } from '@/lib/db';
import { vnUnaccent } from '@/lib/db/vnSearch';
import { deactivateUser } from '@/lib/services/usersService';
import { uploadBufferAsMedia, getMediaBuffer } from '@/lib/services/mediaService';

export type OffboardingReason = 'resignation' | 'termination' | 'contract_end' | 'retirement' | 'other';
export type OffboardingStatus = 'in_progress' | 'completed' | 'cancelled';

export interface OffboardingTemplate {
  id: string;
  title: string;
  description: string | null;
  category: string;
  sort_order: number;
  enabled: boolean;
  required: boolean;
  auto_type: string | null;
  is_system: boolean;
  assignee_id: string | null;
  assignee_name?: string | null;
  assignee_avatar?: string | null;
}

export interface OffboardingItem {
  id: string;
  process_id: string;
  template_id: string | null;
  title: string;
  description: string | null;
  category: string;
  sort_order: number;
  required: boolean;
  asset_id: string | null;
  is_done: boolean;
  done_by: string | null;
  done_by_name?: string | null;
  done_at: string | null;
  note: string | null;
  assignee_id: string | null;
  assignee_name?: string | null;
  assignee_avatar?: string | null;
}

export interface OffboardingProcess {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  user_avatar?: string | null;
  user_company_id?: string | null;
  department_name?: string | null;
  sub_department_name?: string | null;
  company_name?: string | null;
  job_title_name?: string | null;
  reason: OffboardingReason;
  reason_note: string | null;
  last_working_date: string | null;
  source_ticket_id: string | null;
  status: OffboardingStatus;
  created_by: string | null;
  created_by_name?: string | null;
  completed_by: string | null;
  completed_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  total_items?: number;
  done_items?: number;
  items?: OffboardingItem[];
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// JOIN chung: thông tin nhân sự + tiến độ checklist
const PROCESS_SELECT = `
  SELECT p.*,
         to_char(p.last_working_date, 'YYYY-MM-DD') AS last_working_date,
         u.name  AS user_name,
         u.email AS user_email,
         u.avatar AS user_avatar,
         u.company_id::text AS user_company_id,
         d.name  AS department_name,
         sd.name AS sub_department_name,
         c.name  AS company_name,
         COALESCE(pos.name, jt.title) AS job_title_name,
         cb.name AS created_by_name,
         (SELECT COUNT(*) FROM offboarding_checklist_items i WHERE i.process_id = p.id)::int AS total_items,
         (SELECT COUNT(*) FROM offboarding_checklist_items i WHERE i.process_id = p.id AND i.is_done)::int AS done_items
  FROM offboarding_processes p
  LEFT JOIN users u       ON u.id::text = p.user_id
  LEFT JOIN departments d ON d.id::text = u.department_id::text
  LEFT JOIN sub_departments sd ON sd.id::text = u.sub_department_id::text
  LEFT JOIN companies c   ON c.id::text = u.company_id::text
  LEFT JOIN positions pos ON pos.id::text = u.position_id::text
  LEFT JOIN job_titles jt ON jt.id::text = u.job_title_id::text
  LEFT JOIN users cb      ON cb.id::text = p.created_by`;

// ─────────────────────────────────────────────────────────────────────────────
// Cấu hình checklist (templates)
// ─────────────────────────────────────────────────────────────────────────────

/** Toàn bộ đầu mục cấu hình, sắp theo category + sort_order. */
export async function listTemplates(): Promise<OffboardingTemplate[]> {
  return query<OffboardingTemplate>(
    `SELECT t.id, t.title, t.description, t.category, t.sort_order, t.enabled, t.required, t.auto_type, t.is_system,
            t.assignee_id::text AS assignee_id, u.name AS assignee_name, u.avatar AS assignee_avatar
     FROM offboarding_checklist_templates t
     LEFT JOIN users u ON u.id = t.assignee_id
     ORDER BY CASE t.category WHEN 'hcns' THEN 1 WHEN 'asset' THEN 2 WHEN 'it' THEN 3 WHEN 'finance' THEN 4 ELSE 5 END, t.sort_order`
  );
}

/** Thêm đầu mục mới vào cấu hình. */
export async function createTemplate(input: {
  title: string; description?: string | null; category?: string; required?: boolean;
}): Promise<OffboardingTemplate> {
  const max = await queryOne<{ m: number }>(
    `SELECT COALESCE(MAX(sort_order), 0)::int AS m FROM offboarding_checklist_templates WHERE category = $1`,
    [input.category || 'hcns']
  );
  const row = await queryOne<OffboardingTemplate>(
    `INSERT INTO offboarding_checklist_templates (id, title, description, category, sort_order, required)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [genId('obt'), input.title.trim(), input.description?.trim() || null,
     input.category || 'hcns', (max?.m || 0) + 10, input.required !== false]
  );
  if (!row) throw new Error('Không tạo được đầu mục');
  return row;
}

/** Cập nhật đầu mục cấu hình (title/description/category/enabled/required/sort_order/assignee_id). */
export async function updateTemplate(
  id: string,
  input: { title?: string; description?: string | null; category?: string; enabled?: boolean; required?: boolean; sort_order?: number; assignee_id?: string | null }
): Promise<OffboardingTemplate | null> {
  const sets: string[] = ['updated_at = NOW()'];
  const params: any[] = [];
  let i = 1;
  if (input.title !== undefined) { sets.push(`title = $${i++}`); params.push(input.title.trim()); }
  if (input.description !== undefined) { sets.push(`description = $${i++}`); params.push(input.description?.trim() || null); }
  if (input.category !== undefined) { sets.push(`category = $${i++}`); params.push(input.category); }
  if (input.enabled !== undefined) { sets.push(`enabled = $${i++}`); params.push(input.enabled); }
  if (input.required !== undefined) { sets.push(`required = $${i++}`); params.push(input.required); }
  if (input.sort_order !== undefined) { sets.push(`sort_order = $${i++}`); params.push(input.sort_order); }
  if (input.assignee_id !== undefined) { sets.push(`assignee_id = $${i++}`); params.push(input.assignee_id || null); }
  params.push(id);
  const row = await queryOne<OffboardingTemplate>(
    `UPDATE offboarding_checklist_templates SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, title, description, category, sort_order, enabled, required, auto_type, is_system, assignee_id::text AS assignee_id`,
    params
  );
  if (!row) return null;
  if (row.assignee_id) {
    const u = await queryOne<{ name: string; avatar: string | null }>(`SELECT name, avatar FROM users WHERE id = $1::uuid`, [row.assignee_id]);
    row.assignee_name = u?.name || null;
    row.assignee_avatar = u?.avatar || null;
  }
  return row;
}

/** Xóa đầu mục cấu hình. Đầu mục hệ thống không xóa được (chỉ tắt enabled). */
export async function deleteTemplate(id: string): Promise<void> {
  const tpl = await queryOne<{ is_system: boolean }>(
    `SELECT is_system FROM offboarding_checklist_templates WHERE id = $1`, [id]
  );
  if (!tpl) throw new Error('Đầu mục không tồn tại');
  if (tpl.is_system) throw new Error('Đầu mục hệ thống không thể xóa — chỉ có thể tắt');
  await execute(`DELETE FROM offboarding_checklist_templates WHERE id = $1`, [id]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Quy trình
// ─────────────────────────────────────────────────────────────────────────────

/** Danh sách quy trình (mới nhất trước), lọc theo trạng thái nếu có. */
export async function listProcesses(status?: string, archived = false, companyId?: string | null): Promise<OffboardingProcess[]> {
  const conditions: string[] = [`p.is_archived = ${archived}`];
  const vals: unknown[] = [];
  if (status) { conditions.push(`p.status = $${vals.length + 1}`); vals.push(status); }
  // Scope theo công ty của nhân viên — NULL company_id (data cũ) luôn hiển thị
  if (companyId) { conditions.push(`(u.company_id::text = $${vals.length + 1} OR u.company_id IS NULL)`); vals.push(companyId); }
  return query<OffboardingProcess>(
    `${PROCESS_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY p.created_at DESC`,
    vals
  );
}

/** Đếm quy trình theo trạng thái (cho stat cards). */
export async function countByStatus(companyId?: string | null): Promise<Record<string, number>> {
  const conditions: string[] = [];
  const vals: unknown[] = [];
  if (companyId) {
    conditions.push(`(u.company_id::text = $${vals.length + 1} OR u.company_id IS NULL)`);
    vals.push(companyId);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await query<{ status: string; cnt: string }>(
    `SELECT p.status, COUNT(*) AS cnt
       FROM offboarding_processes p
       LEFT JOIN users u ON u.id::text = p.user_id
     ${where}
     GROUP BY p.status`,
    vals
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = Number(r.cnt);
  return out;
}

/** Chi tiết 1 quy trình kèm toàn bộ checklist. */
export async function getProcess(id: string): Promise<OffboardingProcess | null> {
  const proc = await queryOne<OffboardingProcess>(`${PROCESS_SELECT} WHERE p.id = $1`, [id]);
  if (!proc) return null;
  proc.items = await query<OffboardingItem>(
    `SELECT i.*, du.name AS done_by_name, au.name AS assignee_name, au.avatar AS assignee_avatar, i.assignee_id::text AS assignee_id
     FROM offboarding_checklist_items i
     LEFT JOIN users du ON du.id::text = i.done_by
     LEFT JOIN users au ON au.id = i.assignee_id
     WHERE i.process_id = $1
     ORDER BY CASE i.category WHEN 'hcns' THEN 1 WHEN 'asset' THEN 2 WHEN 'it' THEN 3 WHEN 'finance' THEN 4 ELSE 5 END, i.sort_order, i.created_at`,
    [id]
  );
  return proc;
}

/**
 * Tạo quy trình nghỉ việc: snapshot checklist từ cấu hình (enabled),
 * đầu mục auto_type='assets' được bung thành từng item per tài sản đang gán.
 */
export async function createProcess(input: {
  userId: string;
  reason: OffboardingReason;
  reasonNote?: string | null;
  lastWorkingDate?: string | null;
  sourceTicketId?: string | null;
  createdBy?: string | null;
}): Promise<OffboardingProcess> {
  const target = await queryOne<{ id: string; name: string; status: string }>(
    `SELECT id, name, status FROM users WHERE id::text = $1`, [input.userId]
  );
  if (!target) throw new Error('Nhân sự không tồn tại');
  if (target.status === 'inactive') throw new Error('Nhân sự này đã nghỉ việc (tài khoản inactive)');

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM offboarding_processes WHERE user_id = $1 AND status = 'in_progress'`, [input.userId]
  );
  if (existing) throw new Error('Nhân sự này đã có quy trình nghỉ việc đang xử lý');

  const templates = (await listTemplates()).filter((t) => t.enabled);
  const assets = await query<{ id: string; code: string | null; name: string }>(
    `SELECT id::text AS id, code, name FROM assets WHERE assigned_to::text = $1 ORDER BY name`,
    [input.userId]
  );

  const processId = genId('obp');
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO offboarding_processes (id, user_id, reason, reason_note, last_working_date, source_ticket_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [processId, input.userId, input.reason, input.reasonNote || null,
       input.lastWorkingDate || null, input.sourceTicketId?.trim() || null, input.createdBy || null]
    );
    for (const t of templates) {
      if (t.auto_type === 'assets') {
        if (assets.length === 0) continue; // không có tài sản → bỏ qua nhóm thu hồi
        let order = t.sort_order;
        for (const a of assets) {
          await client.query(
            `INSERT INTO offboarding_checklist_items
               (id, process_id, template_id, title, description, category, sort_order, required, asset_id, assignee_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [genId('obi'), processId, t.id,
             `Thu hồi: ${a.name}${a.code ? ` (${a.code})` : ''}`,
             'Tài sản đang cấp phát — kiểm tra tình trạng khi thu hồi',
             t.category, order++, t.required, a.id, t.assignee_id || null]
          );
        }
      } else {
        await client.query(
          `INSERT INTO offboarding_checklist_items
             (id, process_id, template_id, title, description, category, sort_order, required, assignee_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [genId('obi'), processId, t.id, t.title, t.description, t.category, t.sort_order, t.required, t.assignee_id || null]
        );
      }
    }
  });

  const proc = await getProcess(processId);
  if (!proc) throw new Error('Không tạo được quy trình');
  return proc;
}

/** Check / bỏ check 1 đầu mục (kèm ghi chú). Chỉ khi quy trình đang xử lý. */
export async function toggleItem(
  processId: string, itemId: string, isDone: boolean, actorId: string | null, note?: string | null
): Promise<OffboardingItem | null> {
  const proc = await queryOne<{ status: string }>(
    `SELECT status FROM offboarding_processes WHERE id = $1`, [processId]
  );
  if (!proc) throw new Error('Quy trình không tồn tại');
  if (proc.status !== 'in_progress') throw new Error('Quy trình đã kết thúc — không thể thay đổi checklist');

  const updated = await queryOne<OffboardingItem>(
    `UPDATE offboarding_checklist_items
     SET is_done = $1,
         done_by = CASE WHEN $1 THEN $2 ELSE NULL END,
         done_at = CASE WHEN $1 THEN NOW() ELSE NULL END,
         note    = COALESCE($3, note)
     WHERE id = $4 AND process_id = $5
     RETURNING *`,
    [isDone, actorId, note !== undefined ? note : null, itemId, processId]
  );
  if (updated?.done_by) {
    const u = await queryOne<{ name: string }>(`SELECT name FROM users WHERE id::text = $1`, [updated.done_by]);
    updated.done_by_name = u?.name || null;
  }
  return updated;
}

/**
 * Hoàn tất quy trình: yêu cầu mọi đầu mục bắt buộc đã check.
 * → inactive tài khoản NGAY (set left_date = ngày làm việc cuối nếu có) + hết hạn mọi phiên đăng nhập.
 */
export async function completeProcess(
  id: string, actorId: string | null, opts?: { skipAttachment?: boolean }
): Promise<OffboardingProcess> {
  const proc = await getProcess(id);
  if (!proc) throw new Error('Quy trình không tồn tại');
  if (proc.status !== 'in_progress') throw new Error('Quy trình đã kết thúc trước đó');

  const missing = (proc.items || []).filter((i) => i.required && !i.is_done);
  if (missing.length > 0) {
    throw new Error(`Còn ${missing.length} đầu mục bắt buộc chưa hoàn thành: ${missing.map((m) => m.title).slice(0, 3).join('; ')}${missing.length > 3 ? '…' : ''}`);
  }

  // Mặc định BẮT BUỘC đính kèm ≥1 hồ sơ nghỉ việc. Trường hợp nghỉ sớm (không có biên bản
  // bàn giao) → HCNS chủ động bỏ qua qua skipAttachment.
  if (!opts?.skipAttachment) {
    const attachCount = await countProcessAttachments(id);
    if (attachCount === 0) {
      throw new Error('Cần đính kèm ít nhất 1 hồ sơ nghỉ việc trước khi hoàn tất quy trình.');
    }
  }

  // 1. Inactive tài khoản (deactivateUser tự set left_date = hôm nay + audit log)
  await deactivateUser(proc.user_id, actorId || undefined);
  // Nếu HCNS đã khai ngày làm việc cuối → dùng ngày đó làm left_date chính xác
  if (proc.last_working_date) {
    await execute(
      `UPDATE users SET left_date = $1 WHERE id::text = $2`,
      [String(proc.last_working_date).slice(0, 10), proc.user_id]
    );
  }
  // 2. Hết hạn mọi phiên đăng nhập đang mở
  await execute(
    `UPDATE user_sessions SET expires_at = NOW() WHERE user_id::text = $1 AND expires_at > NOW()`,
    [proc.user_id]
  ).catch((e) => console.error('[offboarding] expire sessions error:', e));
  // 3. Chốt hồ sơ nghỉ việc (nháp → chính thức) gắn vào hồ sơ nhân sự
  await finalizeProcessAttachments(id, proc.user_id).catch((e) => console.error('[offboarding] finalize docs error:', e));
  // 4. Thu hồi tài sản: gỡ assigned_to + đưa về "Sẵn sàng" + ghi lịch sử
  await recoverAssetsOnOffboarding(proc.user_id, actorId).catch((e) => console.error('[offboarding] recover assets error:', e));
  // 5. Đóng quy trình
  await execute(
    `UPDATE offboarding_processes
     SET status = 'completed', completed_by = $1, completed_at = NOW(), updated_at = NOW()
     WHERE id = $2`,
    [actorId, id]
  );

  const updated = await getProcess(id);
  if (!updated) throw new Error('Không đọc lại được quy trình');
  return updated;
}

/** Hủy quy trình (nhân sự rút đơn, tạo nhầm…). Không đụng vào tài khoản. */
export async function cancelProcess(id: string, actorId: string | null, reason: string): Promise<OffboardingProcess> {
  const proc = await queryOne<{ status: string }>(
    `SELECT status FROM offboarding_processes WHERE id = $1`, [id]
  );
  if (!proc) throw new Error('Quy trình không tồn tại');
  if (proc.status !== 'in_progress') throw new Error('Quy trình đã kết thúc trước đó');
  await execute(
    `UPDATE offboarding_processes
     SET status = 'cancelled', cancelled_by = $1, cancelled_at = NOW(), cancel_reason = $2, updated_at = NOW()
     WHERE id = $3`,
    [actorId, reason?.trim() || null, id]
  );
  const updated = await getProcess(id);
  if (!updated) throw new Error('Không đọc lại được quy trình');
  return updated;
}

/** Xóa vĩnh viễn quy trình và toàn bộ checklist items liên quan. */
export async function deleteProcess(id: string): Promise<void> {
  const proc = await queryOne<{ id: string }>(`SELECT id FROM offboarding_processes WHERE id = $1`, [id]);
  if (!proc) throw new Error('Quy trình không tồn tại');
  await execute(`DELETE FROM offboarding_checklist_items WHERE process_id = $1`, [id]);
  await execute(`DELETE FROM offboarding_processes WHERE id = $1`, [id]);
}

/** Lưu trữ quy trình (ẩn khỏi danh sách chính). */
export async function archiveProcess(id: string, actorId: string | null): Promise<void> {
  await execute(
    `UPDATE offboarding_processes SET is_archived = TRUE, archived_at = NOW(), archived_by = $1 WHERE id = $2`,
    [actorId, id]
  );
}

/** Khôi phục quy trình từ lưu trữ. */
export async function restoreProcess(id: string): Promise<void> {
  await execute(
    `UPDATE offboarding_processes SET is_archived = FALSE, archived_at = NULL, archived_by = NULL WHERE id = $1`,
    [id]
  );
}

/** Cập nhật thông tin cơ bản của quy trình (sửa khi tạo nhầm). */
export async function updateProcessInfo(id: string, fields: {
  reason?: string; reasonNote?: string | null; lastWorkingDate?: string | null; sourceTicketId?: string | null;
}): Promise<OffboardingProcess> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (fields.reason !== undefined) { sets.push(`reason = $${i++}`); vals.push(fields.reason); }
  if (fields.reasonNote !== undefined) { sets.push(`reason_note = $${i++}`); vals.push(fields.reasonNote); }
  if (fields.lastWorkingDate !== undefined) { sets.push(`last_working_date = $${i++}`); vals.push(fields.lastWorkingDate || null); }
  if (fields.sourceTicketId !== undefined) { sets.push(`source_ticket_id = $${i++}`); vals.push(fields.sourceTicketId || null); }
  if (!sets.length) throw new Error('Không có trường nào cần cập nhật');
  sets.push(`updated_at = NOW()`);
  vals.push(id);
  await execute(`UPDATE offboarding_processes SET ${sets.join(', ')} WHERE id = $${i}`, vals);
  const updated = await getProcess(id);
  if (!updated) throw new Error('Không đọc lại được quy trình');
  return updated;
}

/** Danh sách quy trình đã lưu trữ. */
export async function listArchivedProcesses(): Promise<OffboardingProcess[]> {
  return listProcesses(undefined, true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Hỗ trợ tạo quy trình
// ─────────────────────────────────────────────────────────────────────────────

/** Tìm nhân sự đang active để tạo quy trình (kèm số tài sản đang gán + cờ đã có quy trình). */
export async function searchEligibleUsers(q: string): Promise<{
  id: string; name: string; email: string; avatar: string | null;
  department_name: string | null; company_name: string | null; job_title_name: string | null;
  asset_count: number; has_active_process: boolean;
}[]> {
  // Tìm KHÔNG DẤU: gõ "nguyen van" vẫn ra "Nguyễn Văn" (trước đây LIKE có phân biệt dấu
  // nên phải gõ đúng dấu mới thấy — ô tìm gần như không dùng được).
  // Khoảng trắng thừa giữa các từ cũng được gom lại để "nguyen  van" vẫn khớp.
  const kw = `%${q.trim().replace(/\s+/g, ' ')}%`;
  return query(
    `SELECT u.id::text AS id, u.name, u.email, u.avatar,
            d.name AS department_name, c.name AS company_name, COALESCE(pos.name, jt.title) AS job_title_name,
            (SELECT COUNT(*) FROM assets a WHERE a.assigned_to::text = u.id::text)::int AS asset_count,
            EXISTS (SELECT 1 FROM offboarding_processes p WHERE p.user_id = u.id::text AND p.status = 'in_progress') AS has_active_process
     FROM users u
     LEFT JOIN departments d ON d.id::text = u.department_id::text
     LEFT JOIN companies c   ON c.id::text = u.company_id::text
     LEFT JOIN positions pos ON pos.id::text = u.position_id::text
  LEFT JOIN job_titles jt ON jt.id::text = u.job_title_id::text
     WHERE u.status = 'active'
       AND (${vnUnaccent('u.name')}  LIKE ${vnUnaccent('$1')}
         OR ${vnUnaccent('u.email')} LIKE ${vnUnaccent('$1')})
     ORDER BY u.name
     LIMIT 20`,
    [kw]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hồ sơ nghỉ việc đính kèm — lưu vào hr_documents (nháp), chốt khi hoàn tất
// ─────────────────────────────────────────────────────────────────────────────

const TERMINATION_DOC_TYPE = 'hdoc_termination';

export interface ObAttachmentMeta {
  id: string; file_name: string; mime_type: string | null; size_bytes: number | null;
  uploaded_by: string | null; uploaded_by_name?: string | null; created_at: string;
}

/** Đính kèm 1 hồ sơ nghỉ việc vào quy trình (lưu nháp: employee_id = process_id). */
export async function addProcessAttachment(
  processId: string,
  file: { fileName: string; mimeType: string | null; buffer: Buffer },
  uploadedBy: string | null
): Promise<ObAttachmentMeta> {
  const size = file.buffer.length;
  if (size <= 0 || size > 10 * 1024 * 1024) throw new Error('Kích thước tệp không hợp lệ (0 - 10MB)');
  const id = `hrd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Dual-write: có S3 → media_id + content NULL; chưa cấu hình → BYTEA như cũ.
  const media = await uploadBufferAsMedia({
    buffer: file.buffer,
    mimeType: file.mimeType || 'application/octet-stream',
    scope: 'hr_documents',
    originalName: file.fileName,
    uploaderId: uploadedBy,
    sourceId: id,
  });

  const row = await queryOne<ObAttachmentMeta>(
    `INSERT INTO hr_documents
       (id, employee_id, doc_type_id, title, file_name, mime_type, size_bytes, content, uploaded_by, is_draft, source_offboarding_id, media_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $2, $10)
     RETURNING id, file_name, mime_type, size_bytes, uploaded_by, created_at`,
    [id, processId, TERMINATION_DOC_TYPE, file.fileName, file.fileName, file.mimeType, size,
     media ? null : file.buffer, uploadedBy, media ? media.id : null]
  );
  return row as ObAttachmentMeta;
}

/** Danh sách hồ sơ đính kèm của quy trình (metadata). */
export async function listProcessAttachments(processId: string): Promise<ObAttachmentMeta[]> {
  return query<ObAttachmentMeta>(
    `SELECT d.id, d.file_name, d.mime_type, d.size_bytes, d.uploaded_by, d.created_at,
            u.name AS uploaded_by_name
       FROM hr_documents d
       LEFT JOIN users u ON u.id::text = d.uploaded_by
      WHERE d.source_offboarding_id = $1 AND d.deleted_at IS NULL
      ORDER BY d.created_at DESC`,
    [processId]
  );
}

export async function countProcessAttachments(processId: string): Promise<number> {
  const r = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM hr_documents WHERE source_offboarding_id = $1 AND deleted_at IS NULL`,
    [processId]
  );
  return Number(r?.cnt || 0);
}

/** Nội dung 1 tệp (có kiểm thuộc đúng quy trình). */
export async function getProcessAttachmentContent(
  processId: string, docId: string
): Promise<{ file_name: string; mime_type: string | null; content: Buffer } | null> {
  const row = await queryOne<{ file_name: string; mime_type: string | null; content: Buffer | null; media_id: string | null }>(
    `SELECT file_name, mime_type, content, media_id FROM hr_documents
      WHERE id = $1 AND source_offboarding_id = $2 AND deleted_at IS NULL`,
    [docId, processId]
  );
  if (!row) return null;
  // Dual-read: file mới nằm trên MinIO (media_id), file cũ vẫn là BYTEA.
  if (row.media_id) {
    const m = await getMediaBuffer(row.media_id);
    if (m) return { file_name: row.file_name, mime_type: row.mime_type, content: m.buffer };
  }
  if (!row.content) return null;
  return { file_name: row.file_name, mime_type: row.mime_type, content: row.content };
}

/** Trả về company_id của user trong process (để validate ownership). */
export async function getProcessOwnerCompanyId(processId: string): Promise<string | null> {
  const row = await queryOne<{ user_company_id: string | null }>(
    `SELECT u.company_id::text AS user_company_id
       FROM offboarding_processes p
       LEFT JOIN users u ON u.id::text = p.user_id
      WHERE p.id = $1`,
    [processId]
  );
  return row?.user_company_id ?? null;
}

/** Xoá (mềm) 1 tệp đính kèm của quy trình. */
export async function deleteProcessAttachment(processId: string, docId: string): Promise<boolean> {
  const n = await execute(
    `UPDATE hr_documents SET deleted_at = NOW()
      WHERE id = $1 AND source_offboarding_id = $2 AND deleted_at IS NULL`,
    [docId, processId]
  );
  return n > 0;
}

/** Chốt hồ sơ nháp → chính thức, gắn vào hồ sơ nhân sự thật. */
async function finalizeProcessAttachments(processId: string, userId: string): Promise<void> {
  await execute(
    `UPDATE hr_documents SET employee_id = $1, is_draft = false
      WHERE source_offboarding_id = $2 AND is_draft = true AND deleted_at IS NULL`,
    [userId, processId]
  );
}

/** Thu hồi mọi tài sản đang gán cho nhân sự nghỉ: gỡ assigned_to + về "Sẵn sàng" + ghi lịch sử. */
async function recoverAssetsOnOffboarding(userId: string, actorId: string | null): Promise<void> {
  const assets = await query<{ id: string; code: string; name: string; status: string }>(
    `SELECT id, code, name, status FROM assets WHERE assigned_to::text = $1`,
    [userId]
  );
  for (const a of assets) {
    await execute(
      `UPDATE assets
         SET assigned_to = NULL, assigned_to_name = NULL,
             status = CASE WHEN status = 'assigned' THEN 'available' ELSE status END,
             updated_at = NOW()
       WHERE id = $1`,
      [a.id]
    );
    try {
      const { text, params } = buildInsert('audit_logs', {
        admin_id: actorId || 'System',
        action: 'asset_recovered',
        details: `Thu hồi khi offboarding: ${a.name} (${a.code})`,
        asset_id: a.id,
        asset_code: a.code,
        asset_name: a.name,
        asset_type: 'hardware',
        created_at: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      });
      await queryOne(text, params);
    } catch (e) {
      console.warn('[offboarding] audit asset recover error:', e);
    }
  }
}

/** Việc còn tồn của nhân sự (cảnh báo trước khi hoàn tất) — đếm an toàn từng loại. */
export async function getPendingWork(userId: string): Promise<{ tickets: number; tasks: number; bookings: number }> {
  const safe = async (sql: string): Promise<number> => {
    try {
      const r = await queryOne<{ cnt: string }>(sql, [userId]);
      return Number(r?.cnt || 0);
    } catch { return 0; }
  };
  const [tickets, tasks, bookings] = await Promise.all([
    safe(`SELECT COUNT(*) AS cnt FROM tickets WHERE status IN ('open','in_progress') AND (assigned_to::text = $1 OR created_by::text = $1)`),
    safe(`SELECT COUNT(*) AS cnt FROM tasks WHERE status IN ('todo','in_progress') AND assigned_to::text = $1`),
    safe(`SELECT COUNT(*) AS cnt FROM room_bookings WHERE status NOT IN ('cancelled','rejected','completed') AND requested_by::text = $1 AND COALESCE(end_time, booking_date::timestamptz, NOW()) >= NOW()`),
  ]);
  return { tickets, tasks, bookings };
}
