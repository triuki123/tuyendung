import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/attendanceAdjustmentService';
import { sendAdjustmentReviewedNotification } from '@/lib/services/notificationsService';
import { resolveApprovalMessages } from '@/lib/telegram/approvalMessageSync';
import { canActAsApproverFor } from '@/lib/services/leaveDelegationService';

/**
 * PUT — duyệt/từ chối CẢ ĐỢT bù công nhiều ngày theo batch_id.
 * Quyền: admin/super_admin, Quản Lý Trực Tiếp (users.manager_id / phân công chính),
 * hoặc người được ỦY QUYỀN duyệt cho nhân viên trong đợt.
 */
export async function PUT(request: NextRequest, { params }: { params: { batchId: string } }) {
  try {
    const role       = request.headers.get('x-current-user-role');
    const reviewerId = request.headers.get('x-current-user-id') ?? '';
    const isAdmin    = role === 'super_admin' || role === 'admin';

    const rows = await svc.getBatchAdjustments(params.batchId);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Không tìm thấy đợt đề xuất' }, { status: 404 });
    }

    // Mọi dòng trong batch thuộc cùng 1 nhân viên — kiểm quyền 1 lần.
    if (!isAdmin && !(await canActAsApproverFor(reviewerId, rows[0].user_id))) {
      return NextResponse.json(
        { error: 'Không có quyền duyệt: bạn không phải Quản Lý Trực Tiếp hoặc người được ủy quyền duyệt cho nhân viên này' },
        { status: 403 }
      );
    }

    const { action, review_note } = await request.json();
    if (action !== 'approved' && action !== 'rejected') {
      return NextResponse.json({ error: 'action phải là approved hoặc rejected' }, { status: 400 });
    }

    const updated = await svc.reviewBatch(params.batchId, reviewerId, action, review_note);
    if (updated.length === 0) {
      return NextResponse.json({ error: 'Không còn đề xuất nào đang chờ duyệt trong đợt này' }, { status: 409 });
    }

    // Thông báo cho nhân viên — gửi từng ngày qua engine (in-app + Telegram).
    for (const adj of updated) {
      sendAdjustmentReviewedNotification({
        employeeId:     adj.user_id,
        action,
        adjustmentType: adj.adjustment_type,
        workDate:       String(adj.work_date).split('T')[0],
        reviewNote:     adj.review_note,
        reviewerId:     adj.reviewed_by,
        adjustmentId:   adj.id,
      }).catch(console.error);
    }

    resolveApprovalMessages('adjbatch', params.batchId, action).catch(console.error);

    return NextResponse.json({ success: true, count: updated.length, data: updated });
  } catch (err) {
    console.error('PUT /api/attendance/adjustments/batch/[batchId] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
