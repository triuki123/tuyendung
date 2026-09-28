/**
 * Task Attachments Service Layer
 * Lưu tệp đính kèm của task/bình luận lên ĐĨA server (volume), metadata trong DB.
 * Nội dung file KHÔNG lưu trong Postgres — chỉ lưu đường dẫn (stored_name).
 */

import { promises as fs } from 'fs';
import path from 'path';
import { query, queryOne, execute } from '@/lib/db';

/** Thư mục gốc lưu tệp task. Có thể override bằng env TASK_UPLOAD_DIR. */
export const TASK_UPLOAD_DIR =
  process.env.TASK_UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'tasks');

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB / tệp

export interface TaskAttachment {
  id: string;
  task_id: string;
  comment_id: string | null;
  file_name: string;
  stored_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
  deleted_at?: string | null;
}

export interface AttachmentCreateInput {
  taskId: string;
  commentId?: string | null;
  fileName: string;
  mimeType?: string | null;
  uploadedBy?: string | null;
  uploadedByName?: string | null;
  buffer: Buffer;
}

/** Sinh tên file an toàn để lưu trên đĩa (tránh path traversal/trùng tên). */
function buildStoredName(id: string, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, '');
  return `${id}${ext}`;
}

/**
 * Lưu một tệp lên đĩa và ghi metadata vào DB.
 * @returns metadata của attachment vừa tạo
 */
export async function createAttachment(
  data: AttachmentCreateInput
): Promise<TaskAttachment> {
  if (data.buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Tệp "${data.fileName}" vượt quá 10MB`);
  }

  const id = `att_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const storedName = buildStoredName(id, data.fileName);

  // Bảo đảm thư mục tồn tại rồi ghi file
  await fs.mkdir(TASK_UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(TASK_UPLOAD_DIR, storedName), data.buffer);

  try {
    await execute(
      `INSERT INTO task_attachments
         (id, task_id, comment_id, file_name, stored_name, mime_type, size_bytes, uploaded_by, uploaded_by_name, created_at)
       VALUES ($1, $2::uuid, $3::text, $4, $5, $6::text, $7, $8::uuid, $9::text, NOW())`,
      [
        id,
        data.taskId,
        data.commentId || null,
        data.fileName,
        storedName,
        data.mimeType || null,
        data.buffer.length,
        data.uploadedBy || null,
        data.uploadedByName || null,
      ]
    );

    // Emit realtime event để client update UI
    await execute(
      `SELECT pg_notify('entity_changed', json_build_object('type', 'insert', 'entity', 'task_attachment', 'entityId', $1::text, 'userId', $2::text)::text)`,
      [id, data.uploadedBy || null]
    );
  } catch (err) {
    // Rollback file nếu ghi DB lỗi để tránh tệp mồ côi
    await fs.unlink(path.join(TASK_UPLOAD_DIR, storedName)).catch(() => {});
    throw err;
  }

  const row = await queryOne<TaskAttachment>(
    'SELECT * FROM task_attachments WHERE id = $1',
    [id]
  );
  if (!row) throw new Error('Không tìm thấy attachment sau khi tạo');
  return row;
}

/**
 * Liệt kê tệp đính kèm của task (mặc định bỏ tệp đã xóa).
 * @param taskId Task ID
 * @param commentId Nếu truyền, chỉ lấy tệp của bình luận đó
 */
export async function getTaskAttachments(
  taskId: string,
  commentId?: string | null
): Promise<TaskAttachment[]> {
  let sql = `SELECT * FROM task_attachments WHERE task_id = $1 AND deleted_at IS NULL`;
  const params: (string | null)[] = [taskId];
  if (commentId !== undefined) {
    sql += commentId === null ? ` AND comment_id IS NULL` : ` AND comment_id = $2`;
    if (commentId !== null) params.push(commentId);
  }
  sql += ` ORDER BY created_at ASC`;
  return (await query<TaskAttachment>(sql, params)) || [];
}

/** Lấy một attachment theo ID (kể cả đã xóa mềm, để tải/audit). */
export async function getAttachment(id: string): Promise<TaskAttachment | null> {
  return queryOne<TaskAttachment>('SELECT * FROM task_attachments WHERE id = $1', [id]);
}

/** Đọc nội dung tệp từ đĩa theo metadata. */
export async function readAttachmentBuffer(att: TaskAttachment): Promise<Buffer> {
  return fs.readFile(path.join(TASK_UPLOAD_DIR, att.stored_name));
}

/**
 * Xóa mềm attachment (giữ tệp trên đĩa để audit). Trả về số dòng cập nhật.
 */
export async function deleteAttachment(id: string): Promise<number> {
  const result = await execute(
    'UPDATE task_attachments SET deleted_at = NOW() WHERE id = $1::text AND deleted_at IS NULL',
    [id]
  );

  // Emit realtime event để client update UI
  if (result > 0) {
    await execute(
      `SELECT pg_notify('entity_changed', json_build_object('type', 'delete', 'entity', 'task_attachment', 'entityId', $1::text)::text)`,
      [id]
    );
  }

  return result;
}
