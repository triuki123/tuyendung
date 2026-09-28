import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/leaveRequestService';
import { sendLeaveReviewedNotification } from '@/lib/services/notificationsService';
import { resolveApprovalMessages } from '@/lib/telegram/approvalMessageSync';
import { canActAsApproverFor } from '@/lib/services/leaveDelegationService';

export const dynamic = 'force-dynamic';

/** PUT — duyệt/từ chối đơn (admin hoặc Quản Lý Trực Tiếp của nhân viên). */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const role = request.headers.get('x-current-user-role');
    const reviewerId = request.headers.get('x-current-user-id');
    if (!reviewerId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const body = await request.json();
    const { action, review_note } = body;
    if (action !== 'approved' && action !== 'rejected' && action !== 'cancelled') {
      return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 });
    }

    const leave = await svc.getLeaveById(params.id);
    if (!leave) return NextResponse.json({ error: 'Không tìm thấy đơn' }, { status: 404 });

    const isAdmin = role === 'super_admin' || role === 'admin';

    // Hủy đơn đã duyệt
    if (action === 'cancelled') {
      if (!isAdmin && !(await canActAsApproverFor(reviewerId, leave.user_id))) {
        return NextResponse.json({ error: 'Không có quyền hủy đơn này' }, { status: 403 });
      }
      const result = await svc.revokeLeave(params.id, reviewerId);
      if (!result.ok) return NextResponse.json({ error: result.error ?? 'Không hủy được' }, { status: 409 });
      resolveApprovalMessages('leave', params.id, 'cancelled').catch(console.error);
      return NextResponse.json({ success: true });
    }

    if (leave.status !== 'pending') {
      return NextResponse.json({ error: 'Đơn đã được xử lý' }, { status: 409 });
    }

    if (!isAdmin && !(await canActAsApproverFor(reviewerId, leave.user_id))) {
      return NextResponse.json({ error: 'Không có quyền duyệt đơn này' }, { status: 403 });
    }

    const data = await svc.reviewLeave(params.id, reviewerId, action, review_note);
    if (!data) return NextResponse.json({ error: 'Đơn đã thay đổi trạng thái' }, { status: 409 });

    // In-app + Telegram qua engine (nội dung cá nhân hoá trong templates.ts)
    sendLeaveReviewedNotification({
      employeeId: data.user_id,
      action:     action as 'approved' | 'rejected',
      typeName:   data.type_name ?? 'Nghỉ phép',
      startDate:  String(data.start_date).slice(0, 10),
      endDate:    String(data.end_date).slice(0, 10),
      totalDays:  data.total_days,
      reviewNote: data.review_note,
      leaveId:    data.id,
    }).catch(console.error);

    resolveApprovalMessages('leave', params.id, action as 'approved' | 'rejected').catch(console.error);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('PUT /api/leave/requests/:id error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE — người nộp hủy đơn (pending, hoặc approved trước ngày nghỉ → hoàn quỹ). */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const result = await svc.cancelLeave(params.id, userId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? 'Không hủy được đơn' }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/leave/requests/:id error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

