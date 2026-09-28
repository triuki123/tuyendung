import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import sharp from 'sharp';
import crypto from 'crypto';
import { uploadBufferAsMedia, getMediaBuffer } from '@/lib/services/mediaService';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const AVATAR_SIZE = 240; // avatar vuông
const LOGO_MAX = 480;    // cạnh dài tối đa của logo (giữ tỉ lệ)

function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/** URL tuyệt đối public cho mail client của người nhận. Ưu tiên domain công khai. */
function publicUrl(request: NextRequest, id: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  return `${base.replace(/\/$/, '')}/api/public/signature-image/${id}`;
}

/** Lưu bytes vào signature_images (dual-write MinIO → media_id, fallback BYTEA), trả id. */
async function store(userId: string, buf: Buffer, mime: string): Promise<string> {
  const id = `simg_${crypto.randomBytes(10).toString('hex')}`;
  const media = await uploadBufferAsMedia({
    buffer: buf,
    mimeType: mime,
    scope: 'signature_images',
    originalName: id,
    uploaderId: userId,
    sourceId: id,
    visibility: 'public',
  });
  if (media) {
    await execute(
      `INSERT INTO signature_images (id, user_id, mime_type, content, size_bytes, media_id, created_at)
       VALUES ($1, $2, $3, NULL, $4, $5, NOW())`,
      [id, userId, mime, buf.length, media.id]
    );
  } else {
    await execute(
      `INSERT INTO signature_images (id, user_id, mime_type, content, size_bytes, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [id, userId, mime, buf, buf.length]
    );
  }
  return id;
}

/** Tối ưu ảnh: avatar = vuông cover; logo = giữ tỉ lệ, nền trong suốt (PNG). */
async function processImage(buf: Buffer, kind: 'avatar' | 'logo'): Promise<{ buf: Buffer; mime: string }> {
  if (kind === 'avatar') {
    const out = await sharp(buf)
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 82 })
      .toBuffer();
    return { buf: out, mime: 'image/jpeg' };
  }
  const out = await sharp(buf)
    .resize(LOGO_MAX, LOGO_MAX, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
  return { buf: out, mime: 'image/png' };
}

/**
 * POST /api/email-signature/image
 *  - multipart (field `file` + `kind`=avatar|logo) → upload ảnh mới.
 *  - JSON { source:'avatar' }                      → copy ảnh đại diện của tôi.
 *  - JSON { source:'company-logo', companyId }     → copy logo công ty.
 * Trả { url } là URL public tuyệt đối nhúng được vào chữ ký + email.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId || !isValidUUID(userId)) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    }

    const contentType = request.headers.get('content-type') || '';

    // ── Upload file mới ──
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file') as File | null;
      const kind = (form.get('kind') === 'logo' ? 'logo' : 'avatar') as 'avatar' | 'logo';
      if (!file) return NextResponse.json({ error: 'Thiếu file' }, { status: 400 });
      if (file.size > MAX_FILE_SIZE)
        return NextResponse.json({ error: 'Ảnh phải nhỏ hơn 2MB' }, { status: 400 });
      if (!ALLOWED.includes(file.type))
        return NextResponse.json({ error: 'Định dạng ảnh không hợp lệ' }, { status: 400 });

      const raw = Buffer.from(await file.arrayBuffer());
      const { buf, mime } = await processImage(raw, kind);
      const id = await store(userId, buf, mime);
      return NextResponse.json({ success: true, url: publicUrl(request, id) });
    }

    // ── Copy từ nguồn sẵn có ──
    const body = await request.json().catch(() => ({}));

    if (body.source === 'avatar') {
      const row = await queryOne<{ content: Buffer | null; mime_type: string; media_id: string | null }>(
        'SELECT content, mime_type, media_id FROM user_avatars WHERE user_id = $1',
        [userId]
      );
      // Dual-read nguồn: media_id (MinIO) trước, fallback BYTEA cũ.
      let src: Buffer | null = null;
      let mime = row?.mime_type || 'image/jpeg';
      if (row?.media_id) {
        const m = await getMediaBuffer(row.media_id);
        if (m) { src = m.buffer; mime = m.mimeType || mime; }
      }
      if (!src && row?.content) {
        src = Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content as any);
      }
      if (!src)
        return NextResponse.json({ error: 'Bạn chưa có ảnh đại diện' }, { status: 404 });
      const id = await store(userId, src, mime);
      return NextResponse.json({ success: true, url: publicUrl(request, id) });
    }

    if (body.source === 'company-logo') {
      const companyId: string | undefined = body.companyId;
      if (!companyId) return NextResponse.json({ error: 'Thiếu companyId' }, { status: 400 });
      // Email nền sáng → luôn lấy biến thể logo màu (full_light / primary)
      const row = await queryOne<{ content: Buffer | null; mime_type: string; media_id: string | null }>(
        "SELECT content, mime_type, media_id FROM company_logos WHERE company_id = $1 AND variant = 'full_light'",
        [companyId]
      );
      // Dual-read nguồn: media_id (MinIO) trước, fallback BYTEA cũ.
      let src: Buffer | null = null;
      let mime = row?.mime_type || 'image/png';
      if (row?.media_id) {
        const m = await getMediaBuffer(row.media_id);
        if (m) { src = m.buffer; mime = m.mimeType || mime; }
      }
      if (!src && row?.content) {
        src = Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content as any);
      }
      if (!src)
        return NextResponse.json({ error: 'Công ty chưa có logo màu (nền sáng)' }, { status: 404 });
      const id = await store(userId, src, mime);
      return NextResponse.json({ success: true, url: publicUrl(request, id) });
    }

    return NextResponse.json({ error: 'Yêu cầu không hợp lệ' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/email-signature/image error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server' },
      { status: 500 }
    );
  }
}
