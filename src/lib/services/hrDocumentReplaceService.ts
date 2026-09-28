import { query, queryOne, execute, withTransaction } from '@/lib/db';
import { uploadBufferAsMedia, getMediaBuffer } from '@/lib/services/mediaService';
import { notify } from '@/lib/notifications/engine';
import { getModulePermissionHoldersByCompany } from '@/lib/services/notificationsService';

export interface ReplaceRequest {
  id: string;
  original_doc_id: string;
  new_file_name: string;
  new_title: string | null;
  new_mime_type: string | null;
  new_size_bytes: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  requested_by: string;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  // joined
  original_file_name?: string | null;
  original_title?: string | null;
  original_mime_type?: string | null;
  original_size_bytes?: number | null;
  employee_id?: string | null;
  employee_name?: string | null;
  doc_type_name?: string | null;
  requester_name?: string | null;
}

const SELECT = `
  SELECT r.id, r.original_doc_id, r.new_file_name, r.new_title, r.new_mime_type, r.new_size_bytes,
         r.status, r.requested_by, r.reviewed_by, r.review_note, r.created_at, r.updated_at,
         d.file_name  AS original_file_name,
         d.title      AS original_title,
         d.mime_type  AS original_mime_type,
         d.size_bytes AS original_size_bytes,
         d.employee_id,
         t.name       AS doc_type_name,
         u.name       AS employee_name,
         ru.name      AS requester_name
    FROM hr_document_replace_requests r
    JOIN hr_documents d ON d.id = r.original_doc_id
    LEFT JOIN hr_document_types t ON t.id = d.doc_type_id
    LEFT JOIN users u  ON u.id::text = d.employee_id
    LEFT JOIN users ru ON ru.id::text = r.requested_by`;

export async function createReplaceRequest(data: {
  originalDocId: string;
  newFileName: string;
  newTitle: string | null;
  newMimeType: string | null;
  newSizeBytes: number;
  newContent: Buffer;
  requestedBy: string;
}): Promise<ReplaceRequest> {
  // Hủy yêu cầu đang chờ cũ (nếu có) của cùng người dùng cho cùng hồ sơ
  await execute(
    `UPDATE hr_document_replace_requests
        SET status = 'cancelled', updated_at = NOW()
      WHERE original_doc_id = $1 AND requested_by = $2 AND status = 'pending'`,
    [data.originalDocId, data.requestedBy]
  );

  const id = `hdrr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Dual-write: có S3 → media_id + new_content NULL; chưa cấu hình → BYTEA như cũ.
  const media = await uploadBufferAsMedia({
    buffer: data.newContent,
    mimeType: data.newMimeType || 'application/octet-stream',
    scope: 'hr_document_replace_requests',
    originalName: data.newFileName,
    uploaderId: data.requestedBy,
    sourceId: id,
  });

  await execute(
    `INSERT INTO hr_document_replace_requests
       (id, original_doc_id, new_file_name, new_title, new_mime_type, new_size_bytes, new_content, requested_by, media_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, data.originalDocId, data.newFileName, data.newTitle,
     data.newMimeType, data.newSizeBytes, media ? null : data.newContent, data.requestedBy,
     media ? media.id : null]
  );

  const req = await queryOne<ReplaceRequest>(`${SELECT} WHERE r.id = $1`, [id]);
  if (!req) throw new Error('Không thể lấy yêu cầu mới tạo');

  // Notify C&B (admin/super_admin + users có hr.edit)
  notifyHrManagersNewRequest(req).catch(() => {});

  return req;
}

export async function getRequest(id: string): Promise<ReplaceRequest | null> {
  return queryOne<ReplaceRequest>(`${SELECT} WHERE r.id = $1`, [id]);
}

