import { NextRequest, NextResponse } from 'next/server';
import { decodeIdentityHeader } from '@/lib/authCookie';
import {
  createAttachment,
  getTaskAttachments,
  MAX_ATTACHMENT_BYTES,
} from '@/lib/services/taskAttachmentsService';
import { queryOne } from '@/lib/db';

/**
 * GET /api/tasks/[id]/attachments
 * Liệt kê tệp đính kèm của task. Query optional: comment_id để lọc theo bình luận.
 * Response: { success: true, data: TaskAttachment[], count: number }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const commentId = searchParams.get('comment_id'); // null nếu không truyền
    const data = await getTaskAttachments(
      params.id,
      commentId === null ? undefined : commentId
    );
    return NextResponse.json({ success: true, data, count: data.length });
  } catch (error) {
    console.error('GET /api/tasks/[id]/attachments error:', error);
    return NextResponse.json({ error: 'Lỗi khi tải tệp đính kèm' }, { status: 500 });
  }
}

/**
 * POST /api/tasks/[id]/attachments
 * Upload tệp (multipart/form-data, field "files"). Optional field "comment_id".
 * Headers: x-current-user-id, x-current-user-name.
 * Response: { success: true, data: TaskAttachment[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    const currentUserName = decodeIdentityHeader(request.headers.get('x-current-user-name'));
    if (!currentUserId) {
      return NextResponse.json({ error: 'Phải xác thực trước' }, { status: 401 });
    }

    // Task tồn tại?
    const task = await queryOne<{ id: string }>(
      'SELECT id FROM tasks WHERE id = $1',
      [params.id]
    );
    if (!task) {
      return NextResponse.json({ error: 'Task không tìm thấy' }, { status: 404 });
    }

    const form = await request.formData();
    const files = form.getAll('files').filter((f): f is File => f instanceof File);
    const commentId = (form.get('comment_id') as string) || null;

    if (files.length === 0) {
      return NextResponse.json({ error: 'Không có tệp nào' }, { status: 400 });
    }

    const saved = [];
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        return NextResponse.json(
          { error: `Tệp "${file.name}" vượt quá 10MB` },
          { status: 413 }
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const row = await createAttachment({
        taskId: params.id,
        commentId,
        fileName: file.name,
        mimeType: file.type || null,
        uploadedBy: currentUserId,
        uploadedByName: currentUserName || currentUserId,
        buffer,
      });
      saved.push(row);
    }

    return NextResponse.json({ success: true, data: saved }, { status: 201 });
  } catch (error) {
    console.error('POST /api/tasks/[id]/attachments error:', error);
    const message = error instanceof Error ? error.message : 'Lỗi khi tải tệp lên';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
