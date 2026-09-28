import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as offboarding from '@/lib/services/offboardingService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

async function resolveAndValidateProcess(request: NextRequest, processId: string) {
  const userId = request.headers.get('x-current-user-id');
  if (!userId) return { error: 'Chưa đăng nhập', status: 401 };

  const activeCompany = request.headers.get('x-current-user-company');
  const effectiveContext = await getEffectiveContext(userId, activeCompany);
  const role = effectiveContext?.role ?? 'user';

  const data = await offboarding.getProcess(processId);
  if (!data) return { error: 'Quy trình không tồn tại', status: 404 };

  // super_admin xem toàn hệ thống; role khác phải đúng công ty
  if (role !== 'super_admin' && activeCompany) {
    if (data.user_company_id && data.user_company_id !== activeCompany) {
      return { error: 'Không có quyền truy cập quy trình này', status: 403 };
    }
  }

  return { data, role };
}

/** GET /api/hr/offboarding/[id] — chi tiết quy trình + checklist. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'hr-offboarding', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const result = await resolveAndValidateProcess(request, params.id);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true, data: result.data });
  } catch (err) {
    console.error('GET /api/hr/offboarding/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT /api/hr/offboarding/[id] — sửa thông tin cơ bản. */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const PUT = withRecruitmentUpdate(PUTHandler, 'Offboarding', '/nguon-nhan-luc/offboarding');
async function PUTHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'hr-offboarding', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const result = await resolveAndValidateProcess(request, params.id);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

    const body = await request.json();
    const data = await offboarding.updateProcessInfo(params.id, {
      reason: body.reason,
      reasonNote: body.reason_note,
      lastWorkingDate: body.last_working_date,
      sourceTicketId: body.source_ticket_id,
    });
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('PUT /api/hr/offboarding/[id] error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 400 });
  }
}

/** DELETE /api/hr/offboarding/[id] — xóa vĩnh viễn. */
export const DELETE = withRecruitmentUpdate(DELETEHandler, 'Offboarding', '/nguon-nhan-luc/offboarding');
async function DELETEHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'hr-offboarding', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const result = await resolveAndValidateProcess(request, params.id);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

    await offboarding.deleteProcess(params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/hr/offboarding/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
