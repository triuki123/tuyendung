import { NextRequest, NextResponse } from 'next/server';
import { getAttachment, readAttachmentBuffer } from '@/lib/services/taskAttachmentsService';

/**
 * GET /api/tasks/[id]/attachments/[attachmentId]/download
 * Tải nội dung tệp từ đĩa server. Trả về stream với Content-Disposition.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; attachmentId: string } }
) {
  try {
    const att = await getAttachment(params.attachmentId);
    if (!att || att.task_id !== params.id || att.deleted_at) {
      return NextResponse.json({ error: 'Tệp không tìm thấy' }, { status: 404 });
    }

    let buffer: Buffer;
    try {
      buffer = await readAttachmentBuffer(att);
    } catch {
      return NextResponse.json({ error: 'Tệp không còn trên máy chủ' }, { status: 410 });
    }

    const encodedName = encodeURIComponent(att.file_name);
    // Buffer -> Uint8Array để khớp kiểu BodyInit của NextResponse
    const body = new Uint8Array(buffer);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': att.mime_type || 'application/octet-stream',
        'Content-Length': String(buffer.length),
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
      },
    });
  } catch (error) {
    console.error('GET attachment download error:', error);
    return NextResponse.json({ error: 'Lỗi khi tải tệp' }, { status: 500 });
  }
}
