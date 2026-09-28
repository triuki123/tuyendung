import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import sharp from 'sharp';
import { execute } from '@/lib/db';
import { guardSolace } from '@/lib/solaceApiGuard';
import { uploadBufferAsMedia } from '@/lib/services/mediaService';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_IMAGE_EDGE = 1600;

function publicUrl(request: NextRequest, id: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  return `${base.replace(/\/$/, '')}/api/public/signature-image/${id}`;
}

export async function POST(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-marketing', 'create');
    if (g instanceof NextResponse) return g;

    const form = await request.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Thiếu file ảnh' }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'Ảnh phải nhỏ hơn 5MB' }, { status: 400 });
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Chỉ hỗ trợ PNG, JPG, GIF, WEBP, SVG' }, { status: 400 });
    }

    const input = Buffer.from(new Uint8Array(await file.arrayBuffer()));
    let stored = input;
    let mime = file.type || 'image/png';

    if (file.type !== 'image/svg+xml') {
      stored = Buffer.from(await sharp(input)
        .resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, { fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toBuffer());
      mime = 'image/png';
    }

    const id = `smi_${crypto.randomBytes(10).toString('hex')}`;
    // Dual-write: có S3 → MinIO + media_id (BYTEA NULL); chưa cấu hình → BYTEA như cũ.
    const media = await uploadBufferAsMedia({
      buffer: stored,
      mimeType: mime,
      scope: 'signature_images',
      originalName: file.name,
      uploaderId: g.userId,
      sourceId: id,
      visibility: 'public',
    });
    if (media) {
      await execute(
        `INSERT INTO signature_images (id, user_id, mime_type, content, size_bytes, media_id, created_at)
         VALUES ($1, $2, $3, NULL, $4, $5, NOW())`,
        [id, g.userId, mime, stored.length, media.id]
      );
    } else {
      await execute(
        `INSERT INTO signature_images (id, user_id, mime_type, content, size_bytes, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [id, g.userId, mime, stored, stored.length]
      );
    }

    return NextResponse.json({
      success: true,
      data: { id, url: publicUrl(request, id), mimeType: mime, size: stored.length },
    });
  } catch (error) {
    console.error('POST /api/solace/marketing/images error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi tải ảnh lên' },
      { status: 500 }
    );
  }
}
