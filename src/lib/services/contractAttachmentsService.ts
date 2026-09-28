import { query, queryOne, execute } from '@/lib/db';
import { uploadBufferAsMedia, getMediaBuffer, softDeleteMedia } from '@/lib/services/mediaService';

export interface ContractAttachmentMeta {
  id: string;
  contract_id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
}

/** Metadata các file đính kèm (không kèm nội dung BYTEA). */
export async function listContractAttachments(contractId: string): Promise<ContractAttachmentMeta[]> {
  return query<ContractAttachmentMeta>(
    `SELECT id, contract_id, file_name, mime_type, size_bytes, uploaded_by, created_at
       FROM contract_attachments
      WHERE contract_id = $1 AND deleted_at IS NULL
      ORDER BY created_at ASC`,
    [contractId]
  );
}

// Whitelisted MIME types for contract attachments
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export async function createContractAttachment(data: {
  contractId: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  buffer: Buffer;
  uploadedBy: string | null;
}): Promise<ContractAttachmentMeta> {
  // Validate MIME type
  if (data.mimeType && !ALLOWED_MIME_TYPES.includes(data.mimeType)) {
    throw new Error(`Loại tệp không được phép: ${data.mimeType}`);
  }
  // Validate file size
  if (data.sizeBytes <= 0 || data.sizeBytes > 10 * 1024 * 1024) {
    throw new Error('Kích thước tệp không hợp lệ (0 - 10MB)');
  }
  if (data.buffer.length !== data.sizeBytes) {
    throw new Error(`Kích thước tệp không khớp (${data.buffer.length} bytes vs ${data.sizeBytes} bytes)`);
  }

  const id = `ctra_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  // Dual-write: có S3 → MinIO (media_id), chưa cấu hình → BYTEA cũ
  const media = await uploadBufferAsMedia({
    buffer: data.buffer, mimeType: data.mimeType || 'application/octet-stream',
    scope: 'contract_attachments', originalName: data.fileName,
    uploaderId: data.uploadedBy, sourceId: id,
  });
  const row = await queryOne<ContractAttachmentMeta>(
    `INSERT INTO contract_attachments
       (id, contract_id, file_name, mime_type, size_bytes, content, media_id, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, contract_id, file_name, mime_type, size_bytes, uploaded_by, created_at`,
    [id, data.contractId, data.fileName, data.mimeType, data.sizeBytes,
     media ? null : data.buffer, media?.id ?? null, data.uploadedBy]
  );
  return row as ContractAttachmentMeta;
}

/** Lấy nội dung file để tải về. */
export async function getContractAttachmentContent(
  id: string
): Promise<{ file_name: string; mime_type: string | null; content: Buffer; contract_id: string } | null> {
  const row = await queryOne<{ file_name: string; mime_type: string | null; content: Buffer | null; contract_id: string; media_id: string | null }>(
    `SELECT file_name, mime_type, content, contract_id, media_id
       FROM contract_attachments WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  if (!row) return null;
  // Dual-read: có media_id → MinIO; không → BYTEA cũ
  if (row.media_id) {
    const m = await getMediaBuffer(row.media_id);
    if (m) return { file_name: row.file_name, mime_type: row.mime_type, content: m.buffer, contract_id: row.contract_id };
  }
  if (!row.content) return null;
  return { file_name: row.file_name, mime_type: row.mime_type, content: row.content, contract_id: row.contract_id };
}

/** Metadata thôi (KHÔNG tải BYTEA) — dùng khi chỉ cần biết tệp thuộc hợp đồng nào, vd để ghi lịch sử. */
export async function getContractAttachmentMeta(
  id: string
): Promise<{ file_name: string; contract_id: string } | null> {
  return queryOne(
    `SELECT file_name, contract_id FROM contract_attachments WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
}

/** Xóa mềm. */
export async function softDeleteContractAttachment(id: string): Promise<boolean> {
  const row = await queryOne<{ media_id: string | null }>(
    `UPDATE contract_attachments SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL
     RETURNING media_id`,
    [id]
  );
  if (!row) return false;
  // Xoá mềm media kèm theo (best-effort)
  if (row.media_id) {
    try { await softDeleteMedia(row.media_id); } catch { /* nuốt lỗi */ }
  }
  return true;
}
