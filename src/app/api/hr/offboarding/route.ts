import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as offboarding from '@/lib/services/offboardingService';
import { notifyOffboardingCreated, notifyOffboardingAssignees } from '@/lib/services/notificationsService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

/** GET /api/hr/offboarding — danh sách quy trình nghỉ việc (+ đếm theo trạng thái). Query: ?status= */
export async function GET(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'hr-offboarding', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company');
    const effectiveContext = await getEffectiveContext(userId, activeCompany);
    const role = effectiveContext?.role ?? 'user';

    // super_admin xem toàn hệ thống; role khác chỉ xem công ty active
    const companyScope = role === 'super_admin' ? null : activeCompany;

    const status = request.nextUrl.searchParams.get('status') || undefined;
    const [data, counts] = await Promise.all([
      offboarding.listProcesses(status, false, companyScope),
      offboarding.countByStatus(companyScope),
    ]);
    return NextResponse.json({ success: true, data, counts });
  } catch (err) {
    console.error('GET /api/hr/offboarding error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST /api/hr/offboarding — HCNS tạo quy trình nghỉ việc cho 1 nhân sự. */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const POST = withRecruitmentUpdate(POSTHandler, 'Offboarding', '/nguon-nhan-luc/offboarding');
async function POSTHandler(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'hr-offboarding', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const actorId = request.headers.get('x-current-user-id');
    const body = await request.json();
    if (!body.user_id) {
      return NextResponse.json({ error: 'Thiếu nhân sự cần tạo quy trình' }, { status: 400 });
    }
    const data = await offboarding.createProcess({
      userId: String(body.user_id),
      reason: body.reason || 'resignation',
      reasonNote: body.reason_note || null,
      lastWorkingDate: body.last_working_date || null,
      sourceTicketId: body.source_ticket_id || null,
      createdBy: actorId,
    });
    notifyOffboardingCreated(data, actorId).catch(() => {});
    notifyOffboardingAssignees(data, data.items || []).catch(() => {});
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('POST /api/hr/offboarding error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 400 });
  }
}
