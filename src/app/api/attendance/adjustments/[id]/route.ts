import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/attendanceAdjustmentService';
import { sendAdjustmentReviewedNotification } from '@/lib/services/notificationsService';
import { resolveApprovalMessages } from '@/lib/telegram/approvalMessageSync';
import { canActAsApproverFor } from '@/lib/services/leaveDelegationService';

/** PUT — duyệt hoặc từ chối */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const role       = request.headers.get('x-current-user-role');
    const reviewerId = request.headers.get('x-current-user-id') ?? '';

    const isAdmin = role === 'super_admin' || role === 'admin';

    // Không phải admin → phải là quản lý trực tiếp (users.manager_id / phân công chính)
    // HOẶC người được ỦY QUYỀN duyệt cho nhân viên (vượt cây sơ đồ).
    if (!isAdmin) {
      const adjustment = await svc.getAdjustmentById(params.id);
      if (!adjustment) {
        return NextResponse.json({ error: 'Không tìm thấy đề xuất' }, { status: 404 });
      }
      if (!(await canActAsApproverFor(reviewerId, adjustment.user_id))) {
        return NextResponse.json(
          { error: 'Không có quyền duyệt: bạn không phải Quản Lý Trực Tiếp hoặc người được ủy quyền duyệt cho nhân viên này' },
          { status: 403 }
        );
      }
    }

    const { action, review_note } = await request.json();
    if (action !== 'approved' && action !== 'rejected' && action !== 'cancelled') {
      return NextResponse.json({ error: 'action phải là approved, rejected hoặc cancelled' }, { status: 400 });
    }

    if (action === 'cancelled') {
      const ok = await svc.revokeAdjustment(params.id, reviewerId);
      if (!ok) return NextResponse.json({ error: 'Không thể hủy hoặc đã hủy rồi' }, { status: 409 });
      resolveApprovalMessages('adj', params.id, 'cancelled').catch(console.error);
      return NextResponse.json({ success: true });
    }

    const updated = await svc.reviewAdjustment(params.id, reviewerId, action, review_note);
    if (!updated) {
      return NextResponse.json({ error: 'Không tìm thấy hoặc đã xử lý' }, { status: 404 });
    }

    // Nếu approved → tạo attendance_record thực sự
    if (action === 'approved') {
      await svc.applyApprovedAdjustment(updated);
    }

    // In-app + Telegram qua engine (nội dung cá nhân hoá trong templates.ts)
    sendAdjustmentReviewedNotification({
      employeeId:     updated.user_id,
      action,
      adjustmentType: updated.adjustment_type,
      workDate:       String(updated.work_date).split('T')[0],
      reviewNote:     updated.review_note,
      reviewerId:     updated.reviewed_by,
      adjustmentId:   updated.id,
    }).catch(console.error);

    resolveApprovalMessages('adj', params.id, action).catch(console.error);

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('PUT /api/attendance/adjustments/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE — nhân viên hủy đề xuất của mình */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const ok = await svc.cancelAdjustment(params.id, userId);
    if (!ok) return NextResponse.json({ error: 'Không thể hủy' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/attendance/adjustments/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
