import { NextRequest, NextResponse } from 'next/server';
import { getAttachment, deleteAttachment } from '@/lib/services/taskAttachmentsService';

/**
 * DELETE /api/tasks/[id]/attachments/[attachmentId]
 * Xóa mềm tệp đính kèm. Chỉ người tải lên hoặc manager/admin được xóa.
 * Headers: x-current-user-id, x-current-user-role.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; attachmentId: string } }
) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    const currentUserRole = request.headers.get('x-current-user-role') || 'employee';
    if (!currentUserId) {
      return NextResponse.json({ error: 'Phải xác thực trước' }, { status: 401 });
    }

    const att = await getAttachment(params.attachmentId);
    if (!att || att.task_id !== params.id) {
      return NextResponse.json({ error: 'Tệp không tìm thấy' }, { status: 404 });
    }

    const isManager = currentUserRole === 'manager' || currentUserRole === 'admin' || currentUserRole === 'super_admin';
    if (att.uploaded_by !== currentUserId && !isManager) {
      return NextResponse.json({ error: 'Không có quyền xóa tệp này' }, { status: 403 });
    }

    await deleteAttachment(params.attachmentId);
    return NextResponse.json({ success: true, message: 'Đã xóa tệp đính kèm' });
  } catch (error) {
    console.error('DELETE /api/tasks/[id]/attachments/[attachmentId] error:', error);
    return NextResponse.json({ error: 'Lỗi khi xóa tệp' }, { status: 500 });
  }
}
