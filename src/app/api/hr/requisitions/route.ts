import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { listRequisitions, createRequisition } from '@/lib/services/requisitionService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';
import { buildRequisitionScope, isRequisitionVisible } from '@/lib/services/requisitionVisibility';

export const dynamic = 'force-dynamic';

function canAccessRequisitions(request: NextRequest, action: 'view' | 'create' | 'edit' | 'delete'): boolean {
  // Route dùng chung cho 2 module: cổng đặt yêu cầu của phòng ban
  // ('recruitment-order') VÀ phía HR tiếp nhận ('hr-requisitions').
  return (
    checkUnitAccess(request, 'recruitment-order', action) ||
    checkUnitAccess(request, 'hr-requisitions', action)
  );
}

export async function GET(request: NextRequest) {
  try {
    if (!canAccessRequisitions(request, 'view')) {
      return NextResponse.json({ error: 'Khong co quyen' }, { status: 403 });
    }

    const userId = request.headers.get('x-current-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Chua dang nhap' }, { status: 401 });
    }

    const activeCompany = request.headers.get('x-current-user-company');
    const effective = await getEffectiveContext(userId, activeCompany || null);
    if (!effective) {
      return NextResponse.json({ error: 'Khong xac dinh duoc ngu canh cong ty' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const companyId = effective.role === 'super_admin'
      ? searchParams.get('company_id') || undefined
      : effective.company_id || '__none__';

    const rawData = await listRequisitions({
      status: searchParams.get('status') || undefined,
      company_id: companyId,
      owner_id: searchParams.get('owner_id') || undefined,
    });

    // Trưởng đơn vị thấy yêu cầu của ĐƠN VỊ mình (dù HR/người khác tạo hộ) hoặc của cấp dưới;
    // bộ phận Tuyển Dụng (hr-requisitions → view) thấy toàn bộ phạm vi công ty.
    const scope = await buildRequisitionScope(
      userId,
      effective.role,
      effective.company_id || null,
      checkUnitAccess(request, 'hr-requisitions', 'view')
    );
    const data = rawData.filter((item) => isRequisitionVisible(scope, item));

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/hr/requisitions error:', err);
    return NextResponse.json({ error: 'Loi server' }, { status: 500 });
  }
}

import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const POST = withRecruitmentUpdate(POSTHandler, 'Yêu cầu tuyển dụng', '/nguon-nhan-luc/yeu-cau-tuyen-dung');
async function POSTHandler(request: NextRequest) {
  try {
    if (!canAccessRequisitions(request, 'create')) {
      return NextResponse.json({ error: 'Khong co quyen' }, { status: 403 });
    }

    const userId = request.headers.get('x-current-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Chua dang nhap' }, { status: 401 });
    }

    const activeCompany = request.headers.get('x-current-user-company');
    const effective = await getEffectiveContext(userId, activeCompany || null);
    if (!effective) {
      return NextResponse.json({ error: 'Khong xac dinh duoc ngu canh cong ty' }, { status: 403 });
    }

    const body = await request.json();
    const companyId = effective.company_id || null;

    if (effective.role !== 'super_admin' && !companyId) {
      return NextResponse.json({ error: 'Khong xac dinh duoc cong ty lam viec' }, { status: 403 });
    }

    // Lưu ý: owner_id = "Người phụ trách tuyển dụng" (recruiter HR nhận yêu cầu),
    // KHÔNG phải cấp dưới của người tạo. Vì vậy không ràng buộc owner_id theo cây
    // tổ chức — người tạo được giao yêu cầu cho bất kỳ recruiter hợp lệ nào.

    const created = await createRequisition({
      ...body,
      company_id: effective.role === 'super_admin' ? body.company_id || null : companyId,
      created_by: userId,
    });
    return NextResponse.json({ success: true, data: created });
  } catch (err) {
    console.error('POST /api/hr/requisitions error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Loi server' }, { status: 500 });
  }
}
