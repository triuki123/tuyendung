import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/attendanceService';
import { resolveAttendanceConfigForUser } from '@/lib/services/attendanceSettingsService';
import { requireCompanyContext } from '@/lib/apiAuth';
import { getCompanyMemberUserIds } from '@/lib/services/userCompanyService';

/**
 * GET /api/attendance/user-records?userId=X&month=Y&year=Z
 * Dành cho quản lý xem dữ liệu chấm công của nhân viên khi duyệt bảng công.
 * Mọi manager đều có thể XEM; quyền attendance.approve chỉ cần để duyệt/từ chối.
 *
 * Đa Công Ty: người xem chỉ được xem nhân sự trong PHẠM VI của mình tại công ty
 * đang làm việc — admin: toàn công ty active; manager: bản thân + cấp dưới. Không
 * thể truyền userId của công ty khác để lộ chấm công (client filter ≠ bảo mật).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireCompanyContext(request);
    if ('response' in ctx) return ctx.response;
    const { context } = ctx;
    const callerId = context.user_id;
    const role = context.role;

    const isAdminRole   = role === 'super_admin' || role === 'admin';
    const isManagerRole = role === 'manager';

    // Mọi admin/manager đều có thể xem records của team
    if (!isAdminRole && !isManagerRole) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId');
    if (!targetUserId) return NextResponse.json({ error: 'Thiếu userId' }, { status: 400 });

    // Chốt phạm vi theo công ty active — trừ super_admin (toàn hệ thống).
    if (role !== 'super_admin') {
      let allowedIds: string[];
      if (role === 'admin') {
        allowedIds = context.company_id ? await getCompanyMemberUserIds(context.company_id) : [callerId];
      } else {
        allowedIds = [callerId, ...(await svc.getOrgSubtreeUserIds(callerId, context.company_id || null))];
      }
      if (!allowedIds.includes(targetUserId)) {
        return NextResponse.json(
          { error: 'Nhân sự này không thuộc phạm vi quản lý của bạn tại công ty đang chọn' },
          { status: 403 }
        );
      }
    }

    // Dùng timezone VN để lấy tháng/năm mặc định đúng
    const nowVN = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    const [defYear, defMonth] = nowVN.split('-').map(Number);
    const month = parseInt(searchParams.get('month') ?? String(defMonth));
    const year  = parseInt(searchParams.get('year')  ?? String(defYear));

    // Cấu hình theo công ty của NHÂN VIÊN được xem, neo vào ngày 15 của kỳ.
    const cfg = await resolveAttendanceConfigForUser(targetUserId, `${year}-${String(month).padStart(2, '0')}-15`);
    // getMonthlyDays = records (app + máy) → nhóm ngày → áp cờ "Mặc Định Đủ Công".
    const days    = await svc.getMonthlyDays(targetUserId, month, year, cfg);
    const sheet   = await svc.getOrCreateSheet(targetUserId, month, year);
    const stats   = svc.calcSheetStats(days);

    return NextResponse.json({ success: true, data: { days, sheet: { ...sheet, ...stats } } });
  } catch (err) {
    console.error('GET /api/attendance/user-records error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
