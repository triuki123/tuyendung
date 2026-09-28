import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getMediaBuffer } from '@/lib/services/mediaService';

// Phục vụ ảnh động từ DB → luôn force-dynamic (không cache build).
export const dynamic = 'force-dynamic';

/**
 * GET /api/public/user-avatar/[id]
 * Bản PUBLIC của /api/users/[id]/avatar — phục vụ avatar cho trang hồ sơ năng lực
 * public (/card/[slug]) mà khách chưa đăng nhập vẫn xem được. Chỉ trả bytes ảnh,
 * không lộ dữ liệu nhạy cảm. 404 nếu chưa có avatar (UI tự fallback chữ cái đầu).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;
    if (!userId) return NextResponse.json({ error: 'User ID required' }, { status: 400 });

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

    if (!row?.content) return NextResponse.json({ error: 'Không có ảnh đại diện' }, { status: 404 });

    const body = Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content as any);
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type': row.mime_type || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': String(body.length),
      },
    });
  } catch (error) {
    console.error('Public avatar GET error:', error);
    return NextResponse.json({ error: 'Lỗi tải ảnh đại diện' }, { status: 500 });
  }
}
