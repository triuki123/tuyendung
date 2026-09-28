import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/overtimeService';
import { queryOne } from '@/lib/db';
import { sendOvertimeSubmittedNotification } from '@/lib/services/notificationsService';
import { sendApprovalRequest } from '@/lib/telegram/sendApproval';
import { resolveAttendanceConfigForUser } from '@/lib/services/attendanceSettingsService';
import { isWeekendDay } from '@/lib/config/attendanceConfig';
import { hasSpecialDaytimeOvertime } from '@/lib/utils/overtimeUtils';

/**
 * GET /api/attendance/overtime?month=&year=&status=
 * - Admin/super_admin → toàn bộ
 * - Quản Lý Trực Tiếp (có nhân viên trực thuộc) → của team
 * - Nhân viên thường → của bản thân
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    const activeCompany = request.headers.get('x-current-user-company');
    if (!userId) return NextResponse.json({ error: 'Chưa xác thực' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const month  = searchParams.get('month')  ? Number(searchParams.get('month'))  : undefined;
    const year   = searchParams.get('year')   ? Number(searchParams.get('year'))   : undefined;
    const status = (searchParams.get('status') ?? undefined) as svc.OvertimeStatus | undefined;
    const startDate = searchParams.get('start_date') || undefined;
    const endDate = searchParams.get('end_date') || undefined;
    const selfOnly = searchParams.get('selfOnly') === '1';

    if (selfOnly) {
      const data = await svc.getUserOvertimes(userId, month, year, startDate, endDate);
      return NextResponse.json({ success: true, data, view: 'self' });
    }

    // Đa Công Ty: role + công ty theo công ty đang làm việc.
    const { getEffectiveContext } = await import('@/lib/services/userCompanyService');
    const ctx = await getEffectiveContext(userId, activeCompany || null);
    const role = ctx?.role ?? 'user';
    const companyId = ctx?.company_id ?? activeCompany ?? null;

    if (role === 'super_admin' || role === 'admin') {
      const data = await svc.getAllOvertimes({
        status, month, year, startDate, endDate,
        companyId: role === 'super_admin' ? null : companyId,
      });
      return NextResponse.json({ success: true, data, view: 'all' });
    }

    if (role === 'manager') {
      const data = await svc.getTeamOvertimes(userId, { status, month, year, startDate, endDate, companyId });
      return NextResponse.json({ success: true, data, view: 'team' });
    }

    // Nhân viên thường ĐƯỢC ỦY QUYỀN duyệt → thấy tăng ca của người mình duyệt + của mình.
    const { getDelegatedTargetIds } = await import('@/lib/services/leaveDelegationService');
    const delegated = await getDelegatedTargetIds(userId);
    if (delegated.length > 0) {
      const [team, own] = await Promise.all([
        svc.getTeamOvertimes(userId, { status, month, year, startDate, endDate, companyId }),
        svc.getUserOvertimes(userId, month, year, startDate, endDate),
      ]);
      const seen = new Set(team.map((t) => t.id));
      return NextResponse.json({
        success: true,
        data: [...team, ...own.filter((o) => !seen.has(o.id))],
        view: 'team',
      });
    }

    // Nhân viên → của bản thân
    const data = await svc.getUserOvertimes(userId, month, year, startDate, endDate);
    return NextResponse.json({ success: true, data, view: 'self' });
  } catch (err) {
    console.error('GET /api/attendance/overtime error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * POST /api/attendance/overtime
 * Khai báo tăng ca (tạo mới hoặc cập nhật)
 *
 * Body: { work_date, start_time, end_time, reason? }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    const activeCompany = request.headers.get('x-current-user-company');
    if (!userId) return NextResponse.json({ error: 'Chưa xác thực' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { work_date, start_time, end_time, reason, on_behalf_of } = body as {
      work_date: string;
      start_time: string;
      end_time: string;
      reason?: string;
      on_behalf_of?: string;
    };

    if (!work_date || !start_time || !end_time) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 });
    }

    let targetUserId = userId;
    if (on_behalf_of && on_behalf_of !== userId) {
      const { getEffectiveContext } = await import('@/lib/services/userCompanyService');
      const ctx = await getEffectiveContext(userId, activeCompany || null);
      const role = ctx?.role ?? 'user';
      const companyId = ctx?.company_id ?? activeCompany ?? null;

      if (role !== 'super_admin' && role !== 'admin' && role !== 'manager') {
        return NextResponse.json({ error: 'Không có quyền tạo tăng ca hộ nhân viên' }, { status: 403 });
      }

      if (role === 'manager') {
        const { getOrgSubtreeUserIds } = await import('@/lib/services/attendanceService');
        const subtree = await getOrgSubtreeUserIds(userId, companyId);
        if (!subtree.includes(on_behalf_of)) {
          return NextResponse.json({ error: 'Bạn chỉ có thể tạo tăng ca cho nhân viên thuộc phạm vi quản lý' }, { status: 403 });
        }
      }

      targetUserId = on_behalf_of;
    }

    // Tính toán khung giờ theo cấu hình công ty (hiệu lực tại work_date)
    const cfg = await resolveAttendanceConfigForUser(targetUserId, work_date);
    const { isHoliday } = await import('@/lib/services/attendanceAdjustmentService');
    const dow = new Date(`${work_date}T00:00:00+07:00`).getDay();
    const specialDay = isWeekendDay(dow, cfg) || await isHoliday(work_date);
    const brackets = svc.calculateOvertimeBrackets(start_time, end_time, cfg.overtimeBrackets, { allowDaytime: specialDay });

    if (brackets.totalHours <= 0) {
      return NextResponse.json(
        { error: specialDay ? 'Thời gian tăng ca không hợp lệ' : 'Thời gian tăng ca không hợp lệ (ngày thường cần từ 17:30 trở đi)' },
        { status: 400 }
      );
    }

    const result = await svc.createOrUpdateOvertime({
      user_id: targetUserId,
      work_date,
      start_time,
      end_time,
      evening_hours: brackets.eveningHours,
      night_hours:   brackets.nightHours,
      reason,
    });

    if (!result) {
      return NextResponse.json(
        { error: 'Không thể tạo: ngày này đã có khai báo đang chờ hoặc đã duyệt' },
        { status: 409 }
      );
    }

    // Thông báo Telegram cho manager async
    notifyManagerOfOvertime(result).catch(console.error);

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (err) {
    console.error('POST /api/attendance/overtime error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

async function notifyManagerOfOvertime(ot: svc.AttendanceOvertime) {
  try {
    const employee = await queryOne<{
      name: string;
      company_name: string | null;
    }>(
      `SELECT u.name, c.name AS company_name
         FROM users u
         LEFT JOIN companies c ON c.id::text = u.company_id::text
        WHERE u.id::text = $1`,
      [ot.user_id]
    );

    // Quản lý trực tiếp (ưu tiên phân công chính) ∪ người được ỦY QUYỀN duyệt.
    const { getApprovalRecipients } = await import('@/lib/services/leaveDelegationService');
    const recipients = await getApprovalRecipients(ot.user_id);
    if (recipients.length === 0) return;

    const companyName = employee?.company_name ?? null;
    const employeeName = employee?.name ?? ot.user_id;
    const workDate  = new Date(ot.work_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const totalHours = svc.fmtOTHours(Number(ot.evening_hours) + Number(ot.night_hours));

    const lines = [
      ...(companyName ? [`🏢 Công ty: ${companyName}`] : []),
      `👤 Nhân viên: *${employeeName}*`,
      `📅 Ngày: ${workDate}`,
      `🕐 Giờ: ${ot.start_time} – ${ot.end_time}`,
    ];
    const isSpecialDaytime = hasSpecialDaytimeOvertime(ot.start_time, Number(ot.evening_hours));
    if (Number(ot.evening_hours) > 0) lines.push(`${isSpecialDaytime ? '🌤 Tăng ca ngày nghỉ / lễ' : '🌆 Khung tối (17:30–22:00)'}: ${svc.fmtOTHours(Number(ot.evening_hours))}`);
    if (Number(ot.night_hours)   > 0) lines.push(`🌙 Khung đêm (22:00–07:00): ${svc.fmtOTHours(Number(ot.night_hours))}`);
    lines.push(`⏱️ Tổng: *${totalHours}*`);
    if (ot.reason) lines.push(`💬 Lý do: ${ot.reason}`);

    for (const approverId of recipients) {
      await sendOvertimeSubmittedNotification({
        managerId:    approverId,
        employeeName,
        workDate:     String(ot.work_date).split('T')[0],
        startTime:    ot.start_time,
        endTime:      ot.end_time,
        totalHours,
        overtimeId:   ot.id,
        companyName,
      }).catch(console.error);

      // Gửi kèm nút Duyệt / Từ chối ngay trên Telegram
      await sendApprovalRequest({ type: 'ot', id: ot.id, approverUserId: approverId, title: 'Khai Báo Tăng Ca Mới', lines });
    }
  } catch (e) {
    console.error('notifyManagerOfOvertime error:', e);
  }
}
