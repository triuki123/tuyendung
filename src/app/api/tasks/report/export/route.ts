/**
 * POST /api/tasks/report/export
 * Endpoint thống nhất xuất báo cáo công việc theo phạm vi đã chọn.
 *
 * Body: { targetType, targetId, fromDate, toDate }
 *
 * Server:
 *  - Resolve role + company_id từ DB (không tin client) → áp đúng RBAC.
 *  - resolveTargetMembers: kiểm tra target nằm trong phạm vi của caller,
 *    trả danh sách user_id.
 *  - Sinh báo cáo (layout cá nhân khi 1 member, layout đội nhóm khi nhiều).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUserById } from '@/lib/services/usersService';
import { resolveTargetMembers, Role, TargetType } from '@/lib/services/taskReportScopeService';
import { generateScopedTaskReport } from '@/lib/services/taskReportService';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest) {
  try {
    const headerUserId = request.headers.get('x-current-user-id');
    const body = await request.json();
    const { targetType, targetId, fromDate, toDate } = body as {
      targetType: TargetType;
      targetId: string;
      fromDate: string;
      toDate: string;
    };

    const userId = headerUserId;
    if (!userId) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    }
    if (!targetType || !targetId || !fromDate || !toDate) {
      return NextResponse.json(
        { error: 'Thiếu trường bắt buộc: targetType, targetId, fromDate, toDate' },
        { status: 400 }
      );
    }
    const from = new Date(`${fromDate}T00:00:00Z`);
    const to = new Date(`${toDate}T00:00:00Z`);
    if (
      !ISO_DATE.test(fromDate) ||
      !ISO_DATE.test(toDate) ||
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from.toISOString().slice(0, 10) !== fromDate ||
      to.toISOString().slice(0, 10) !== toDate ||
      from > to
    ) {
      return NextResponse.json(
        { error: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc' },
        { status: 400 }
      );
    }

    const caller = await getUserById(userId);
    if (!caller) {
      return NextResponse.json({ error: 'Người dùng không tồn tại' }, { status: 404 });
    }
    const role = (caller.role || 'user') as Role;
    const companyId = caller.company_id || null;

    // Phân giải + check authorization
    let resolved;
    try {
      resolved = await resolveTargetMembers({ type: targetType, id: targetId }, userId, role, companyId);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Không có quyền với đối tượng đã chọn' },
        { status: 403 }
      );
    }

    if (resolved.memberIds.length === 0) {
      return NextResponse.json(
        { error: 'Đối tượng đã chọn không có thành viên nào' },
        { status: 400 }
      );
    }

    const reportUrl = await generateScopedTaskReport({
      requestedById: userId,
      requestedByName: caller.name || caller.email || 'User',
      memberIds: resolved.memberIds,
      targetType,
      targetLabel: resolved.targetLabel,
      fromDate,
      toDate,
    });

    return NextResponse.json({ success: true, reportUrl });
  } catch (err) {
    console.error('POST /api/tasks/report/export error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi server' },
      { status: 500 }
    );
  }
}
