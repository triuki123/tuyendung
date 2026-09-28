import { query, queryOne, withTransaction } from '@/lib/db';
import { uploadBufferAsMedia, getMediaBuffer } from '@/lib/services/mediaService';

/**
 * CUT (chuyển hẳn) toàn bộ biên bản đính kèm của 1 thẻ đánh giá → kho HỒ SƠ nhân sự.
 * File RỜI khỏi thẻ đánh giá (xoá hẳn evaluation_attachments) và chỉ còn sống trong hr_documents.
 * Idempotent: chạy lại không nhân bản (vì nguồn đã bị xoá). Truyền client để chạy trong transaction.
 */
export async function moveEvaluationAttachmentsToHrDocs(
  evaluationId: string, employeeId: string, actor: string | null,
  externalClient?: import('pg').PoolClient
): Promise<number> {
  const run = async (client: import('pg').PoolClient): Promise<number> => {
    // Copy-chia-sẻ media_id: nguồn có media_id → bản ghi hr_documents trỏ CÙNG media (content NULL),
    // KHÔNG re-upload; nguồn cũ (BYTEA) → copy content như trước.
    const ins = await client.query(
      `INSERT INTO hr_documents (id, employee_id, doc_type_id, title, file_name, mime_type, size_bytes, content, uploaded_by, media_id)
       SELECT 'hrd_' || (extract(epoch FROM now())*1000)::bigint || '_' || substr(md5(random()::text), 1, 8),
              $1, 'hdoc_probation_eval', 'Biên bản đánh giá thử việc',
              file_name, mime_type, size_bytes::int,
              CASE WHEN media_id IS NULL THEN content ELSE NULL END, $2, media_id
         FROM evaluation_attachments
        WHERE evaluation_id = $3 AND deleted_at IS NULL`,
      [employeeId, actor, evaluationId]
    );
    const n = ins.rowCount ?? 0;
    if (n > 0) {
      await client.query(`DELETE FROM evaluation_attachments WHERE evaluation_id = $1 AND deleted_at IS NULL`, [evaluationId]);
    }
    return n;
  };
  return externalClient ? run(externalClient) : withTransaction(run);
}

export interface EvaluationAttachmentMeta {
  id: string;
  evaluation_id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
}

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export async function listEvaluationAttachments(evaluationId: string): Promise<EvaluationAttachmentMeta[]> {
  return query<EvaluationAttachmentMeta>(
    `SELECT id, evaluation_id, file_name, mime_type, size_bytes, uploaded_by, created_at
       FROM evaluation_attachments
      WHERE evaluation_id = $1 AND deleted_at IS NULL
      ORDER BY created_at ASC`,
    [evaluationId]
  );
}

export async function createEvaluationAttachment(data: {
  evaluationId: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  buffer: Buffer;
  uploadedBy: string | null;
}): Promise<EvaluationAttachmentMeta> {
  if (data.mimeType && !ALLOWED_MIME_TYPES.includes(data.mimeType)) {
    throw new Error(`Loại tệp không được phép: ${data.mimeType}`);
  }
  if (data.sizeBytes <= 0 || data.sizeBytes > 10 * 1024 * 1024) {
    throw new Error('Kích thước tệp không hợp lệ (0 – 10MB)');
  }

  const id = `eva_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Dual-write: có S3 → media_id + content NULL; chưa cấu hình → BYTEA như cũ.
  const media = await uploadBufferAsMedia({
    buffer: data.buffer,
    mimeType: data.mimeType || 'application/octet-stream',
    scope: 'evaluation_attachments',
    originalName: data.fileName,
    uploaderId: data.uploadedBy,
    sourceId: id,
  });

  const row = await queryOne<EvaluationAttachmentMeta>(
    `INSERT INTO evaluation_attachments
       (id, evaluation_id, file_name, mime_type, size_bytes, content, uploaded_by, media_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, evaluation_id, file_name, mime_type, size_bytes, uploaded_by, created_at`,
    [id, data.evaluationId, data.fileName, data.mimeType, data.sizeBytes,
     media ? null : data.buffer, data.uploadedBy, media ? media.id : null]
  );

  // Fallback: thẻ đã ĐẠT mà giờ mới upload biên bản → CUT thẳng vào hồ sơ nhân sự (không để sót).
  const ev = await queryOne<{ status: string; employee_id: string }>(
    `SELECT status, employee_id FROM evaluations WHERE id = $1`, [data.evaluationId]
  );
  if (ev?.status === 'passed') {
    await moveEvaluationAttachmentsToHrDocs(data.evaluationId, ev.employee_id, data.uploadedBy).catch(() => {});
  }
  return row as EvaluationAttachmentMeta;
}

export async function getEvaluationAttachmentContent(
  id: string
): Promise<{ file_name: string; mime_type: string | null; content: Buffer; evaluation_id: string } | null> {
  const row = await queryOne<{
    file_name: string; mime_type: string | null; content: Buffer | null;
    evaluation_id: string; media_id: string | null;
  }>(
    `SELECT file_name, mime_type, content, evaluation_id, media_id
       FROM evaluation_attachments WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  if (!row) return null;
  // Dual-read: file mới nằm trên MinIO (media_id), file cũ vẫn là BYTEA.
  if (row.media_id) {
    const m = await getMediaBuffer(row.media_id);
    if (m) return { file_name: row.file_name, mime_type: row.mime_type, content: m.buffer, evaluation_id: row.evaluation_id };
  }
  if (!row.content) return null;
  return { file_name: row.file_name, mime_type: row.mime_type, content: row.content, evaluation_id: row.evaluation_id };
}

export async function softDeleteEvaluationAttachment(id: string): Promise<boolean> {
  const row = await queryOne<{ id: string; media_id: string | null }>(
    `UPDATE evaluation_attachments SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id, media_id`,
    [id]
  );
  // GHI CHÚ: KHÔNG softDeleteMedia — media_id có thể đã được copy-chia-sẻ sang hr_documents
  // (moveEvaluationAttachmentsToHrDocs) nên không xác định an toàn để xoá mềm media.
  return !!row;
}
