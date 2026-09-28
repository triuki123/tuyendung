import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getRequisitionById, updateRequisition, deleteRequisition } from '@/lib/services/requisitionService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';
import { buildRequisitionScope, isRequisitionVisible } from '@/lib/services/requisitionVisibility';

export const dynamic = 'force-dynamic';

function canAccessRequisitions(request: NextRequest, action: 'view' | 'create' | 'edit' | 'delete'): boolean {
  // Route dùng chung cho 2 module: cổng đặt yêu cầu của phòng ban
  // ('recruitment-order') VÀ phía HR tiếp nhận ('hr-requisitions').
  // Quyền theo bản ghi vẫn được siết ở canAccessRequisitionRecord bên dưới.
  return (
    checkUnitAccess(request, 'recruitment-order', action) ||
    checkUnitAccess(request, 'hr-requisitions', action)
  );
}

async function canAccessRequisitionRecord(request: NextRequest, data: Awaited<ReturnType<typeof getRequisitionById>>) {
  const userId = request.headers.get('x-current-user-id');
  const activeCompany = request.headers.get('x-current-user-company');
  if (!userId || !data) return false;

  const effective = await getEffectiveContext(userId, activeCompany || null);
  if (!effective) return false;
  if (effective.role === 'super_admin') return true;
  if (!effective.company_id || data.company_id !== effective.company_id) return false;
  // Cùng luật phạm vi với route danh sách: đơn vị mình phụ trách HOẶC cây cấp dưới;
  // bộ phận Tuyển Dụng không bị lọc theo cây người. (Action edit/delete vẫn gác riêng ở trên.)
  const scope = await buildRequisitionScope(
    userId,
    effective.role,
    effective.company_id,
    checkUnitAccess(request, 'hr-requisitions', 'view')
  );
  return isRequisitionVisible(scope, data);
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!canAccessRequisitions(request, 'view')) {
      return NextResponse.json({ error: 'Khong co quyen' }, { status: 403 });
    }
    const data = await getRequisitionById(params.id);
    if (!data) return NextResponse.json({ error: 'Khong tim thay' }, { status: 404 });
    if (!(await canAccessRequisitionRecord(request, data))) {
      return NextResponse.json({ error: 'Khong co quyen' }, { status: 403 });
    }
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/hr/requisitions/:id error:', err);
    return NextResponse.json({ error: 'Loi server' }, { status: 500 });
  }
}

import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const PUT = withRecruitmentUpdate(PUTHandler, 'Yêu cầu tuyển dụng', '/nguon-nhan-luc/yeu-cau-tuyen-dung');
async function PUTHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!canAccessRequisitions(request, 'edit')) {
      return NextResponse.json({ error: 'Khong co quyen' }, { status: 403 });
    }
    const existing = await getRequisitionById(params.id);
    if (!existing) return NextResponse.json({ error: 'Khong tim thay' }, { status: 404 });
    if (!(await canAccessRequisitionRecord(request, existing))) {
      return NextResponse.json({ error: 'Khong co quyen' }, { status: 403 });
    }
    const body = await request.json();
    const data = await updateRequisition(params.id, body, request.headers.get('x-current-user-id'));
    if (!data) return NextResponse.json({ error: 'Khong tim thay' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('PUT /api/hr/requisitions/:id error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Loi server' }, { status: 500 });
  }
}

export const DELETE = withRecruitmentUpdate(DELETEHandler, 'Yêu cầu tuyển dụng', '/nguon-nhan-luc/yeu-cau-tuyen-dung');
async function DELETEHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!canAccessRequisitions(request, 'delete')) {
      return NextResponse.json({ error: 'Khong co quyen' }, { status: 403 });
    }
    const existing = await getRequisitionById(params.id);
    if (!existing) return NextResponse.json({ error: 'Khong tim thay' }, { status: 404 });
    if (!(await canAccessRequisitionRecord(request, existing))) {
      return NextResponse.json({ error: 'Khong co quyen' }, { status: 403 });
    }
    await deleteRequisition(params.id, request.headers.get('x-current-user-id'));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/hr/requisitions/:id error:', err);
    return NextResponse.json({ error: 'Loi server' }, { status: 500 });
  }
}
