import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/leaveRequestService';
import { queryOne } from '@/lib/db';
import { sendLeaveSubmittedNotification } from '@/lib/services/notificationsService';
import { sendApprovalRequest } from '@/lib/telegram/sendApproval';

export const dynamic = 'force-dynamic';

/** GET — đơn nghỉ phép theo vai trò: admin (tất cả) / quản lý (đội) / nhân viên (của mình). */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    const activeCompany = request.headers.get('x-current-user-company');
    const { searchParams } = new URL(request.url);

    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : undefined;
    const status = (searchParams.get('status') as svc.LeaveStatus | null) ?? undefined;
    const scope = searchParams.get('scope'); // 'self' để buộc chỉ xem của mình

    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    // Đa Công Ty: role + công ty suy theo công ty đang làm việc (không tin role header).
    const { getEffectiveContext } = await import('@/lib/services/userCompanyService');
    const ctx = await getEffectiveContext(userId, activeCompany || null);
    const role = ctx?.role ?? 'user';
    const companyId = ctx?.company_id ?? activeCompany ?? null;

    if (scope !== 'self') {
      if (role === 'super_admin' || role === 'admin') {
        // super_admin: toàn hệ thống; admin: chỉ công ty đang làm việc.
        const data = await svc.getAllLeaves({
          status,
          year,
          companyId: role === 'super_admin' ? null : companyId,
        });
        return NextResponse.json({ success: true, data, view: 'all' });
      }
      // Quản lý: cấp dưới (đệ quy) trong công ty đang làm việc.
      const teamData = await svc.getTeamLeaves(userId, { status, year, companyId });
      if (teamData.length > 0 || role === 'manager') {
        return NextResponse.json({ success: true, data: teamData, view: 'team' });
      }
    }

    const data = await svc.getUserLeaves(userId, year);
    return NextResponse.json({ success: true, data, view: 'self' });
  } catch (err) {
    console.error('GET /api/leave/requests error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST — nhân viên gửi đơn nghỉ phép. */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const body = await request.json();
    const { leave_type_id, mode, day_part, start_date, end_date, start_time, end_time, reason } = body;

    if (!leave_type_id || !start_date || !end_date || !reason?.trim()) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 });
    }

    const result = await svc.createLeave({
      user_id: userId,
      leave_type_id,
      mode: mode === 'hour' ? 'hour' : 'day',
      day_part: day_part === 'morning' || day_part === 'afternoon' ? day_part : null,
      start_date,
      end_date,
      start_time,
      end_time,
      reason: reason.trim(),
    });

    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error ?? 'Không tạo được đơn' }, { status: 400 });
    }

    // Báo Quản Lý Trực Tiếp (async, không block response)
    notifyDirectManager(result.data).catch(console.error);

    return NextResponse.json({ success: true, data: result.data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/leave/requests error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** Gửi in-app + Telegram cho Quản Lý Trực Tiếp khi có đơn nghỉ phép mới. */
async function notifyDirectManager(leave: svc.LeaveRequest) {
  try {
    const employee = await queryOne<{
      manager_id: string | null;
      name: string;
      company_id: string | null;
      company_name: string | null;
    }>(
      `SELECT u.manager_id, u.name, u.company_id::text AS company_id, c.name AS company_name
         FROM users u
         LEFT JOIN companies c ON c.id::text = u.company_id::text
        WHERE u.id::text = $1`,
      [leave.user_id]
    );

    // Cơ cấu tổ chức mới (org_assignments): người duyệt = manager của PHÂN CÔNG CHÍNH
    // tại công ty của đơn (công ty của nhân viên). Fallback users.manager_id như cũ
    // khi user chưa có phân công — không đổi hành vi hiện tại (dual-write đang đồng bộ).
    let managerId = employee?.manager_id ?? null;
    if (employee?.company_id) {
      const { getPrimaryAssignment } = await import('@/lib/services/orgStructureService');
      const assignment = await getPrimaryAssignment(leave.user_id, employee.company_id);
      if (assignment?.manager_id) managerId = assignment.manager_id;
    }

    // Người ĐƯỢC ỦY QUYỀN duyệt phép cho nhân viên (vượt cây sơ đồ) cũng nhận thông báo.
    const { getDelegateApproverIds } = await import('@/lib/services/leaveDelegationService');
    const delegateIds = await getDelegateApproverIds(leave.user_id);

    // Danh sách người nhận = quản lý trực tiếp + người được ủy quyền; loại trùng và loại
    // chính người nộp đơn (an toàn khi dữ liệu cũ để manager = chính mình).
    const submitter = leave.user_id.toLowerCase();
    const recipients = [...new Set([managerId, ...delegateIds].filter((x): x is string => !!x))]
      .filter((rid) => rid.toLowerCase() !== submitter);

    if (recipients.length === 0) {
      console.log(`[NghỉPhép] User ${leave.user_id} chưa có Quản Lý Trực Tiếp / người ủy quyền, bỏ qua thông báo`);
      return;
    }

    const employeeName = leave.user_name ?? employee?.name ?? leave.user_id;
    const companyName = employee?.company_name ?? null;
    const startDate = String(leave.start_date).slice(0, 10);
    const endDate = String(leave.end_date).slice(0, 10);

    const s = new Date(startDate + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const e = new Date(endDate + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeInfo =
      leave.mode === 'hour'
        ? `${s} (${leave.start_time}–${leave.end_time})`
        : s === e ? s : `${s} → ${e}`;

    for (const approverId of recipients) {
      await sendLeaveSubmittedNotification({
        managerId: approverId,
        employeeName,
        typeName: leave.type_name ?? 'Nghỉ phép',
        startDate,
        endDate,
        totalDays: Number(leave.total_days),
        leaveId: leave.id,
        companyName,
      });

      // Gửi kèm nút Duyệt / Từ chối ngay trên Telegram
      await sendApprovalRequest({
        type: 'leave',
        id: leave.id,
        approverUserId: approverId,
        title: 'Đơn Nghỉ Phép Mới',
        lines: [
          ...(companyName ? [`🏢 Công ty: ${companyName}`] : []),
          `👤 Nhân viên: *${employeeName}*`,
          `📋 Loại phép: ${leave.type_name ?? ''}`,
          `📅 Thời gian: ${timeInfo} (${leave.total_days} ngày công)`,
          `💬 Lý do: ${leave.reason ?? ''}`,
        ],
      });
    }
  } catch (e) {
    console.error('[NghỉPhép] notifyDirectManager error:', e);
  }
}
