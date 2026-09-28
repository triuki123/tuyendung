import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getMediaBuffer } from '@/lib/services/mediaService';

export const dynamic = 'force-dynamic';

const LOGO_VARIANTS = ['full_light', 'full_dark', 'icon', 'print'] as const;
type LogoVariant = (typeof LOGO_VARIANTS)[number];
const DEFAULT_VARIANT: LogoVariant = 'full_light';

function parseVariant(request: NextRequest): LogoVariant {
  const v = new URL(request.url).searchParams.get('variant');
  return (v && (LOGO_VARIANTS as readonly string[]).includes(v) ? v : DEFAULT_VARIANT) as LogoVariant;
}

/**
 * GET /api/public/company-logo/[id]?variant=full_light
 * Bản PUBLIC của /api/companies/[id]/logo — phục vụ logo công ty cho trang hồ sơ
 * năng lực public (/card/[slug]). Fallback về full_light khi thiếu biến thể yêu cầu.
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
    console.error('Public company logo GET error:', error);
    return NextResponse.json({ error: 'Lỗi tải logo' }, { status: 500 });
  }
}
