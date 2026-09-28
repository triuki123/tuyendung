import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/overtimeService';
import { sendOvertimeReviewedNotification } from '@/lib/services/notificationsService';
import { resolveApprovalMessages } from '@/lib/telegram/approvalMessageSync';
import { canActAsApproverFor } from '@/lib/services/leaveDelegationService';

/**
 * PUT /api/attendance/overtime/[id]
 * Admin / Quản lý duyệt hoặc từ chối tăng ca
 *
 * Body: { action: 'approved' | 'rejected', review_note?: string }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const role       = request.headers.get('x-current-user-role');
    const reviewerId = request.headers.get('x-current-user-id') ?? '';

    const isAdmin = role === 'super_admin' || role === 'admin';

    // Không phải admin → phải là Quản Lý Trực Tiếp (users.manager_id / phân công chính)
    // HOẶC người được ỦY QUYỀN duyệt cho nhân viên (vượt cây sơ đồ).
    if (!isAdmin) {
      const overtime = await svc.getOvertimeById(params.id);
      if (!overtime) {
        return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
      }
      if (!(await canActAsApproverFor(reviewerId, overtime.user_id))) {
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
      const ok = await svc.revokeOvertime(params.id, reviewerId);
      if (!ok) return NextResponse.json({ error: 'Không thể hủy hoặc đã hủy rồi' }, { status: 409 });
      resolveApprovalMessages('ot', params.id, 'cancelled').catch(console.error);
      return NextResponse.json({ success: true });
    }

    const updated = await svc.reviewOvertime(params.id, reviewerId, action, review_note);
    if (!updated) {
      return NextResponse.json({ error: 'Không tìm thấy hoặc đã xử lý' }, { status: 404 });
    }

    // In-app + Telegram qua engine (nội dung cá nhân hoá trong templates.ts)
    sendOvertimeReviewedNotification({
      employeeId: updated.user_id,
      action,
      workDate:   String(updated.work_date).split('T')[0],
      startTime:  updated.start_time,
      endTime:    updated.end_time,
      totalHours: svc.fmtOTHours(Number(updated.evening_hours) + Number(updated.night_hours)),
      reviewNote: updated.review_note,
      reviewerId: updated.reviewed_by,
      overtimeId: updated.id,
    }).catch(console.error);

    // Đồng bộ tin nhắn duyệt Telegram (gỡ nút + cập nhật trạng thái)
    resolveApprovalMessages('ot', params.id, action).catch(console.error);

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('PUT /api/attendance/overtime/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * DELETE /api/attendance/overtime/[id]
 * Nhân viên tự hủy khai báo tăng ca của mình
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const ok = await svc.cancelOvertime(params.id, userId);
    if (!ok) return NextResponse.json({ error: 'Không thể hủy' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/attendance/overtime/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

