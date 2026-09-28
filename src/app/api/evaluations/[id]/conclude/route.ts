import { NextRequest, NextResponse } from 'next/server';
import { concludeEvaluation } from '@/lib/services/evaluationService';
import { canManageEvaluations } from '@/lib/services/evaluationPermissionService';
import {
  notifyWatchersStatusChange,
  notifyCBPassResult,
  notifyEmployeeEvaluationCreated,
} from '@/lib/services/evaluationWatcherService';
import { getEvaluationById } from '@/lib/services/evaluationService';
import { logHrRecord } from '@/lib/services/hrAuditService';
import { execute } from '@/lib/db';
import { notify } from '@/lib/notifications/engine';
import { createProcess } from '@/lib/services/offboardingService';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const activeCompany = request.headers.get('x-current-user-company');

    const canApprove = await canManageEvaluations(userId, 'approve', activeCompany);
    if (!canApprove) return NextResponse.json({ error: 'Không có quyền kết luận đánh giá' }, { status: 403 });

    const before = await getEvaluationById(params.id);
    if (!before) return NextResponse.json({ error: 'Không tìm thấy thẻ đánh giá' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const result: 'pass' | 'fail' = body.result;
    if (!result || !['pass', 'fail'].includes(result)) {
      return NextResponse.json({ error: 'result phải là "pass" hoặc "fail"' }, { status: 400 });
    }

    const failAction: 'extend' | 'terminate' | undefined = body.failAction;
    const extendDays: number | undefined = body.extendDays ? Number(body.extendDays) : undefined;

    if (result === 'fail') {
      if (!failAction || !['extend', 'terminate'].includes(failAction)) {
        return NextResponse.json(
          { error: 'Kết luận Không đạt phải chọn hành động: "extend" (kéo dài) hoặc "terminate" (chấm dứt)' },
          { status: 400 }
        );
      }
      if (failAction === 'extend' && (!extendDays || extendDays < 1)) {
        return NextResponse.json({ error: 'Vui lòng nhập số ngày kéo dài hợp lệ' }, { status: 400 });
      }
    }

    const { evaluation, contractId, newEvaluationId } = await concludeEvaluation(params.id, {
      result,
      failAction,
      extendDays,
      result_note: body.result_note ?? null,
      concluded_by: userId,
    });

    const newStatus =
      result === 'pass' ? 'passed' : failAction === 'extend' ? 'extended' : 'failed';

    // Lịch sử: ghi rõ kết luận + hành động kèm theo (kéo dài / chấm dứt).
    const outcome =
      result === 'pass' ? 'Đạt'
        : failAction === 'extend' ? `Không đạt — kéo dài thử việc ${extendDays} ngày`
          : 'Không đạt — chấm dứt thử việc';
    await logHrRecord({
      entityType: 'evaluation', entityId: params.id, action: 'conclude',
      details: `Chốt kết quả: ${outcome}${body.result_note ? ` · Nhận xét: ${body.result_note}` : ''}`,
      changes: {
        status: { label: 'Trạng thái', from: before.status, to: newStatus },
        result: { label: 'Kết quả', from: null, to: result === 'pass' ? 'Đạt' : 'Không đạt' },
      },
      performedBy: userId,
    });

    // Thông báo watchers
    notifyWatchersStatusChange(
      params.id,
      before.employee_name ?? null,
      before.status,
      newStatus
    ).catch(() => {});

    const now = new Date().toISOString();

    if (result === 'pass') {
      // Thông báo C&B có HĐ nháp cần xử lý
      notifyCBPassResult(params.id, before.employee_name ?? null, contractId, 'pass', before.employee_id).catch(() => {});

      // Notify nhân viên (in-app + Telegram)
      void notify('evaluation.concludedPassEmployee', {}, { recipients: [before.employee_id], relatedId: params.id });
    } else if (failAction === 'extend') {
      // Notify nhân viên: kéo dài thử việc (in-app + Telegram)
      void notify('evaluation.concludedExtended', {
        message: body.result_note
          ? `Thời gian thử việc của bạn được kéo dài thêm ${extendDays} ngày. Ghi chú: ${body.result_note}`
          : `Thời gian thử việc của bạn được kéo dài thêm ${extendDays} ngày. Vui lòng tiếp tục nỗ lực.`,
      }, { recipients: [before.employee_id], relatedId: newEvaluationId ?? params.id });

      // Notify nhân viên về thẻ đánh giá mới (nếu có)
      if (newEvaluationId) {
        notifyEmployeeEvaluationCreated(
          newEvaluationId,
          before.employee_id,
          before.employment_type_name ?? null
        ).catch(() => {});
      }
    } else {
      // Notify nhân viên: chấm dứt thử việc (in-app + Telegram)
      void notify('evaluation.concludedFailed', {
        message: body.result_note
          ? `Kết quả đánh giá: Không đạt. Lý do: ${body.result_note}`
          : 'Kết quả đánh giá: Không đạt. Vui lòng liên hệ C&B để biết thêm thông tin.',
      }, { recipients: [before.employee_id], relatedId: params.id });

      // Tạo quy trình Offboarding và cập nhật evaluations.resulting_offboarding_id
      let offboardingProcessId: string | null = null;
      try {
        const offboarding = await createProcess({
          userId: before.employee_id,
          reason: 'termination',
          reasonNote: body.result_note
            ? `Không đạt đánh giá thử việc. Lý do: ${body.result_note}`
            : 'Không đạt đánh giá thử việc.',
          createdBy: userId,
        });
        offboardingProcessId = offboarding.id;
        await execute(
          `UPDATE evaluations SET resulting_offboarding_id = $1, updated_at = NOW() WHERE id = $2`,
          [offboardingProcessId, params.id]
        );
        await execute(
          `UPDATE offboarding_processes SET source_evaluation_id = $1 WHERE id = $2`,
          [params.id, offboardingProcessId]
        );
      } catch (obErr: any) {
        console.error('POST /api/evaluations/[id]/conclude — tạo offboarding thất bại:', obErr.message);
      }

      // Notify C&B: quy trình offboarding đã khởi tạo
      notifyCBPassResult(params.id, before.employee_name ?? null, offboardingProcessId, 'terminate', before.employee_id).catch(() => {});
    }

    return NextResponse.json({ success: true, data: evaluation, contractId, newEvaluationId });
  } catch (err: any) {
    console.error('POST /api/evaluations/[id]/conclude error:', err);
    const status =
      err.message?.includes('Chỉ có thể') ||
      err.message?.includes('không hợp lệ') ||
      err.message?.includes('phải chọn')
        ? 400
        : 500;
    return NextResponse.json({ error: err.message || 'Lỗi server' }, { status });
  }
}
