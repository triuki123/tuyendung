import crypto from 'crypto';
import { query, queryOne, execute, withTransaction } from '@/lib/db';
import { uploadBufferAsMedia, getMediaBuffer, softDeleteMedia } from '@/lib/services/mediaService';

export interface Document {
  id: string;
  title: string;
  doc_number: string | null;
  doc_type: string;
  issued_by: string | null;
  issued_date: string | null;
  description: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** TRUE = ai có link /thong-bao/<public_token> đều xem được (không cần đăng nhập). */
  is_public: boolean;
  public_token: string | null;
  attachment_count?: number;
  /** Công ty áp dụng. RỖNG = toàn bộ công ty (dùng chung). */
  company_ids?: string[];
  company_names?: string[];
}

/** Ghi lại danh sách công ty áp dụng cho 1 văn bản (thay thế toàn bộ). */
async function replaceDocCompanies(
  client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  documentId: string,
  companyIds: string[],
): Promise<void> {
  await client.query(`DELETE FROM document_companies WHERE document_id = $1`, [documentId]);
  for (const cid of companyIds) {
    if (!cid) continue;
    await client.query(
      `INSERT INTO document_companies (document_id, company_id) VALUES ($1, $2::uuid) ON CONFLICT DO NOTHING`,
      [documentId, cid],
    );
  }
}

export interface DocumentAttachment {
  id: string;
  document_id: string;
  file_name: string;
  stored_name: string;
  mime_type: string | null;
  file_size: number;
  uploaded_by: string | null;
  created_at: string;
}

export interface DocumentWithContent extends DocumentAttachment {
  content: Buffer;
}

