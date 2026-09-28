import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getMediaBuffer } from '@/lib/services/mediaService';

export const dynamic = 'force-dynamic';

/** GET /api/public/ecard-image/[id] — phục vụ ảnh hồ sơ (public, cho trang /card). */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const row = await queryOne<{ content: Buffer | null; mime_type: string; media_id: string | null }>(
      'SELECT content, mime_type, media_id FROM ecard_images WHERE id = $1',
      [params.id]
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

    if (!row?.content) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const body = Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content as any);
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type': row.mime_type || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': String(body.length),
      },
    });
  } catch (err) {
    console.error('GET /api/public/ecard-image/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi tải ảnh' }, { status: 500 });
  }
}
