import { NextRequest, NextResponse } from 'next/server';
import { execute } from '@/lib/db';
import sharp from 'sharp';
import { uploadBufferAsMedia } from '@/lib/services/mediaService';

export const dynamic = 'force-dynamic';

const MAX = 5 * 1024 * 1024; // 5MB
const ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/** POST /api/ecard/image — upload ảnh bìa/dự án; resize, lưu BYTEA, trả URL public. */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const form = await request.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Thiếu file' }, { status: 400 });
    if (file.size > MAX) return NextResponse.json({ error: 'Ảnh phải nhỏ hơn 5MB' }, { status: 400 });
    if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: 'Định dạng không hợp lệ' }, { status: 400 });

    const input = Buffer.from(await file.arrayBuffer());
    // Giữ TRONG SUỐT: ảnh có kênh alpha (logo PNG) → xuất PNG; ảnh chụp đặc → JPEG cho nhẹ.
    const meta = await sharp(input).metadata();
    const pipeline = sharp(input).rotate().resize(1400, 1400, { fit: 'inside', withoutEnlargement: true });
    let stored: Buffer;
    let mime: string;
    if (meta.hasAlpha) {
      stored = await pipeline.png({ compressionLevel: 9 }).toBuffer();
      mime = 'image/png';
    } else {
      stored = await pipeline.jpeg({ quality: 82 }).toBuffer();
      mime = 'image/jpeg';
    }

    const id = `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
    // Dual-write: có S3 → MinIO + media_id (BYTEA NULL); chưa cấu hình → BYTEA như cũ.
    const media = await uploadBufferAsMedia({
      buffer: stored,
      mimeType: mime,
      scope: 'ecard_images',
      originalName: file.name,
      uploaderId: userId,
      sourceId: id,
      visibility: 'public',
    });
    if (media) {
      await execute(
        `INSERT INTO ecard_images (id, user_id, content, mime_type, media_id) VALUES ($1, $2, NULL, $3, $4)`,
        [id, userId, mime, media.id]
      );
    } else {
      await execute(
        `INSERT INTO ecard_images (id, user_id, content, mime_type) VALUES ($1, $2, $3, $4)`,
        [id, userId, stored, mime]
      );
    }
    return NextResponse.json({ success: true, url: `/api/public/ecard-image/${id}` });
  } catch (err) {
    console.error('POST /api/ecard/image error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi tải ảnh' }, { status: 500 });
  }
}
