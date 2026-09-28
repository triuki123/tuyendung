import { NextRequest, NextResponse } from 'next/server';
import { getCompanyPositionHolders, setCompanyPositionHolders } from '@/lib/services/orgStructureService';
import { getVisibleCompanyIds } from '@/lib/services/userCompanyService';
import { canEditOrgStructure } from '@/lib/api-permissions';

export const dynamic = 'force-dynamic';

async function inScope(request: NextRequest, companyId: string): Promise<boolean> {
  const allowed = await getVisibleCompanyIds(request.headers.get('x-current-user-id'));
  return allowed === null || allowed.includes(companyId);
}

/** GET ?company_id= — { position_id → người giữ chức vụ cấp công ty }. */
export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id');
    if (!companyId) return NextResponse.json({ error: 'Thiếu company_id' }, { status: 400 });
    if (!(await inScope(request, companyId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ success: true, data: await getCompanyPositionHolders(companyId) });
  } catch (err) {
    console.error('GET /api/organizations/company-position-holders error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT { company_id, position_id, user_ids } — thay toàn bộ người giữ 1 chức vụ cấp công ty. */
export async function PUT(request: NextRequest) {
  try {
    if (!(await canEditOrgStructure(request))) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const companyId = String(body.company_id || '');
    const positionId = String(body.position_id || '');
    if (!companyId || !positionId) return NextResponse.json({ error: 'Thiếu company_id/position_id' }, { status: 400 });
    if (!(await inScope(request, companyId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const userIds = Array.isArray(body.user_ids) ? body.user_ids.map((x: any) => String(x)) : [];
    await setCompanyPositionHolders(companyId, positionId, userIds);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/organizations/company-position-holders error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
