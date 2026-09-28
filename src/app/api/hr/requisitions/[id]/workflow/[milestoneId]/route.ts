import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getRequisitionById } from '@/lib/services/requisitionService';
import { updateRequisitionWorkflowMilestone } from '@/lib/services/requisitionWorkflowService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';
import { buildRequisitionScope, isRequisitionVisible } from '@/lib/services/requisitionVisibility';

export const dynamic = 'force-dynamic';

import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const PATCH = withRecruitmentUpdate(PATCHHandler, 'Yêu cầu tuyển dụng', '/nguon-nhan-luc/yeu-cau-tuyen-dung');
async function PATCHHandler(request: NextRequest, { params }: { params: { id: string; milestoneId: string } }) {
  try {
    const permitted = checkUnitAccess(request, 'recruitment-order', 'edit') || checkUnitAccess(request, 'hr-requisitions', 'edit');
    const requisition = await getRequisitionById(params.id);
    const userId = request.headers.get('x-current-user-id');
    const effective = userId ? await getEffectiveContext(userId, request.headers.get('x-current-user-company')) : null;
    const scope = effective ? await buildRequisitionScope(userId!, effective.role, effective.company_id, checkUnitAccess(request, 'hr-requisitions', 'view')) : null;
    if (!permitted || !requisition || !scope || !isRequisitionVisible(scope, requisition)) return NextResponse.json({ error: 'Khong co quyen hoac khong tim thay yeu cau' }, { status: 403 });
    const body = await request.json();
    const data = await updateRequisitionWorkflowMilestone(params.id, params.milestoneId, { status: body.status, note: body.note }, request.headers.get('x-current-user-id'));
    if (!data) return NextResponse.json({ error: 'Khong tim thay moc quy trinh' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('PATCH /api/hr/requisitions/:id/workflow/:milestoneId error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Loi cap nhat quy trinh' }, { status: 500 });
  }
}
