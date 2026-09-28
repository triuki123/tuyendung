import { NextRequest, NextResponse } from 'next/server';
import { listEvaluationAttachments, createEvaluationAttachment } from '@/lib/services/evaluationAttachmentsService';
import { getEvaluationById } from '@/lib/services/evaluationService';
import { canManageEvaluations, canViewEmployeeEvaluation } from '@/lib/services/evaluationPermissionService';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ev = await getEvaluationById(params.id);
    if (!ev) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });

    const canView = await canViewEmployeeEvaluation(userId, ev.employee_id);
    if (!canView) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const attachments = await listEvaluationAttachments(params.id);
    return NextResponse.json({ success: true, attachments });
  } catch (err) {
    console.error('GET /api/evaluations/[id]/attachments error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const canEdit = await canManageEvaluations(userId, 'edit');
    if (!canEdit) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    if (!files.length) return NextResponse.json({ error: 'Không có file' }, { status: 400 });

    const results = [];
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: `File "${file.name}" vượt quá 10MB` }, { status: 413 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const meta = await createEvaluationAttachment({
        evaluationId: params.id,
        fileName: file.name,
        mimeType: file.type || null,
        sizeBytes: file.size,
        buffer,
        uploadedBy: userId,
      });
      results.push(meta);
    }

    return NextResponse.json({ success: true, data: results }, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/evaluations/[id]/attachments error:', err);
    return NextResponse.json({ error: err.message || 'Lỗi server' }, { status: 500 });
  }
}
