import { NextRequest, NextResponse } from 'next/server';
import * as documentsService from '@/lib/services/documentsService';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await documentsService.getDocumentAttachments(params.id);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/documents/[id]/attachments error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (role !== 'super_admin' && role !== 'admin') {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const uploadedBy = request.headers.get('x-current-user-id') ?? undefined;

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    if (!files.length) {
      return NextResponse.json({ error: 'Không có file nào được gửi lên' }, { status: 400 });
    }

    const results = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `File ${file.name} vượt quá 20MB` }, { status: 400 });
      }
      const arrayBuffer = await file.arrayBuffer();
      const content = Buffer.from(arrayBuffer);
      const attachment = await documentsService.addDocumentAttachment(params.id, {
        file_name: file.name,
        stored_name: `${Date.now()}_${file.name}`,
        mime_type: file.type || undefined,
        file_size: file.size,
        content,
        uploaded_by: uploadedBy,
      });
      results.push(attachment);
    }

    return NextResponse.json({ success: true, data: results }, { status: 201 });
  } catch (err) {
    console.error('POST /api/documents/[id]/attachments error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