/** Lấy danh sách văn bản với filter tùy chọn */
export async function getAllDocuments(filters?: {
  status?: string;
  doc_type?: string;
  search?: string;
  /** Giới hạn theo công ty: chỉ trả văn bản dùng-chung HOẶC gán đúng công ty này.
   *  Truyền cho nhân viên thường (theo công ty của họ) hoặc khi admin lọc theo công ty. */
  companyScopeId?: string | null;
}): Promise<Document[]> {
  const conditions: string[] = ['d.status != $1'];
  const params: unknown[] = ['deleted'];
  let idx = 2;

  if (filters?.status) {
    conditions.push(`d.status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters?.doc_type) {
    conditions.push(`d.doc_type = $${idx++}`);
    params.push(filters.doc_type);
  }
  if (filters?.search) {
    conditions.push(`(d.title ILIKE $${idx} OR d.doc_number ILIKE $${idx} OR d.issued_by ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }

  // Lọc phạm vi công ty: văn bản không gán công ty nào (dùng chung) HOẶC gán đúng công ty này.
  let having = '';
  if (filters?.companyScopeId !== undefined) {
    params.push(filters.companyScopeId || '');
    having = `HAVING count(dc.company_id) = 0 OR bool_or(dc.company_id::text = $${idx++})`;
  }

  const where = conditions.join(' AND ');
  return query<Document>(
    `SELECT d.*,
       COUNT(DISTINCT da.id)::int AS attachment_count,
       COALESCE(array_agg(DISTINCT dc.company_id::text) FILTER (WHERE dc.company_id IS NOT NULL), '{}') AS company_ids,
       COALESCE(array_agg(DISTINCT co.name) FILTER (WHERE co.name IS NOT NULL), '{}') AS company_names
     FROM documents d
     LEFT JOIN document_attachments da ON da.document_id = d.id
     LEFT JOIN document_companies dc ON dc.document_id = d.id
     LEFT JOIN companies co ON co.id = dc.company_id
     WHERE ${where}
     GROUP BY d.id
     ${having}
     ORDER BY d.issued_date DESC NULLS LAST, d.created_at DESC`,
    params
  );
}

/** Lấy chi tiết một văn bản */
export async function getDocumentById(id: string): Promise<Document | null> {
  return queryOne<Document>(
    `SELECT d.*,
       COUNT(DISTINCT da.id)::int AS attachment_count,
       COALESCE(array_agg(DISTINCT dc.company_id::text) FILTER (WHERE dc.company_id IS NOT NULL), '{}') AS company_ids,
       COALESCE(array_agg(DISTINCT co.name) FILTER (WHERE co.name IS NOT NULL), '{}') AS company_names
     FROM documents d
     LEFT JOIN document_attachments da ON da.document_id = d.id
     LEFT JOIN document_companies dc ON dc.document_id = d.id
     LEFT JOIN companies co ON co.id = dc.company_id
     WHERE d.id = $1
     GROUP BY d.id`,
    [id]
  );
}

/** Tạo văn bản mới */
export async function createDocument(data: {
  title: string;
  doc_number?: string;
  doc_type: string;
  issued_by?: string;
  issued_date?: string;
  description?: string;
  created_by?: string;
  /** Công ty áp dụng. Rỗng/không truyền = toàn bộ công ty. */
  company_ids?: string[];
}): Promise<Document> {
  return withTransaction(async (client) => {
    const res = await client.query(
      `INSERT INTO documents (title, doc_number, doc_type, issued_by, issued_date, description, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
       RETURNING *`,
      [
        data.title,
        data.doc_number || null,
        data.doc_type,
        data.issued_by || null,
        data.issued_date || null,   // '' → null (cột DATE không nhận chuỗi rỗng)
        data.description || null,
        data.created_by ?? null,
      ],
    );
    const doc = res.rows[0] as Document;
    await replaceDocCompanies(client, doc.id, data.company_ids ?? []);
    return doc;
  });
}

/** Cập nhật văn bản */
export async function updateDocument(
  id: string,
  data: Partial<Pick<Document, 'title' | 'doc_number' | 'doc_type' | 'issued_by' | 'issued_date' | 'description' | 'status' | 'is_public'>>
    & { company_ids?: string[] }
): Promise<Document | null> {
  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.title !== undefined) { fields.push(`title = $${idx++}`); params.push(data.title); }
  if (data.doc_number !== undefined) { fields.push(`doc_number = $${idx++}`); params.push(data.doc_number); }
  if (data.doc_type !== undefined) { fields.push(`doc_type = $${idx++}`); params.push(data.doc_type); }
  if (data.issued_by !== undefined) { fields.push(`issued_by = $${idx++}`); params.push(data.issued_by); }
  if (data.issued_date !== undefined) { fields.push(`issued_date = $${idx++}`); params.push(data.issued_date || null); }
  if (data.description !== undefined) { fields.push(`description = $${idx++}`); params.push(data.description); }
  if (data.status !== undefined) { fields.push(`status = $${idx++}`); params.push(data.status); }
  if (data.is_public !== undefined) {
    fields.push(`is_public = $${idx++}`);
    params.push(data.is_public);
    if (data.is_public) {
      // Sinh token lần đầu bật công khai; các lần sau giữ nguyên link đã chia sẻ.
      fields.push(`public_token = COALESCE(public_token, $${idx++})`);
      params.push(crypto.randomBytes(20).toString('hex'));
    }
  }

  await withTransaction(async (client) => {
    if (fields.length > 0) {
      fields.push(`updated_at = NOW()`);
      const upParams = [...params, id];
      await client.query(
        `UPDATE documents SET ${fields.join(', ')} WHERE id = $${idx}`,
        upParams,
      );
    }
    if (data.company_ids !== undefined) {
      await replaceDocCompanies(client, id, data.company_ids);
      await client.query(`UPDATE documents SET updated_at = NOW() WHERE id = $1`, [id]);
    }
  });

  return getDocumentById(id);
}

/* ─────────────────────────── Công khai qua link ─────────────────────────── */

/**
 * Văn bản công khai (đã lược bỏ trường nội bộ) hiển thị ở trang /cong-bo/<token>.
 * CHỦ Ý không có API liệt kê: chỉ ai được gửi link mới xem được đúng văn bản đó.
 */
export interface PublicDocument {
  title: string;
  doc_number: string | null;
  doc_type: string;
  issued_by: string | null;
  issued_date: string | null;
  description: string | null;
  public_token: string;
  created_at: string;
  attachments?: { id: string; file_name: string; mime_type: string | null; file_size: number }[];
}

/** Chi tiết 1 văn bản công khai theo token, kèm danh sách file đính kèm. */
export async function getPublicDocumentByToken(token: string): Promise<PublicDocument | null> {
  const doc = await queryOne<PublicDocument & { id: string }>(
    `SELECT d.id, d.title, d.doc_number, d.doc_type, d.issued_by, d.issued_date,
            d.description, d.public_token, d.created_at
     FROM documents d
     WHERE d.public_token = $1 AND d.is_public = TRUE AND d.status = 'active'`,
    [token],
  );
  if (!doc) return null;
  const attachments = await query<{ id: string; file_name: string; mime_type: string | null; file_size: number }>(
    `SELECT id, file_name, mime_type, file_size
     FROM document_attachments WHERE document_id = $1 ORDER BY created_at ASC`,
    [doc.id],
  );
  const { id: _id, ...rest } = doc;
  return { ...rest, attachments };
}

/**
 * Lấy nội dung file đính kèm qua token công khai.
 * Bắt buộc kiểm attachment THUỘC ĐÚNG văn bản đang công khai — không cho đoán UUID
 * để lôi file của văn bản nội bộ.
 */
export async function getPublicAttachmentContent(
  token: string,
  attachmentId: string,
): Promise<{ content: Buffer; file_name: string; mime_type: string | null } | null> {
  const row = await queryOne<{ id: string }>(
    `SELECT da.id
     FROM document_attachments da
     JOIN documents d ON d.id = da.document_id
     WHERE da.id = $1 AND d.public_token = $2 AND d.is_public = TRUE AND d.status = 'active'`,
    [attachmentId, token],
  );
  if (!row) return null;
  return getDocumentAttachmentContent(attachmentId);
}

/** Xóa văn bản (soft delete) */
export async function deleteDocument(id: string): Promise<boolean> {
  const affected = await execute(
    `UPDATE documents SET status = 'deleted', updated_at = NOW() WHERE id = $1`,
    [id]
  );
  return affected > 0;
}

/** Thêm file đính kèm vào văn bản */
export async function addDocumentAttachment(
  documentId: string,
  data: {
    file_name: string;
    stored_name: string;
    mime_type?: string;
    file_size?: number;
    content: Buffer;
    uploaded_by?: string;
  }
): Promise<DocumentAttachment> {
  // Dual-write: ưu tiên MinIO (media_id, BYTEA NULL); S3 chưa cấu hình → giữ đường BYTEA cũ.
  const media = await uploadBufferAsMedia({
    buffer: data.content,
    mimeType: data.mime_type || 'application/octet-stream',
    scope: 'document_attachments',
    originalName: data.file_name,
    uploaderId: data.uploaded_by ?? null,
    sourceId: documentId,
  });
  return queryOne<DocumentAttachment>(
    `INSERT INTO document_attachments
       (document_id, file_name, stored_name, mime_type, file_size, content, media_id, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, document_id, file_name, stored_name, mime_type, file_size, uploaded_by, created_at`,
    [
      documentId,
      data.file_name,
      data.stored_name,
      data.mime_type ?? null,
      data.file_size ?? 0,
      media ? null : data.content,
      media?.id ?? null,
      data.uploaded_by ?? null,
    ]
  ) as Promise<DocumentAttachment>;
}

/** Lấy danh sách file đính kèm của văn bản (không lấy content) */
export async function getDocumentAttachments(documentId: string): Promise<DocumentAttachment[]> {
  return query<DocumentAttachment>(
    `SELECT id, document_id, file_name, stored_name, mime_type, file_size, uploaded_by, created_at
     FROM document_attachments
     WHERE document_id = $1
     ORDER BY created_at ASC`,
    [documentId]
  );
}

/** Lấy nội dung file để download */
export async function getDocumentAttachmentContent(
  attachmentId: string
): Promise<{ content: Buffer; file_name: string; mime_type: string | null } | null> {
  const row = await queryOne<{ content: Buffer | null; file_name: string; mime_type: string | null; media_id: string | null }>(
    `SELECT content, file_name, mime_type, media_id FROM document_attachments WHERE id = $1`,
    [attachmentId]
  );
  if (!row) return null;
  // Dual-read: có media_id → đọc từ MinIO, không → BYTEA cũ.
  if (row.media_id) {
    const m = await getMediaBuffer(row.media_id);
    if (m) return { content: m.buffer, file_name: row.file_name, mime_type: row.mime_type ?? m.mimeType };
  }
  if (!row.content) return null;
  return { content: row.content, file_name: row.file_name, mime_type: row.mime_type };
}

/** Xóa file đính kèm */
export async function deleteDocumentAttachment(attachmentId: string): Promise<boolean> {
  const row = await queryOne<{ media_id: string | null }>(
    `SELECT media_id FROM document_attachments WHERE id = $1`,
    [attachmentId]
  );
  const affected = await execute(
    `DELETE FROM document_attachments WHERE id = $1`,
    [attachmentId]
  );
  // Soft-delete media best-effort (object MinIO dọn theo lịch).
  if (affected > 0 && row?.media_id) {
    await softDeleteMedia(row.media_id).catch(() => undefined);
  }
  return affected > 0;
}
