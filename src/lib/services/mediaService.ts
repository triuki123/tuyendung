import { randomUUID } from 'crypto';
import { query, queryOne, execute } from '@/lib/db';
import { minioClient, DEFAULT_MEDIA_BUCKET, ensureBucketExists, isS3Configured } from '@/lib/storage/minioClient';

export type MediaVisibility = 'public' | 'private';
export type MediaStatus = 'pending' | 'confirmed';

export interface MediaRecord {
  id: string;
  /** 'pending' = mới xin presigned URL, chưa verify; chỉ 'confirmed' mới được phục vụ (mig 305). */
  status: MediaStatus;
  bucket: string;
  object_key: string;
  mime_type: string;
  size_bytes: number;
  visibility: MediaVisibility;
  uploader_id: string | null;
  original_name: string | null;
  source_table: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Presigned GET URL hết hạn sau (giây). Private object không lộ URL vĩnh viễn. */
const PRESIGNED_URL_EXPIRY_SECONDS = 300;

function generateMediaId(): string {
  return `media_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** media.uploader_id là UUID FK → users; id không phải UUID (hoặc rỗng) thì lưu null thay vì làm hỏng INSERT. */
export function toUploaderUuid(id: string | null | undefined): string | null {
  return id && UUID_RE.test(id) ? id : null;
}

function sanitizeFileName(name: string): string {
  const s = name.trim().replace(/[^a-zA-Z0-9._-]+/g, '-');
  return s.length > 0 ? s : 'file';
}

/** Object key chuẩn: media/{scope}/{uuid}-{tên-file-đã-làm-sạch} — backend sinh, client không được chọn. */
export function buildObjectKey(scope: string, originalName: string | null | undefined): string {
  return `media/${scope}/${randomUUID()}-${sanitizeFileName(originalName || 'file')}`;
}

/**
 * Dual-write helper cho MỌI luồng upload nghiệp vụ:
 * - Chưa cấu hình S3 (dev không có key) → trả null, caller giữ đường ghi BYTEA cũ.
 * - Có S3 → upload MinIO + ghi bảng media, trả record; caller lưu media_id và để cột BYTEA NULL.
 * Lỗi storage khi S3 ĐÃ cấu hình thì throw (không âm thầm rơi về BYTEA — tránh dữ liệu chẻ đôi khó dò).
 */
export async function uploadBufferAsMedia(data: {
  buffer: Buffer;
  mimeType: string;
  /** Phân vùng logic trên bucket, thường là tên bảng nguồn: 'ticket_attachments', 'user_avatars'... */
  scope: string;
  originalName?: string | null;
  uploaderId?: string | null;
  sourceTable?: string | null;
  sourceId?: string | null;
  visibility?: MediaVisibility;
}): Promise<MediaRecord | null> {
  if (!isS3Configured()) return null;
  return createMedia({
    buffer: data.buffer,
    objectKey: buildObjectKey(data.scope, data.originalName),
    mimeType: data.mimeType || 'application/octet-stream',
    visibility: data.visibility,
    uploaderId: toUploaderUuid(data.uploaderId),
    originalName: data.originalName ?? null,
    sourceTable: data.sourceTable ?? data.scope,
    sourceId: data.sourceId ?? null,
  });
}

/**
 * Upload 1 file lên MinIO và ghi metadata vào bảng media.
 * KHÔNG tự bọc transaction với thao tác trên bảng nguồn — caller (route/service gọi hàm này)
 * chịu trách nhiệm gộp với UPDATE {source_table} SET media_id = ... trong cùng transaction
 * nếu cần đảm bảo nhất quán (xem scripts/migrate-media/ cho pattern chuẩn khi migrate dữ liệu cũ).
 */
export async function createMedia(data: {
  buffer: Buffer;
  objectKey: string;
  mimeType: string;
  visibility?: MediaVisibility;
  uploaderId?: string | null;
  originalName?: string | null;
  sourceTable?: string | null;
  sourceId?: string | null;
  bucket?: string;
}): Promise<MediaRecord> {
  const bucket = data.bucket || DEFAULT_MEDIA_BUCKET;
  await ensureBucketExists(bucket);

  await minioClient.putObject(bucket, data.objectKey, data.buffer, data.buffer.length, {
    'Content-Type': data.mimeType,
  });

  const id = generateMediaId();
  const row = await queryOne<MediaRecord>(
    `INSERT INTO media
       (id, bucket, object_key, mime_type, size_bytes, visibility, uploader_id, original_name, source_table, source_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      id,
      bucket,
      data.objectKey,
      data.mimeType,
      data.buffer.length,
      data.visibility || 'private',
      data.uploaderId ?? null,
      data.originalName ?? null,
      data.sourceTable ?? null,
      data.sourceId ?? null,
    ]
  );
  return row as MediaRecord;
}

