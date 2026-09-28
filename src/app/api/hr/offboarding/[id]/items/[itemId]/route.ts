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

/** PUT /api/hr/offboarding/[id]/items/[itemId] — check/bỏ check 1 đầu mục. Body: { is_done, note? } */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const PUT = withRecruitmentUpdate(PUTHandler, 'Offboarding', '/nguon-nhan-luc/offboarding');
async function PUTHandler(request: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  try {
    if (!checkUnitAccess(request, 'hr-offboarding', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const scopeErr = await assertCompanyScope(request, params.id);
    if (scopeErr) return NextResponse.json({ error: scopeErr.error }, { status: scopeErr.status });
    const actorId = request.headers.get('x-current-user-id');
    const body = await request.json();
    const data = await offboarding.toggleItem(
      params.id, params.itemId, Boolean(body.is_done), actorId,
      body.note !== undefined ? body.note : undefined
    );
    if (!data) return NextResponse.json({ error: 'Đầu mục không tồn tại' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('PUT /api/hr/offboarding items error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 400 });
  }
}
