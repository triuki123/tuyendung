import { query, queryOne, execute } from '@/lib/db';
import { uploadBufferAsMedia, getMediaBuffer, softDeleteMedia } from '@/lib/services/mediaService';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  status: string;
  pinned: boolean;
  telegram_sent: boolean;
  published_at: string | null;
  published_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  attachment_count?: number;
  image_count?: number;
  author_name?: string | null;
  author_avatar?: string | null;
  reactions?: Record<string, number>;
  my_reaction?: string | null;
}

export interface AnnouncementAttachment {
  id: string;
  announcement_id: string;
  file_name: string;
  stored_name: string;
  mime_type: string | null;
  file_size: number;
  is_image: boolean;
  uploaded_by: string | null;
  created_at: string;
}

/** Lấy danh sách thông báo — user thường chỉ thấy published, admin thấy cả draft */
export async function getAllAnnouncements(options?: {
  publishedOnly?: boolean;
  search?: string;
}): Promise<Announcement[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (options?.publishedOnly) {
    conditions.push(`a.status = $${idx++}`);
    params.push('published');
  }
  if (options?.search) {
    conditions.push(`(a.title ILIKE $${idx} OR a.content ILIKE $${idx})`);
    params.push(`%${options.search}%`);
    idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return query<Announcement>(
    `SELECT a.*,
       COUNT(aa.id) FILTER (WHERE aa.is_image = false)::int AS attachment_count,
       COUNT(aa.id) FILTER (WHERE aa.is_image = true)::int  AS image_count,
       (SELECT name FROM users WHERE id::text = COALESCE(a.published_by, a.created_by)::text LIMIT 1) AS author_name,
       (SELECT avatar FROM users WHERE id::text = COALESCE(a.published_by, a.created_by)::text LIMIT 1) AS author_avatar,
       (SELECT json_object_agg(reaction, cnt) FROM (
          SELECT reaction, COUNT(*)::int AS cnt FROM announcement_reactions
          WHERE announcement_id::text = a.id::text GROUP BY reaction
        ) r) AS reactions
     FROM announcements a
     LEFT JOIN announcement_attachments aa ON aa.announcement_id = a.id
     ${where}
     GROUP BY a.id
     ORDER BY a.pinned DESC, a.published_at DESC NULLS LAST, a.created_at DESC`,
    params
  );
}

/** Lấy chi tiết một thông báo */
export async function getAnnouncementById(id: string): Promise<Announcement | null> {
  return queryOne<Announcement>(
    `SELECT a.*,
       COUNT(aa.id) FILTER (WHERE aa.is_image = false)::int AS attachment_count,
       COUNT(aa.id) FILTER (WHERE aa.is_image = true)::int  AS image_count
     FROM announcements a
     LEFT JOIN announcement_attachments aa ON aa.announcement_id = a.id
     WHERE a.id = $1
     GROUP BY a.id`,
    [id]
  );
}

/** Tạo thông báo mới (ở trạng thái draft) */
export async function createAnnouncement(data: {
  title: string;
  content: string;
  created_by?: string;
}): Promise<Announcement> {
  return queryOne<Announcement>(
    `INSERT INTO announcements (title, content, status, created_by)
     VALUES ($1, $2, 'draft', $3)
     RETURNING *`,
    [data.title, data.content, data.created_by ?? null]
  ) as Promise<Announcement>;
}

/** Cập nhật nội dung thông báo (kể cả đã published) */
export async function updateAnnouncement(
  id: string,
  data: Partial<Pick<Announcement, 'title' | 'content'>>
): Promise<Announcement | null> {
  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.title !== undefined) { fields.push(`title = $${idx++}`); params.push(data.title); }
  if (data.content !== undefined) { fields.push(`content = $${idx++}`); params.push(data.content); }
  if (fields.length === 0) return getAnnouncementById(id);

  fields.push(`updated_at = NOW()`);
  params.push(id);

  return queryOne<Announcement>(
    `UPDATE announcements SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
}

/** Ghim / bỏ ghim bài */
export async function togglePinAnnouncement(id: string, pinned: boolean): Promise<Announcement | null> {
  return queryOne<Announcement>(
    `UPDATE announcements SET pinned = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, pinned]
  );
}

/** Lấy reactions cho một bài, kèm reaction của user hiện tại */
export async function getReactions(
  announcementId: string,
  userId?: string
): Promise<{ reactions: Record<string, number>; my_reaction: string | null }> {
  const rows = await query<{ reaction: string; count: string }>(
    `SELECT reaction, COUNT(*)::int AS count FROM announcement_reactions
     WHERE announcement_id = $1 GROUP BY reaction`,
    [announcementId]
  );
  const reactions: Record<string, number> = {};
  for (const r of rows) reactions[r.reaction] = Number(r.count);

  let my_reaction: string | null = null;
  if (userId) {
    const mine = await queryOne<{ reaction: string }>(
      `SELECT reaction FROM announcement_reactions WHERE announcement_id = $1 AND user_id = $2`,
      [announcementId, userId]
    );
    my_reaction = mine?.reaction ?? null;
  }
  return { reactions, my_reaction };
}

/** Toggle reaction của user (thêm nếu chưa có, xóa nếu giống, đổi nếu khác) */
export async function toggleReaction(
  announcementId: string,
  userId: string,
  reaction: string
): Promise<{ reactions: Record<string, number>; my_reaction: string | null }> {
  const existing = await queryOne<{ reaction: string }>(
    `SELECT reaction FROM announcement_reactions WHERE announcement_id = $1 AND user_id = $2`,
    [announcementId, userId]
  );

  if (!existing) {
    await execute(
      `INSERT INTO announcement_reactions (announcement_id, user_id, reaction) VALUES ($1, $2, $3)`,
      [announcementId, userId, reaction]
    );
  } else if (existing.reaction === reaction) {
    await execute(
      `DELETE FROM announcement_reactions WHERE announcement_id = $1 AND user_id = $2`,
      [announcementId, userId]
    );
  } else {
    await execute(
      `UPDATE announcement_reactions SET reaction = $3 WHERE announcement_id = $1 AND user_id = $2`,
      [announcementId, userId, reaction]
    );
  }

  return getReactions(announcementId, userId);
}

