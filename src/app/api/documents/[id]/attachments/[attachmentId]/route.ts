import { NextRequest, NextResponse } from 'next/server';
import * as documentsService from '@/lib/services/documentsService';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; attachmentId: string } }
) {
  try {
    const file = await documentsService.getDocumentAttachmentContent(params.attachmentId);
    if (!file) return NextResponse.json({ error: 'Không tìm thấy file' }, { status: 404 });

    // ?inline=1 → trình duyệt mở tại chỗ (nút xem trước), mặc định vẫn là tải về.
    const inline = request.nextUrl.searchParams.get('inline') === '1';
    return new NextResponse(new Uint8Array(file.content), {
      headers: {
        'Content-Type': file.mime_type ?? 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(file.file_name)}"`,
      },
    });
  } catch (err) {
    console.error('GET /api/documents/[id]/attachments/[attachmentId] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; attachmentId: string } }
) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (role !== 'super_admin' && role !== 'admin') {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const ok = await documentsService.deleteDocumentAttachment(params.attachmentId);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/documents/[id]/attachments/[attachmentId] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