export async function getNewFileContent(
  id: string
): Promise<{ file_name: string; mime_type: string | null; content: Buffer } | null> {
  const row = await queryOne<{
    file_name: string; mime_type: string | null; content: Buffer | null; media_id: string | null;
  }>(
    `SELECT new_file_name AS file_name, new_mime_type AS mime_type, new_content AS content, media_id
       FROM hr_document_replace_requests WHERE id = $1`,
    [id]
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

/** C&B: liệt kê tất cả yêu cầu đang chờ duyệt. */
export async function listPendingRequests(): Promise<ReplaceRequest[]> {
  return query<ReplaceRequest>(`${SELECT} WHERE r.status = 'pending' ORDER BY r.created_at ASC`);
}

/** Nhân viên: liệt kê yêu cầu do chính họ gửi (mọi trạng thái). */
export async function listRequestsByUser(userId: string): Promise<ReplaceRequest[]> {
  return query<ReplaceRequest>(
    `${SELECT} WHERE r.requested_by = $1 ORDER BY r.created_at DESC`,
    [userId]
  );
}

/** Trả về yêu cầu pending (nếu có) cho một hồ sơ cụ thể. */
export async function getPendingRequestForDoc(docId: string): Promise<ReplaceRequest | null> {
  return queryOne<ReplaceRequest>(
    `${SELECT} WHERE r.original_doc_id = $1 AND r.status = 'pending'`,
    [docId]
  );
}

/** C&B duyệt: ghi đè nội dung hồ sơ gốc bằng file mới rồi đánh dấu approved. */
export async function approveRequest(id: string, reviewedBy: string): Promise<ReplaceRequest> {
  return withTransaction(async (client) => {
    const res = await client.query(
      `SELECT original_doc_id, new_file_name, new_title, new_mime_type, new_size_bytes, new_content,
              media_id, requested_by
         FROM hr_document_replace_requests WHERE id = $1 AND status = 'pending'`,
      [id]
    );
    if (res.rows.length === 0) throw new Error('Yêu cầu không tồn tại hoặc đã được xử lý');
    const r = res.rows[0];

    // Copy-chia-sẻ media_id: request có media_id → hồ sơ gốc trỏ CÙNG media (không re-upload,
    // không softDelete media của request vì 2 bảng cùng trỏ 1 file); request cũ (BYTEA) → copy như trước.
    await client.query(
      `UPDATE hr_documents
          SET file_name   = $1,
              title       = COALESCE($2, title),
              mime_type   = $3,
              size_bytes  = $4,
              content     = $5,
              media_id    = $6
        WHERE id = $7`,
      [r.new_file_name, r.new_title, r.new_mime_type, r.new_size_bytes,
       r.media_id ? null : r.new_content, r.media_id ?? null, r.original_doc_id]
    );

    await client.query(
      `UPDATE hr_document_replace_requests
          SET status = 'approved', reviewed_by = $1, updated_at = NOW()
        WHERE id = $2`,
      [reviewedBy, id]
    );

    // Notify người gửi yêu cầu
    notifyRequesterResult(r.requested_by, id, 'approved', null).catch(() => {});

    const updated = await queryOne<ReplaceRequest>(`${SELECT} WHERE r.id = $1`, [id]);
    if (!updated) throw new Error('Không tìm thấy yêu cầu sau duyệt');
    return updated;
  });
}

/** C&B từ chối: giữ nguyên hồ sơ gốc, ghi lý do. */
export async function rejectRequest(id: string, reviewedBy: string, note?: string): Promise<ReplaceRequest> {
  const updated = await queryOne<ReplaceRequest>(
    `UPDATE hr_document_replace_requests
        SET status = 'rejected', reviewed_by = $1, review_note = $2, updated_at = NOW()
      WHERE id = $3 AND status = 'pending'
      RETURNING id`,
    [reviewedBy, note || null, id]
  );
  if (!updated) throw new Error('Yêu cầu không tồn tại hoặc đã được xử lý');

  // Notify người gửi yêu cầu
  const req = await queryOne<ReplaceRequest>(`${SELECT} WHERE r.id = $1`, [id]);
  if (!req) throw new Error('Không tìm thấy yêu cầu sau từ chối');
  notifyRequesterResult(req.requested_by, id, 'rejected', note || null).catch(() => {});

  return req;
}

// ── Helpers thông báo ────────────────────────────────────────────────────────

async function notifyHrManagersNewRequest(req: ReplaceRequest): Promise<void> {
  // Quyền trùng canManageContracts (admin hoặc hr.edit) nhưng SCOPE theo công ty
  // của người yêu cầu — admin/HR công ty khác không nhận.
  const requester = await queryOne<{ company_id: string | null }>(
    `SELECT company_id::text AS company_id FROM users WHERE id::text = $1`,
    [req.requested_by],
  ).catch(() => null);
  const managerIds = await getModulePermissionHoldersByCompany('hr', ['edit'], requester?.company_id ?? null);
  if (managerIds.length === 0) return;

  const docTitle = req.original_title || req.original_file_name || req.new_file_name;
  await notify('hrDoc.replaceRequest', {
    requester: req.employee_name || req.requested_by, docTitle, docType: req.doc_type_name || 'Hồ sơ',
  }, { recipients: managerIds, relatedId: req.id });
}

async function notifyRequesterResult(
  userId: string,
  reqId: string,
  result: 'approved' | 'rejected',
  note: string | null
): Promise<void> {
  if (result === 'approved') {
    await notify('hrDoc.replaceApproved', {}, { recipients: [userId], relatedId: reqId });
  } else {
    await notify('hrDoc.replaceRejected', { noteSuffix: note ? `: ${note}` : '.' },
      { recipients: [userId], relatedId: reqId });
  }
}
