import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getMediaBuffer, maybePresignedRedirect } from '@/lib/services/mediaService';

// GET /api/tickets/attachments/[attachmentId] — tai noi dung file.
export async function GET(req: NextRequest, { params }: { params: { attachmentId: string } }) {
  try {
    const currentUserId = req.headers.get('x-current-user-id');
    if (!currentUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const row = await queryOne<{
      file_name: string;
      mime_type: string | null;
      content: Buffer | null;
      media_id: string | null;
    }>(
      `SELECT file_name, mime_type, content, media_id FROM ticket_attachments WHERE id = $1`,
      [params.attachmentId]
    );

    if (!row) {
      return NextResponse.json({ error: 'Không tìm thấy tệp' }, { status: 404 });
    }

    const disposition = req.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline';
    const fileName = encodeURIComponent(row.file_name);

    // Dual-read: ưu tiên MinIO qua media_id, fallback BYTEA cũ
    if (row.media_id) {
      // File tải về (download=1): redirect presigned nếu bật MEDIA_REDIRECT_DOWNLOADS
      // (byte không đi qua Next — cần CORS bucket nếu client fetch()).
      if (disposition === 'attachment') {
        const url = await maybePresignedRedirect(row.media_id, row.file_name);
        if (url) return NextResponse.redirect(url, 302);
      }
      const media = await getMediaBuffer(row.media_id);
      if (media) {
        return new NextResponse(new Uint8Array(media.buffer), {
          status: 200,
          headers: {
            'Content-Type': row.mime_type || media.mimeType || 'application/octet-stream',
            'Content-Disposition': `${disposition}; filename*=UTF-8''${fileName}`,
          },
        });
      }
    }

    if (!row.content) {
      return NextResponse.json({ error: 'Không tìm thấy tệp' }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(row.content), {
      status: 200,
      headers: {
        'Content-Type': row.mime_type || 'application/octet-stream',
        'Content-Disposition': `${disposition}; filename*=UTF-8''${fileName}`,
      },
    });
  } catch (error: any) {
    console.error('GET attachment download error:', error);
    return NextResponse.json({ error: error.message || 'Lỗi server' }, { status: 500 });
  }
}
