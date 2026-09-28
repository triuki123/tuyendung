import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { rejectRequisition, getRequisitionById } from '@/lib/services/requisitionService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

function canDecide(request: NextRequest): boolean {
  const role = request.headers.get('x-current-user-role') || '';
  if (role === 'admin' || role === 'super_admin') return true;
  return checkUnitAccess(request, 'hr-requisitions', 'edit');
}

import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const POST = withRecruitmentUpdate(POSTHandler, 'Yêu cầu tuyển dụng', '/nguon-nhan-luc/yeu-cau-tuyen-dung');
async function POSTHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!canDecide(request)) return NextResponse.json({ error: 'Khong co quyen' }, { status: 403 });

    const userId = request.headers.get('x-current-user-id') || null;
    const activeCompany = request.headers.get('x-current-user-company');
    const effective = userId ? await getEffectiveContext(userId, activeCompany || null) : null;
    const req = await getRequisitionById(params.id);
    if (!req) return NextResponse.json({ error: 'Khong tim thay' }, { status: 404 });
    if (effective?.role === 'admin' && effective.company_id !== req.company_id) {
      return NextResponse.json({ error: 'Khong co quyen' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const data = await rejectRequisition(params.id, userId, body.reason || '');
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('POST /api/hr/requisitions/:id/reject error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Loi server' }, { status: 500 });
  }
}
