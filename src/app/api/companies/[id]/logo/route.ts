import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import sharp from 'sharp';
import { uploadBufferAsMedia, getMediaBuffer, softDeleteMedia } from '@/lib/services/mediaService';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const LOGO_MAX = 512; // cạnh dài tối đa (giữ tỉ lệ)

// Bộ biến thể logo cố định. 'full_light' là biến thể CHÍNH (primary) — fallback khi thiếu biến thể khác.
const LOGO_VARIANTS = ['full_light', 'full_dark', 'icon', 'print'] as const;
type LogoVariant = (typeof LOGO_VARIANTS)[number];
const DEFAULT_VARIANT: LogoVariant = 'full_light';

/** Đọc & validate ?variant=; mặc định full_light (tương thích ngược khi thiếu). */
function parseVariant(request: NextRequest): LogoVariant {
  const v = new URL(request.url).searchParams.get('variant');
  return (v && (LOGO_VARIANTS as readonly string[]).includes(v) ? v : DEFAULT_VARIANT) as LogoVariant;
}

export const dynamic = 'force-dynamic';

/**
 * GET /api/companies/[id]/logo?variant=full_dark
 * Trả logo của biến thể yêu cầu. Nếu chưa có biến thể đó → fallback về full_light (primary).
 * 404 nếu cả primary cũng trống (UI tự fallback chữ cái đầu).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Company ID required' }, { status: 400 });

    const variant = parseVariant(request);
    let row = await queryOne<{ content: Buffer | null; mime_type: string; media_id: string | null }>(
      'SELECT content, mime_type, media_id FROM company_logos WHERE company_id = $1 AND variant = $2',
      [id, variant]
    );
    // Fallback về biến thể chính nếu biến thể yêu cầu chưa có
    if (!row?.content && !row?.media_id && variant !== DEFAULT_VARIANT) {
      row = await queryOne<{ content: Buffer | null; mime_type: string; media_id: string | null }>(
        'SELECT content, mime_type, media_id FROM company_logos WHERE company_id = $1 AND variant = $2',
        [id, DEFAULT_VARIANT]
      );
    }

    // Dual-read: media_id (MinIO) trước, fallback BYTEA cũ.
    if (row?.media_id) {
      const m = await getMediaBuffer(row.media_id);
      if (m) {
        return new NextResponse(new Uint8Array(m.buffer), {
          status: 200,
          headers: {
            'Content-Type': m.mimeType || row.mime_type || 'image/png',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Content-Length': String(m.buffer.length),
          },
        });
      }
    }

    if (!row?.content) return NextResponse.json({ error: 'Không có logo' }, { status: 404 });

    const body = Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content as any);
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type': row.mime_type || 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': String(body.length),
      },
    });
  } catch (error) {
    console.error('Company logo GET error:', error);
    return NextResponse.json({ error: 'Lỗi tải logo' }, { status: 500 });
  }
}

/**
 * POST /api/companies/[id]/logo?variant=full_dark
 * Upload 1 biến thể logo: resize giữ tỉ lệ (cạnh dài ≤ 512px), nền trong suốt → PNG, lưu BYTEA.
 * SVG giữ nguyên (vector). Cập nhật companies.logo_urls[variant]; nếu là full_light thì set luôn logo_url (alias).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Company ID required' }, { status: 400 });

    const variant = parseVariant(request);
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Thiếu file' }, { status: 400 });

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Logo phải nhỏ hơn 2MB (nhận: ${(file.size / 1024 / 1024).toFixed(2)}MB)` },
        { status: 400 }
      );
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Định dạng không hợp lệ. Cho phép: PNG, JPG, GIF, WEBP, SVG` },
        { status: 400 }
      );
    }

    const input = Buffer.from(await file.arrayBuffer());
    let stored: Buffer;
    let mime: string;

    if (file.type === 'image/svg+xml') {
      // SVG là vector — giữ nguyên, không raster hóa
      stored = input;
      mime = 'image/svg+xml';
    } else {
      // Giữ tỉ lệ, không phóng to ảnh nhỏ, nền trong suốt → PNG
      stored = await sharp(input)
        .resize(LOGO_MAX, LOGO_MAX, { fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toBuffer();
      mime = 'image/png';
    }

    // Dual-write: có S3 → MinIO + media_id (BYTEA NULL); chưa cấu hình → BYTEA như cũ.
    const media = await uploadBufferAsMedia({
      buffer: stored,
      mimeType: mime,
      scope: 'company_logos',
      originalName: file.name,
      uploaderId: request.headers.get('x-current-user-id'),
      sourceId: `${id}:${variant}`,
      visibility: 'public',
    });

    if (media) {
      // UPSERT theo (company_id, variant): soft-delete media cũ (best-effort) trước khi trỏ media_id mới.
      const old = await queryOne<{ media_id: string | null }>(
        'SELECT media_id FROM company_logos WHERE company_id = $1 AND variant = $2',
        [id, variant]
      );
      if (old?.media_id) await softDeleteMedia(old.media_id).catch(() => {});
      await execute(
        `INSERT INTO company_logos (company_id, variant, content, mime_type, size_bytes, media_id, updated_at)
         VALUES ($1, $2, NULL, $3, $4, $5, NOW())
         ON CONFLICT (company_id, variant) DO UPDATE
           SET content = NULL,
               mime_type = EXCLUDED.mime_type,
               size_bytes = EXCLUDED.size_bytes,
               media_id = EXCLUDED.media_id,
               updated_at = NOW()`,
        [id, variant, mime, stored.length, media.id]
      );
    } else {
      await execute(
        `INSERT INTO company_logos (company_id, variant, content, mime_type, size_bytes, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (company_id, variant) DO UPDATE
           SET content = EXCLUDED.content,
               mime_type = EXCLUDED.mime_type,
               size_bytes = EXCLUDED.size_bytes,
               updated_at = NOW()`,
        [id, variant, stored, mime, stored.length]
      );
    }

    const version = Date.now();
    const url = `/api/companies/${id}/logo?variant=${variant}&v=${version}`;
    // Ghi vào logo_urls[variant]; nếu là biến thể chính thì set luôn logo_url (alias tương thích ngược)
    const updated = variant === DEFAULT_VARIANT
      ? await execute(
          `UPDATE companies
              SET logo_url = $1,
                  logo_urls = COALESCE(logo_urls, '{}'::jsonb) || jsonb_build_object('full_light', $1::text),
                  updated_at = NOW()
            WHERE id = $2`,
          [url, id]
        )
      : await execute(
          `UPDATE companies
              SET logo_urls = COALESCE(logo_urls, '{}'::jsonb) || jsonb_build_object($1::text, $2::text),
                  updated_at = NOW()
            WHERE id = $3`,
          [variant, url, id]
        );
    if (!updated) {
      await execute('DELETE FROM company_logos WHERE company_id = $1 AND variant = $2', [id, variant]).catch(() => {});
      if (media) await softDeleteMedia(media.id).catch(() => {});
      return NextResponse.json({ error: 'Không tìm thấy công ty' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { variant, url, size: stored.length, mimeType: mime } });
  } catch (error) {
    console.error('Company logo upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi tải logo lên' },
      { status: 500 }
    );
  }
}

/** DELETE /api/companies/[id]/logo?variant=full_dark — xóa 1 biến thể logo. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Company ID required' }, { status: 400 });

    const variant = parseVariant(request);
    const old = await queryOne<{ media_id: string | null }>(
      'SELECT media_id FROM company_logos WHERE company_id = $1 AND variant = $2',
      [id, variant]
    );
    await execute('DELETE FROM company_logos WHERE company_id = $1 AND variant = $2', [id, variant]);
    if (old?.media_id) await softDeleteMedia(old.media_id).catch(() => {});
    if (variant === DEFAULT_VARIANT) {
      await execute(
        `UPDATE companies SET logo_url = NULL, logo_urls = COALESCE(logo_urls, '{}'::jsonb) - 'full_light', updated_at = NOW() WHERE id = $1`,
        [id]
      );
    } else {
      await execute(
        `UPDATE companies SET logo_urls = COALESCE(logo_urls, '{}'::jsonb) - $1::text, updated_at = NOW() WHERE id = $2`,
        [variant, id]
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Company logo delete error:', error);
    return NextResponse.json({ error: 'Lỗi xóa logo' }, { status: 500 });
  }
}
