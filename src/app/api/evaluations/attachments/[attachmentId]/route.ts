import { NextRequest, NextResponse } from 'next/server';
import { getEvaluationAttachmentContent, softDeleteEvaluationAttachment } from '@/lib/services/evaluationAttachmentsService';
import { getEvaluationById } from '@/lib/services/evaluationService';
import { canManageEvaluations, canViewEmployeeEvaluation } from '@/lib/services/evaluationPermissionService';

export async function GET(request: NextRequest, { params }: { params: { attachmentId: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const attachment = await getEvaluationAttachmentContent(params.attachmentId);
    if (!attachment) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });

    const ev = await getEvaluationById(attachment.evaluation_id);
    if (!ev) return NextResponse.json({ error: 'Không tìm thấy đánh giá' }, { status: 404 });

    const canView = await canViewEmployeeEvaluation(userId, ev.employee_id);
    if (!canView) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const download = new URL(request.url).searchParams.get('download') === '1';
    return new NextResponse(attachment.content as unknown as BodyInit, {
      headers: {
        'Content-Type': attachment.mime_type || 'application/octet-stream',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(attachment.file_name)}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    console.error('GET /api/evaluations/attachments/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { attachmentId: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const canEdit = await canManageEvaluations(userId, 'edit');
    if (!canEdit) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const deleted = await softDeleteEvaluationAttachment(params.attachmentId);
    if (!deleted) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/evaluations/attachments/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