/** Lấy metadata media theo id (bỏ qua nếu đã xoá mềm). */
export async function getMedia(id: string): Promise<MediaRecord | null> {
  return queryOne<MediaRecord>(`SELECT * FROM media WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

/**
 * Trả về URL để tải file: public → URL public trực tiếp, private → presigned URL tạm thời.
 * Dùng trong pattern dual-read: route đọc thấy media_id có giá trị thì gọi hàm này và redirect,
 * thay vì trả buffer BYTEA như trước.
 */
export async function resolveMediaUrl(id: string): Promise<string | null> {
  const media = await getMedia(id);
  if (!media || media.status === 'pending') return null;

  if (media.visibility === 'public') {
    // S3_ENDPOINT là URL đầy đủ (vd https://assetflow-minio.fadoai.com) — path-style bucket/key.
    const base = (process.env.S3_ENDPOINT || '').replace(/\/+$/, '');
    return `${base}/${media.bucket}/${media.object_key}`;
  }

  return minioClient.presignedGetObject(media.bucket, media.object_key, PRESIGNED_URL_EXPIRY_SECONDS);
}

/** Tải nội dung file trực tiếp (buffer) — dùng khi route cần trả file thay vì redirect. */
export async function getMediaBuffer(id: string): Promise<{ buffer: Buffer; mimeType: string; originalName: string | null } | null> {
  const media = await getMedia(id);
  if (!media || media.status === 'pending') return null;

  const stream = await minioClient.getObject(media.bucket, media.object_key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return { buffer: Buffer.concat(chunks), mimeType: media.mime_type, originalName: media.original_name };
}

/** Xoá mềm bản ghi media (không xoá object trên MinIO — dọn riêng theo lịch, tránh mất dữ liệu do xoá nhầm). */
export async function softDeleteMedia(id: string): Promise<boolean> {
  const n = await execute(`UPDATE media SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`, [id]);
  return n > 0;
}

/** Liệt kê media theo nguồn (debug/trace khi di trú dữ liệu cũ). */
export async function listMediaBySource(sourceTable: string, sourceId?: string): Promise<MediaRecord[]> {
  if (sourceId) {
    return query<MediaRecord>(
      `SELECT * FROM media WHERE source_table = $1 AND source_id = $2 AND deleted_at IS NULL ORDER BY created_at ASC`,
      [sourceTable, sourceId]
    );
  }
  return query<MediaRecord>(
    `SELECT * FROM media WHERE source_table = $1 AND deleted_at IS NULL ORDER BY created_at ASC`,
    [sourceTable]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Presigned upload trực tiếp (client PUT thẳng lên MinIO — file lớn, không qua Next)
// Xem .claude/skills/minio-storage-integration/references/pattern-presigned-upload.md
// ─────────────────────────────────────────────────────────────────────────────

/** Giới hạn dung lượng upload qua presigned (verify LẠI ở bước confirm bằng statObject). */
export const MEDIA_MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB

/** Whitelist MIME cho presigned upload (luồng proxy từng module tự giữ whitelist riêng chặt hơn). */
export const MEDIA_ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf', 'application/zip', 'application/x-zip-compressed',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv', 'application/octet-stream',
];

const PRESIGNED_UPLOAD_TTL_SECONDS = Number(process.env.MEDIA_PRESIGNED_UPLOAD_TTL_SECONDS) || 600;

/** Lỗi bước confirm — route map sang 409. */
export class MediaConfirmError extends Error {
  code: 'OBJECT_NOT_FOUND' | 'SIZE_MISMATCH' | 'TYPE_MISMATCH';
  constructor(code: MediaConfirmError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'MediaConfirmError';
  }
}

/**
 * Bước 1 presigned upload: tạo record 'pending' + ký URL PUT.
 * Trả null khi S3 chưa cấu hình (client phải dùng luồng proxy của module thay thế).
 * Giá trị fileName/mimeType/sizeBytes là client KHAI BÁO — chỉ chặn sớm cho UX;
 * hàng rào thật ở confirmMediaUpload (đọc size/type từ statObject).
 */
export async function createPresignedUpload(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  scope: string;
  uploaderId?: string | null;
  visibility?: MediaVisibility;
  sourceTable?: string | null;
  sourceId?: string | null;
}): Promise<{ mediaId: string; uploadUrl: string; expiresIn: number } | null> {
  if (!isS3Configured()) return null;
  if (!input.fileName.trim()) throw new Error('Thiếu tên file');
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > MEDIA_MAX_UPLOAD_BYTES) {
    throw new Error(`Dung lượng không hợp lệ (tối đa ${Math.round(MEDIA_MAX_UPLOAD_BYTES / 1024 / 1024)}MB)`);
  }
  if (!MEDIA_ALLOWED_MIME_TYPES.includes(input.mimeType)) {
    throw new Error(`Loại file "${input.mimeType}" không được hỗ trợ`);
  }

  const bucket = DEFAULT_MEDIA_BUCKET;
  await ensureBucketExists(bucket);
  const objectKey = buildObjectKey(input.scope, input.fileName);
  const id = generateMediaId();

  // Tạo record pending TRƯỚC khi ký — ký lỗi thì xoá lại; pending bỏ ngang có cleanup job dọn.
  await execute(
    `INSERT INTO media
       (id, bucket, object_key, mime_type, size_bytes, visibility, uploader_id, original_name, source_table, source_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')`,
    [
      id, bucket, objectKey, input.mimeType, input.sizeBytes,
      input.visibility || 'private', toUploaderUuid(input.uploaderId),
      input.fileName, input.sourceTable ?? input.scope, input.sourceId ?? null,
    ]
  );

  try {
    const uploadUrl = await minioClient.presignedPutObject(bucket, objectKey, PRESIGNED_UPLOAD_TTL_SECONDS);
    return { mediaId: id, uploadUrl, expiresIn: PRESIGNED_UPLOAD_TTL_SECONDS };
  } catch (err) {
    await execute(`DELETE FROM media WHERE id = $1`, [id]).catch(() => {});
    throw err;
  }
}

/**
 * Bước 3 presigned upload: verify object THẬT trên MinIO rồi mới chuyển 'confirmed'.
 * Idempotent — gọi lại khi đã confirmed trả record luôn. Sai size/type → xoá object + record, throw MediaConfirmError.
 */
export async function confirmMediaUpload(id: string): Promise<MediaRecord | null> {
  const media = await getMedia(id);
  if (!media) return null;
  if (media.status === 'confirmed') return media;

  let stat: { size: number; metaData?: Record<string, string> };
  try {
    stat = await minioClient.statObject(media.bucket, media.object_key);
  } catch {
    throw new MediaConfirmError(
      'OBJECT_NOT_FOUND',
      'Chưa thấy file trên storage — client chưa upload xong hoặc presigned URL đã hết hạn.'
    );
  }

  const actualSize = Number(stat.size) || 0;
  const actualType = stat.metaData?.['content-type'] || media.mime_type;

  if (actualSize > MEDIA_MAX_UPLOAD_BYTES) {
    await minioClient.removeObject(media.bucket, media.object_key).catch(() => {});
    await execute(`DELETE FROM media WHERE id = $1`, [id]).catch(() => {});
    throw new MediaConfirmError('SIZE_MISMATCH', 'File vượt quá dung lượng cho phép.');
  }
  if (!MEDIA_ALLOWED_MIME_TYPES.includes(actualType)) {
    await minioClient.removeObject(media.bucket, media.object_key).catch(() => {});
    await execute(`DELETE FROM media WHERE id = $1`, [id]).catch(() => {});
    throw new MediaConfirmError('TYPE_MISMATCH', 'Loại file không được hỗ trợ.');
  }

  // Ghi đè bằng số liệu THẬT từ storage (không tin giá trị client khai lúc presign).
  const row = await queryOne<MediaRecord>(
    `UPDATE media SET status = 'confirmed', size_bytes = $2, mime_type = $3, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id, actualSize, actualType]
  );
  return row;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup (gọi từ mediaCleanupScheduler)
// ─────────────────────────────────────────────────────────────────────────────

/** Dọn record 'pending' bỏ ngang (xin URL rồi không upload/confirm) quá hạn. */
export async function cleanupStalePendingMedia(olderThanMinutes?: number): Promise<number> {
  const minutes = olderThanMinutes ?? (Number(process.env.MEDIA_PENDING_TTL_MINUTES) || 60);
  const stale = await query<{ id: string; bucket: string; object_key: string }>(
    `SELECT id, bucket, object_key FROM media
     WHERE status = 'pending' AND created_at < NOW() - ($1 || ' minutes')::interval
     LIMIT 200`,
    [minutes]
  );
  for (const m of stale) {
    // Object nhiều khả năng chưa từng tồn tại — removeObject best-effort.
    await minioClient.removeObject(m.bucket, m.object_key).catch(() => {});
    await execute(`DELETE FROM media WHERE id = $1`, [m.id]).catch(() => {});
  }
  return stale.length;
}

/**
 * Dọn thật media đã soft-delete quá hạn giữ rác: xoá object trên MinIO + xoá cứng record.
 * Các cột media_id ở bảng nguồn là FK ON DELETE SET NULL nên xoá record an toàn.
 */
export async function cleanupTrashedMedia(olderThanDays?: number): Promise<number> {
  const days = olderThanDays ?? (Number(process.env.MEDIA_TRASH_RETENTION_DAYS) || 30);
  const trashed = await query<{ id: string; bucket: string; object_key: string }>(
    `SELECT id, bucket, object_key FROM media
     WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - ($1 || ' days')::interval
     LIMIT 200`,
    [days]
  );
  let removed = 0;
  for (const m of trashed) {
    try {
      await minioClient.removeObject(m.bucket, m.object_key);
    } catch {
      // Object không còn/không xoá được — vẫn dọn record để không kẹt hàng đợi mãi.
    }
    await execute(`DELETE FROM media WHERE id = $1`, [m.id]).catch(() => {});
    removed++;
  }
  return removed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Download redirect (tùy chọn — bật bằng env)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * URL presigned để REDIRECT download file lớn thay vì proxy buffer qua Next.
 * Chỉ hoạt động khi env MEDIA_REDIRECT_DOWNLOADS=true (mặc định TẮT — browser fetch()
 * theo redirect sang MinIO là cross-origin, cần bật CORS trên bucket trước).
 * Trả null → route giữ nguyên đường proxy buffer.
 */
export async function maybePresignedRedirect(mediaId: string, downloadName?: string | null): Promise<string | null> {
  if (process.env.MEDIA_REDIRECT_DOWNLOADS !== 'true' || !isS3Configured()) return null;
  const media = await getMedia(mediaId);
  if (!media || media.status === 'pending') return null;
  const respHeaders: Record<string, string> = {};
  const name = downloadName || media.original_name;
  if (name) {
    respHeaders['response-content-disposition'] = `attachment; filename="${encodeURIComponent(name)}"`;
  }
  try {
    return await minioClient.presignedGetObject(media.bucket, media.object_key, PRESIGNED_URL_EXPIRY_SECONDS, respHeaders);
  } catch {
    return null;
  }
}
