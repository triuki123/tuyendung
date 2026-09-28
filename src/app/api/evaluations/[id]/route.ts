import { NextRequest, NextResponse } from 'next/server';
import {
  getEvaluationById, updateEvaluation, deleteEvaluation, setEvaluatedStatus,
} from '@/lib/services/evaluationService';
import {
  canManageEvaluations, canViewEmployeeEvaluation,
} from '@/lib/services/evaluationPermissionService';
import { notifyWatchersStatusChange } from '@/lib/services/evaluationWatcherService';
import { logHrRecord, buildChanges } from '@/lib/services/hrAuditService';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company');
    const ev = await getEvaluationById(params.id);
    if (!ev) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });

    const canView = await canViewEmployeeEvaluation(userId, ev.employee_id, activeCompany);
    if (!canView) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    return NextResponse.json({ success: true, data: ev });
  } catch (err) {
    console.error('GET /api/evaluations/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company');
    const canEdit = await canManageEvaluations(userId, 'edit', activeCompany);
    if (!canEdit) return NextResponse.json({ error: 'Không có quyền sửa' }, { status: 403 });

    const before = await getEvaluationById(params.id);
    if (!before) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });

    const body = await request.json();

    // Nếu chuyển sang evaluated, dùng hàm riêng để set evaluated_by
    if (body.status === 'evaluated' && before.status !== 'evaluated') {
      const updated = await setEvaluatedStatus(params.id, userId);
      const d = buildChanges('evaluation', before as any, updated as any);
      await logHrRecord({
        entityType: 'evaluation', entityId: params.id, action: 'update',
        details: d.details, changes: d.changes, performedBy: userId,
      });
      notifyWatchersStatusChange(params.id, before.employee_name ?? null, before.status, 'evaluated').catch(() => {});
      return NextResponse.json({ success: true, data: updated });
    }

    const updated = await updateEvaluation(params.id, {
      employment_type_id: body.employment_type_id,
      hire_date: body.hire_date,
      probation_end_date: body.probation_end_date,
      status: body.status,
      result_note: body.result_note,
      evaluated_by: body.evaluated_by,
    });

    // Lịch sử: chỉ ghi khi thực sự có thay đổi.
    const diff = buildChanges('evaluation', before as any, updated as any);
    if (Object.keys(diff.changes).length > 0) {
      await logHrRecord({
        entityType: 'evaluation', entityId: params.id, action: 'update',
        details: diff.details, changes: diff.changes, performedBy: userId,
      });
    }

    if (body.status && body.status !== before.status) {
      notifyWatchersStatusChange(params.id, before.employee_name ?? null, before.status, body.status).catch(() => {});
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('PUT /api/evaluations/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company');
    const canDelete = await canManageEvaluations(userId, 'delete', activeCompany);
    if (!canDelete) return NextResponse.json({ error: 'Không có quyền xóa' }, { status: 403 });

    // Đọc trước khi xóa để lịch sử ghi được tên nhân viên.
    const before = await getEvaluationById(params.id);

    const deleted = await deleteEvaluation(params.id);
    if (!deleted) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });

    await logHrRecord({
      entityType: 'evaluation', entityId: params.id, action: 'delete',
      details: `Xóa đánh giá${before?.employee_name ? ` của ${before.employee_name}` : ''}`,
      performedBy: userId,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/evaluations/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
