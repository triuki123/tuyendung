import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getRequisitionById } from '@/lib/services/requisitionService';
import { listRequisitionWorkflow } from '@/lib/services/requisitionWorkflowService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';
import { buildRequisitionScope, isRequisitionVisible } from '@/lib/services/requisitionVisibility';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const permitted = checkUnitAccess(request, 'recruitment-order', 'view') || checkUnitAccess(request, 'hr-requisitions', 'view');
    const requisition = await getRequisitionById(params.id);
    const userId = request.headers.get('x-current-user-id');
    const effective = userId ? await getEffectiveContext(userId, request.headers.get('x-current-user-company')) : null;
    const scope = effective ? await buildRequisitionScope(userId!, effective.role, effective.company_id, checkUnitAccess(request, 'hr-requisitions', 'view')) : null;
    if (!permitted || !requisition || !scope || !isRequisitionVisible(scope, requisition)) return NextResponse.json({ error: 'Khong co quyen hoac khong tim thay yeu cau' }, { status: 403 });
    return NextResponse.json({ success: true, data: await listRequisitionWorkflow(params.id) });
  } catch (error) {
    console.error('GET /api/hr/requisitions/:id/workflow error:', error);
    return NextResponse.json({ error: 'Loi tai quy trinh tuyen dung' }, { status: 500 });
  }
}
