import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/leaveTypeService';
import { checkUnitAccess } from '@/lib/api-permissions';
import { resolveAttendanceConfig } from '@/lib/services/attendanceSettingsService';

export const dynamic = 'force-dynamic';

/**
 * GET — danh sách loại phép.
 * ?all=true (admin) → tất cả loại kể cả đã tắt, không lọc company.
 * Mặc định → chỉ active, lọc theo company của user hiện tại.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedAll = searchParams.get('all') === 'true';
    const companyId = request.headers.get('x-current-user-company');
    const role = request.headers.get('x-current-user-role') || '';

    if (requestedAll) {
      if (!checkUnitAccess(request, 'cham-cong-leave-config', 'view')) {
        return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
      }
      const data = await svc.getLeaveTypes(false, role === 'super_admin' ? null : companyId);
      return NextResponse.json({ success: true, data });
    }

    const data = await svc.getLeaveTypes(true, companyId);
    // Thuộc tính sử dụng phép năm kế thừa Quy tắc chấm công của công ty hiện tại.
    const config = await resolveAttendanceConfig(companyId);
    const resolved = data.map((type) => type.code === 'annual' ? {
      ...type,
      allow_hourly: config.annualLeavePolicy.allowHourly,
      allow_half_day: config.annualLeavePolicy.allowHalfDay,
      count_sunday: config.annualLeavePolicy.countSunday,
    } : type);
    return NextResponse.json({ success: true, data: resolved });
  } catch (err) {
    console.error('GET /api/leave/types error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST — admin tạo loại phép. company_id trong body: null = toàn hệ thống, có id = riêng công ty. */
export async function POST(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'cham-cong-leave-config', 'create')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    if (!body.code || !body.name) {
      return NextResponse.json({ error: 'Thiếu mã (code) hoặc tên loại phép' }, { status: 400 });
    }
    if (String(body.code).trim().toLowerCase() === 'annual') {
      return NextResponse.json(
        { error: 'Phép năm là loại hệ thống, hãy cấu hình tại Quy tắc chấm công' },
        { status: 400 },
      );
    }
    const role = request.headers.get('x-current-user-role') || '';
    const companyId = request.headers.get('x-current-user-company');
    if (role !== 'super_admin' && !companyId) {
      return NextResponse.json({ error: 'Tài khoản chưa được gán công ty' }, { status: 403 });
    }
    const data = await svc.createLeaveType({
      ...body,
      company_ids: role === 'super_admin' ? body.company_ids : [companyId],
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === '23505') {
      return NextResponse.json({ error: 'Mã loại phép đã tồn tại' }, { status: 409 });
    }
    console.error('POST /api/leave/types error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