/** Publish thông báo — trả về announcement đã publish để caller gửi Telegram */
export async function publishAnnouncement(
  id: string,
  publishedBy: string
): Promise<Announcement | null> {
  return queryOne<Announcement>(
    `UPDATE announcements
     SET status = 'published', published_at = NOW(), published_by = $2, updated_at = NOW()
     WHERE id = $1 AND status = 'draft'
     RETURNING *`,
    [id, publishedBy]
  );
}

/** Đánh dấu đã gửi Telegram */
export async function markTelegramSent(id: string): Promise<void> {
  await execute(
    `UPDATE announcements SET telegram_sent = true WHERE id = $1`,
    [id]
  );
}

/** Xóa thông báo (chỉ draft hoặc super_admin) */
export async function deleteAnnouncement(id: string): Promise<boolean> {
  const affected = await execute(`DELETE FROM announcements WHERE id = $1`, [id]);
  return affected > 0;
}

/** Thêm file đính kèm vào thông báo */
export async function addAnnouncementAttachment(
  announcementId: string,
  data: {
    file_name: string;
    stored_name: string;
    mime_type?: string;
    file_size?: number;
    content: Buffer;
    is_image?: boolean;
    uploaded_by?: string;
  }
): Promise<AnnouncementAttachment> {
  // Dual-write: ưu tiên MinIO (media_id, BYTEA NULL); S3 chưa cấu hình → giữ đường BYTEA cũ.
  const media = await uploadBufferAsMedia({
    buffer: data.content,
    mimeType: data.mime_type || 'application/octet-stream',
    scope: 'announcement_attachments',
    originalName: data.file_name,
    uploaderId: data.uploaded_by ?? null,
    sourceId: announcementId,
  });
  return queryOne<AnnouncementAttachment>(
    `INSERT INTO announcement_attachments
       (announcement_id, file_name, stored_name, mime_type, file_size, content, media_id, is_image, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, announcement_id, file_name, stored_name, mime_type, file_size, is_image, uploaded_by, created_at`,
    [
      announcementId,
      data.file_name,
      data.stored_name,
      data.mime_type ?? null,
      data.file_size ?? 0,
      media ? null : data.content,
      media?.id ?? null,
      data.is_image ?? false,
      data.uploaded_by ?? null,
    ]
  ) as Promise<AnnouncementAttachment>;
}

/** Lấy danh sách file đính kèm (không lấy content) */
export async function getAnnouncementAttachments(announcementId: string): Promise<AnnouncementAttachment[]> {
  return query<AnnouncementAttachment>(
    `SELECT id, announcement_id, file_name, stored_name, mime_type, file_size, is_image, uploaded_by, created_at
     FROM announcement_attachments
     WHERE announcement_id = $1
     ORDER BY is_image DESC, created_at ASC`,
    [announcementId]
  );
}

/** Lấy nội dung file để download/hiển thị */
export async function getAnnouncementAttachmentContent(
  attachmentId: string
): Promise<{ content: Buffer; file_name: string; mime_type: string | null } | null> {
  const row = await queryOne<{ content: Buffer | null; file_name: string; mime_type: string | null; media_id: string | null }>(
    `SELECT content, file_name, mime_type, media_id FROM announcement_attachments WHERE id = $1`,
    [attachmentId]
  );
  return resolveAttachmentContent(row);
}

/** Dual-read chung: có media_id → MinIO, không → BYTEA cũ. */
async function resolveAttachmentContent(
  row: { content: Buffer | null; file_name: string; mime_type: string | null; media_id: string | null } | null
): Promise<{ content: Buffer; file_name: string; mime_type: string | null } | null> {
  if (!row) return null;
  if (row.media_id) {
    const m = await getMediaBuffer(row.media_id);
    if (m) return { content: m.buffer, file_name: row.file_name, mime_type: row.mime_type ?? m.mimeType };
  }
  if (!row.content) return null;
  return { content: row.content, file_name: row.file_name, mime_type: row.mime_type };
}

/** Lấy ảnh ĐẦU TIÊN của thông báo (Buffer) — để broadcast poster qua Telegram. */
export async function getFirstImageContent(
  announcementId: string
): Promise<{ content: Buffer; file_name: string; mime_type: string | null } | null> {
  const row = await queryOne<{ content: Buffer | null; file_name: string; mime_type: string | null; media_id: string | null }>(
    `SELECT content, file_name, mime_type, media_id FROM announcement_attachments
      WHERE announcement_id = $1 AND is_image = true
      ORDER BY created_at ASC LIMIT 1`,
    [announcementId]
  );
  return resolveAttachmentContent(row);
}

/** Xóa file đính kèm */
export async function deleteAnnouncementAttachment(attachmentId: string): Promise<boolean> {
  const row = await queryOne<{ media_id: string | null }>(
    `SELECT media_id FROM announcement_attachments WHERE id = $1`,
    [attachmentId]
  );
  const affected = await execute(`DELETE FROM announcement_attachments WHERE id = $1`, [attachmentId]);
  // Soft-delete media best-effort (object MinIO dọn theo lịch).
  if (affected > 0 && row?.media_id) {
    await softDeleteMedia(row.media_id).catch(() => undefined);
  }
  return affected > 0;
}
