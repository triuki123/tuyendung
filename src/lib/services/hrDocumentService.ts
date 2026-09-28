import { query, queryOne, execute } from '@/lib/db';
import { uploadBufferAsMedia, getMediaBuffer } from '@/lib/services/mediaService';

export interface HrDocumentMeta {
  id: string;
  employee_id: string;
  doc_type_id: string | null;
  title: string | null;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
  // joined
  doc_type_name?: string | null;
  employee_name?: string | null;
}

const DOC_SELECT = `
  SELECT d.id, d.employee_id, d.doc_type_id, d.title, d.file_name, d.mime_type,
         d.size_bytes, d.uploaded_by, d.created_at,
         t.name AS doc_type_name,
         u.name AS employee_name
    FROM hr_documents d
    LEFT JOIN hr_document_types t ON t.id = d.doc_type_id
    LEFT JOIN users u ON u.id::text = d.employee_id
   WHERE d.deleted_at IS NULL AND d.is_draft = false`;

/** Hồ sơ của một nhân viên (metadata, không kèm BYTEA). */
export async function listHrDocuments(employeeId: string): Promise<HrDocumentMeta[]> {
  return query<HrDocumentMeta>(`${DOC_SELECT} AND d.employee_id = $1 ORDER BY d.created_at DESC`, [employeeId]);
}

/** Tất cả hồ sơ — dùng cho C&B (HR admin). */
export async function listAllHrDocuments(opts: {
  docTypeId?: string;
  employeeIds?: string[];
  limit?: number;
  offset?: number;
} = {}): Promise<HrDocumentMeta[]> {
  const where: string[] = [];
  const params: any[] = [];
  if (opts.docTypeId) {
    params.push(opts.docTypeId);
    where.push(`d.doc_type_id = $${params.length}`);
  }
  if (opts.employeeIds) {
    if (opts.employeeIds.length === 0) return [];
    params.push(opts.employeeIds);
    where.push(`d.employee_id = ANY($${params.length})`);
  }
  const extra = where.length ? ` AND ${where.join(' AND ')}` : '';
  const limit = opts.limit ?? 200;
  const offset = opts.offset ?? 0;
  params.push(limit, offset);
  return query<HrDocumentMeta>(
    `${DOC_SELECT}${extra} ORDER BY d.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
}

export async function createHrDocument(data: {
  employeeId: string;
  docTypeId: string | null;
  title: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  buffer: Buffer;
  uploadedBy: string | null;
}): Promise<HrDocumentMeta> {
  // Validate file size
  if (data.sizeBytes <= 0 || data.sizeBytes > 10 * 1024 * 1024) {
    throw new Error('Kích thước tệp không hợp lệ (0 - 10MB)');
  }
  if (data.buffer.length !== data.sizeBytes) {
    throw new Error(`Kích thước tệp không khớp (${data.buffer.length} bytes vs ${data.sizeBytes} bytes)`);
  }

  const id = `hrd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Dual-write: có S3 → upload MinIO, lưu media_id + content NULL; chưa cấu hình → BYTEA như cũ.
  const media = await uploadBufferAsMedia({
    buffer: data.buffer,
    mimeType: data.mimeType || 'application/octet-stream',
    scope: 'hr_documents',
    originalName: data.fileName,
    uploaderId: data.uploadedBy,
    sourceId: id,
  });

  const row = await queryOne<HrDocumentMeta>(
    `INSERT INTO hr_documents
       (id, employee_id, doc_type_id, title, file_name, mime_type, size_bytes, content, uploaded_by, media_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, employee_id, doc_type_id, title, file_name, mime_type, size_bytes, uploaded_by, created_at`,
    [
      id, data.employeeId, data.docTypeId, data.title, data.fileName,
      data.mimeType, data.sizeBytes, media ? null : data.buffer, data.uploadedBy,
      media ? media.id : null,
    ]
  );
  return row as HrDocumentMeta;
}

export async function getHrDocumentContent(
  id: string
): Promise<{ file_name: string; mime_type: string | null; content: Buffer; employee_id: string } | null> {
  const row = await queryOne<{
    file_name: string; mime_type: string | null; content: Buffer | null;
    employee_id: string; media_id: string | null;
  }>(
    `SELECT file_name, mime_type, content, employee_id, media_id
       FROM hr_documents WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  if (!row) return null;
  // Dual-read: file mới nằm trên MinIO (media_id), file cũ vẫn là BYTEA.
  if (row.media_id) {
    const m = await getMediaBuffer(row.media_id);
    if (m) return { file_name: row.file_name, mime_type: row.mime_type, content: m.buffer, employee_id: row.employee_id };
  }
  if (!row.content) return null;
  return { file_name: row.file_name, mime_type: row.mime_type, content: row.content, employee_id: row.employee_id };
}

/** Lấy employee_id chủ sở hữu (để check quyền trước khi xóa). */
export async function getHrDocumentOwner(id: string): Promise<string | null> {
  const row = await queryOne<{ employee_id: string }>(
    `SELECT employee_id FROM hr_documents WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return row?.employee_id ?? null;
}

export async function softDeleteHrDocument(id: string): Promise<boolean> {
  // GHI CHÚ: KHÔNG softDeleteMedia ở đây — hr_documents là ĐÍCH của nhiều luồng copy-chia-sẻ
  // media_id (duyệt replace request, chuyển biên bản đánh giá, lưu trữ hợp đồng...), một media
  // có thể được nhiều bản ghi trỏ tới nên không xác định được an toàn để xoá mềm.
  const n = await execute(
    `UPDATE hr_documents SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return n > 0;
}

export interface DepartedPerson {
  id: string; name: string; email: string; avatar: string | null;
  department_name: string | null; company_name: string | null;
  left_date: string | null; doc_count: number;
}

/** Nhân sự đã nghỉ (status='inactive') kèm số hồ sơ — cho tab "Đã nghỉ / Lưu trữ". */
export async function listDepartedPersonnel(q = '', employeeIds?: string[]): Promise<DepartedPerson[]> {
  const kw = `%${q.trim().toLowerCase()}%`;
  const params: any[] = [q.trim(), kw];
  let employeeFilter = '';
  if (employeeIds) {
    if (employeeIds.length === 0) return [];
    params.push(employeeIds);
    employeeFilter = ` AND u.id::text = ANY($${params.length})`;
  }
  return query<DepartedPerson>(
    `SELECT u.id::text AS id, u.name, u.email, u.avatar, u.left_date,
            d.name AS department_name, c.name AS company_name,
            (SELECT COUNT(*) FROM hr_documents h
               WHERE h.employee_id = u.id::text AND h.deleted_at IS NULL AND h.is_draft = false)::int AS doc_count
       FROM users u
       LEFT JOIN departments d ON d.id::text = u.department_id::text
       LEFT JOIN companies c   ON c.id::text = u.company_id::text
      WHERE u.status = 'inactive'
        AND ($1 = '' OR LOWER(u.name) LIKE $2 OR LOWER(u.email) LIKE $2)
        ${employeeFilter}
      ORDER BY u.left_date DESC NULLS LAST, u.name
      LIMIT 300`,
    params
  );
}
