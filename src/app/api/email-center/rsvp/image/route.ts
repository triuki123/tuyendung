import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import sharp from 'sharp';
import { execute } from '@/lib/db';
import { getEmailCenterActions } from '../../_perm';
import { uploadBufferAsMedia } from '@/lib/services/mediaService';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_IMAGE_EDGE = 1600;

/** URL công khai để Telegram tải ảnh (dùng chung endpoint phục vụ ảnh chữ ký). */
function publicUrl(request: NextRequest, id: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  return `${base.replace(/\/$/, '')}/api/public/signature-image/${id}`;
}

/** POST /api/email-center/rsvp/image — tải ảnh cho tin RSVP Telegram, trả URL công khai. */
export async function POST(request: NextRequest) {
  try {
    const acts = getEmailCenterActions(request);
    if (acts === null) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!acts.includes('internal') && !acts.includes('manage')) {
      return NextResponse.json({ error: 'Không có quyền tab Nội Bộ' }, { status: 403 });
    }

    const form = await request.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Thiếu file ảnh' }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'Ảnh phải nhỏ hơn 5MB' }, { status: 400 });
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Chỉ hỗ trợ PNG, JPG, GIF, WEBP' }, { status: 400 });
    }

    const input = Buffer.from(new Uint8Array(await file.arrayBuffer()));
    const stored = Buffer.from(await sharp(input)
      .resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, { fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer());

    const id = `rsvpimg_${crypto.randomBytes(10).toString('hex')}`;
    const userId = request.headers.get('x-current-user-id');
    // Dual-write: có S3 → MinIO + media_id (BYTEA NULL); chưa cấu hình → BYTEA như cũ.
    const media = await uploadBufferAsMedia({
      buffer: stored,
      mimeType: 'image/png',
      scope: 'signature_images',
      originalName: file.name,
      uploaderId: userId,
      sourceId: id,
      visibility: 'public',
    });
    if (media) {
      await execute(
        `INSERT INTO signature_images (id, user_id, mime_type, content, size_bytes, media_id, created_at)
         VALUES ($1, $2, $3, NULL, $4, $5, NOW())`,
        [id, userId, 'image/png', stored.length, media.id]
      );
    } else {
      await execute(
        `INSERT INTO signature_images (id, user_id, mime_type, content, size_bytes, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [id, userId, 'image/png', stored, stored.length]
      );
    }

    return NextResponse.json({ success: true, data: { id, url: publicUrl(request, id) } });
  } catch (error) {
    console.error('POST /api/email-center/rsvp/image error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lỗi tải ảnh' }, { status: 500 });
  }
}
