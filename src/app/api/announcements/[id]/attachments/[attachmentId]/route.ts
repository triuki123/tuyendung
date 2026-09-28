import { NextRequest, NextResponse } from 'next/server';
import * as announcementsService from '@/lib/services/announcementsService';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; attachmentId: string } }
) {
  try {
    const file = await announcementsService.getAnnouncementAttachmentContent(params.attachmentId);
    if (!file) return NextResponse.json({ error: 'Không tìm thấy file' }, { status: 404 });

    return new NextResponse(new Uint8Array(file.content), {
      headers: {
        'Content-Type': file.mime_type ?? 'application/octet-stream',
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.file_name)}"`,
      },
    });
  } catch (err) {
    console.error('GET /api/announcements/[id]/attachments/[attachmentId] error:', err);
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
    const ok = await announcementsService.deleteAnnouncementAttachment(params.attachmentId);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE announcement attachment error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
