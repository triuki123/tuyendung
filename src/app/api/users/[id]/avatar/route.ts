import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute, pool } from '@/lib/db';
import { updateUser } from '@/lib/services/usersService';
import { buildNotifyPayload } from '@/lib/notify-db';
import sharp from 'sharp';
import { getActorWithPerms, forbidden, unauthorized } from '@/lib/apiAuth';
import { canAccess } from '@/lib/permissions';
import { uploadBufferAsMedia, getMediaBuffer, softDeleteMedia } from '@/lib/services/mediaService';

const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const AVATAR_SIZE = 300; // 300x300px
const IMAGE_QUALITY = 80; // JPEG quality

// Phục vụ ảnh động từ DB → luôn force-dynamic (không cache build).
export const dynamic = 'force-dynamic';

/**
 * GET /api/users/[id]/avatar
 * Trả ảnh đại diện đã lưu BYTEA trong DB. Query `?v=` chỉ để bust cache phía client,
 * không ảnh hưởng truy vấn. 404 nếu user chưa có avatar (UI tự fallback chữ cái đầu).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const row = await queryOne<{ content: Buffer | null; mime_type: string; media_id: string | null }>(
      'SELECT content, mime_type, media_id FROM user_avatars WHERE user_id = $1',
      [userId]
    );

    // Dual-read: media_id (MinIO) trước, fallback BYTEA cũ.
    if (row?.media_id) {
      const m = await getMediaBuffer(row.media_id);
      if (m) {
        return new NextResponse(new Uint8Array(m.buffer), {
          status: 200,
          headers: {
            'Content-Type': m.mimeType || row.mime_type || 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Content-Length': String(m.buffer.length),
          },
        });
      }
    }

    if (!row?.content) {
      return NextResponse.json({ error: 'Không có ảnh đại diện' }, { status: 404 });
    }

    const body = Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content as any);
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type': row.mime_type || 'image/jpeg',
        // URL luôn kèm ?v=timestamp khi đổi ảnh → an toàn cache vĩnh viễn.
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': String(body.length),
      },
    });
  } catch (error) {
    console.error('Avatar GET error:', error);
    return NextResponse.json({ error: 'Lỗi tải ảnh đại diện' }, { status: 500 });
  }
}

/**
 * POST /api/users/[id]/avatar
 * Upload ảnh đại diện: tối ưu bằng Sharp (resize 300x300, JPEG q80) rồi LƯU BYTEA
 * trong DB (bảng user_avatars) — KHÔNG ghi file đĩa (bền với redeploy/đổi server).
 * users.avatar = URL phục vụ động kèm version để bust cache.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const actor = await getActorWithPerms(request);
    if (!actor) return unauthorized();
    const canEdit =
      actor.id === userId ||
      actor.role === 'super_admin' ||
      actor.role === 'admin' ||
      canAccess(actor.perms, 'users', 'edit');
    if (!canEdit) return forbidden('Bạn không có quyền thay ảnh đại diện của người dùng này');

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    console.log(`[Avatar API] Uploading avatar for user ${userId}: ${file.name} (${file.size} bytes)`);

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size must be less than 1MB (received: ${(file.size / 1024 / 1024).toFixed(2)}MB)` },
        { status: 400 }
      );
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Process image with Sharp: resize + compress → JPEG
    const buffer = await file.arrayBuffer();
    const processedBuffer = await sharp(Buffer.from(buffer))
      .resize(AVATAR_SIZE, AVATAR_SIZE, {
        fit: 'cover', // Crop to square
        position: 'center',
      })
      .jpeg({ quality: IMAGE_QUALITY })
      .toBuffer();

    console.log(`[Avatar API] Image processed: ${(processedBuffer.length / 1024).toFixed(1)}KB (was ${(buffer.byteLength / 1024).toFixed(1)}KB)`);

    // Dual-write: có S3 → MinIO + media_id (BYTEA NULL); chưa cấu hình → BYTEA như cũ.
    const media = await uploadBufferAsMedia({
      buffer: processedBuffer,
      mimeType: 'image/jpeg',
      scope: 'user_avatars',
      originalName: file.name,
      uploaderId: actor.id,
      sourceId: userId,
      visibility: 'public',
    });

    if (media) {
      // UPSERT 1-record-1-chủ-thể: soft-delete media cũ (best-effort) trước khi trỏ media_id mới.
      const old = await queryOne<{ media_id: string | null }>(
        'SELECT media_id FROM user_avatars WHERE user_id = $1',
        [userId]
      );
      if (old?.media_id) await softDeleteMedia(old.media_id).catch(() => {});
      await execute(
        `INSERT INTO user_avatars (user_id, content, mime_type, size_bytes, media_id, updated_at)
         VALUES ($1, NULL, 'image/jpeg', $2, $3, NOW())
         ON CONFLICT (user_id) DO UPDATE
           SET content = NULL,
               mime_type = EXCLUDED.mime_type,
               size_bytes = EXCLUDED.size_bytes,
               media_id = EXCLUDED.media_id,
               updated_at = NOW()`,
        [userId, processedBuffer.length, media.id]
      );
    } else {
      // Lưu/ghi đè BYTEA trong DB (upsert theo user_id) — fallback khi S3 chưa cấu hình.
      await execute(
        `INSERT INTO user_avatars (user_id, content, mime_type, size_bytes, updated_at)
         VALUES ($1, $2, 'image/jpeg', $3, NOW())
         ON CONFLICT (user_id) DO UPDATE
           SET content = EXCLUDED.content,
               mime_type = EXCLUDED.mime_type,
               size_bytes = EXCLUDED.size_bytes,
               updated_at = NOW()`,
        [userId, processedBuffer, processedBuffer.length]
      );
    }

    // URL phục vụ động kèm version (?v=) để mọi nơi (Sidebar/Topbar) tự refresh ảnh mới.
    const version = Date.now();
    const relativeUrl = `/api/users/${userId}/avatar?v=${version}`;
    const updated = await updateUser(userId, { avatar: relativeUrl }, actor.id);

    if (!updated) {
      // Rollback ảnh vừa lưu nếu user không tồn tại.
      await execute('DELETE FROM user_avatars WHERE user_id = $1', [userId]).catch(() => {});
      if (media) await softDeleteMedia(media.id).catch(() => {});
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Broadcast realtime notification so all connected users see the avatar update
    try {
      const client = await pool.connect();
      try {
        const payload = buildNotifyPayload(
          'update',
          'users',
          userId,
          { avatar: relativeUrl },
          actor.id
        );
        console.log('[Avatar API] Broadcasting avatar update to all users');
        await client.query('SELECT pg_notify($1, $2)', ['entity_changed', JSON.stringify(payload)]);
        console.log('[Avatar API] Avatar update notification sent successfully');
      } finally {
        client.release();
      }
    } catch (notifyError) {
      console.warn('[Avatar API] Failed to broadcast avatar update:', notifyError);
      // Don't fail the request if notification fails
    }

    return NextResponse.json({
      success: true,
      data: {
        url: relativeUrl,
        size: processedBuffer.length,
        mimeType: 'image/jpeg',
        originalSize: buffer.byteLength,
        optimization: `${((1 - processedBuffer.length / buffer.byteLength) * 100).toFixed(0)}% reduction`,
      },
    });
  } catch (error) {
    console.error('Avatar upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload avatar' },
      { status: 500 }
    );
  }
}
