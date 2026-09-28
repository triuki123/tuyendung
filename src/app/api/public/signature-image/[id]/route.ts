import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getMediaBuffer } from '@/lib/services/mediaService';

// Route PUBLIC (nằm dưới /api/public/ — middleware bỏ qua auth) để mail client
// của người nhận tải được ảnh chữ ký mà không cần cookie/đăng nhập.
export const dynamic = 'force-dynamic';

/**
 * GET /api/public/signature-image/[id]
 * Trả bytes ảnh chữ ký đã lưu BYTEA. 404 nếu không có.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Image ID required' }, { status: 400 });

    const row = await queryOne<{ content: Buffer | null; mime_type: string; media_id: string | null }>(
      'SELECT content, mime_type, media_id FROM signature_images WHERE id = $1',
      [id]
    );

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

    if (!row?.content) return NextResponse.json({ error: 'Không tìm thấy ảnh' }, { status: 404 });

    const body = Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content as any);
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type': row.mime_type || 'image/png',
        // Ảnh bất biến (id duy nhất / lần upload) → cache vĩnh viễn.
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': String(body.length),
      },
    });
  } catch (error) {
    console.error('Public signature-image GET error:', error);
    return NextResponse.json({ error: 'Lỗi tải ảnh' }, { status: 500 });
  }
}
