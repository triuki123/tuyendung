import { NextRequest, NextResponse } from 'next/server';
import * as documentsService from '@/lib/services/documentsService';

export const dynamic = 'force-dynamic';

/**
 * Tải/xem file đính kèm của văn bản CÔNG KHAI.
 * Service kiểm attachment phải thuộc đúng văn bản đang công khai — không cho
 * dùng token của văn bản này để lôi file của văn bản khác.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string; attachmentId: string } },
) {
  try {
    const file = await documentsService.getPublicAttachmentContent(params.token, params.attachmentId);
    if (!file) return NextResponse.json({ error: 'Không tìm thấy file' }, { status: 404 });

    const inline = request.nextUrl.searchParams.get('inline') === '1';
    return new NextResponse(new Uint8Array(file.content), {
      headers: {
        'Content-Type': file.mime_type ?? 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(file.file_name)}"`,
      },
    });
  } catch (err) {
    console.error('GET /api/public/documents/[token]/attachments/[attachmentId] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
