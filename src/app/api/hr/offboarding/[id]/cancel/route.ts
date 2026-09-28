import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as offboarding from '@/lib/services/offboardingService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

async function assertCompanyScope(request: NextRequest, processId: string): Promise<{ error: string; status: number } | null> {
  const userId = request.headers.get('x-current-user-id');
  if (!userId) return { error: 'Chưa đăng nhập', status: 401 };
  const activeCompany = request.headers.get('x-current-user-company');
  const ctx = await getEffectiveContext(userId, activeCompany);
  if (ctx?.role === 'super_admin') return null;
  if (activeCompany) {
    const ownerCompany = await offboarding.getProcessOwnerCompanyId(processId);
    if (ownerCompany && ownerCompany !== activeCompany) {
      return { error: 'Không có quyền thao tác với quy trình này', status: 403 };
    }
  }
  return null;
}

/** POST /api/hr/offboarding/[id]/cancel — hủy quy trình (rút đơn, tạo nhầm…). Body: { reason } */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const POST = withRecruitmentUpdate(POSTHandler, 'Offboarding', '/nguon-nhan-luc/offboarding');
async function POSTHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'hr-offboarding', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const scopeErr = await assertCompanyScope(request, params.id);
    if (scopeErr) return NextResponse.json({ error: scopeErr.error }, { status: scopeErr.status });
    const actorId = request.headers.get('x-current-user-id');
    const body = await request.json().catch(() => ({}));
    const data = await offboarding.cancelProcess(params.id, actorId, body.reason || '');
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('POST /api/hr/offboarding/[id]/cancel error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 400 });
  }
}
