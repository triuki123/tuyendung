import { NextRequest, NextResponse } from 'next/server';
import { listUnitsByCompany, createUnit } from '@/lib/services/orgUnitService';
import { getVisibleCompanyIds, resolveDefaultCompanyId } from '@/lib/services/userCompanyService';
import { canEditOrgStructure } from '@/lib/api-permissions';

export const dynamic = 'force-dynamic';

async function scopedCompanyId(request: NextRequest, requested: string | null): Promise<{ companyId: string | null; forbidden: boolean }> {
  const allowed = await getVisibleCompanyIds(request.headers.get('x-current-user-id'));
  if (requested) {
    if (allowed !== null && !allowed.includes(requested)) return { companyId: null, forbidden: true };
    return { companyId: requested, forbidden: false };
  }
  return { companyId: resolveDefaultCompanyId(allowed, request.headers.get('x-current-user-company')), forbidden: false };
}

/** GET ?companyId= — danh sách đơn vị (client dựng cây). */
export async function GET(request: NextRequest) {
  try {
    const { companyId, forbidden } = await scopedCompanyId(request, request.nextUrl.searchParams.get('companyId'));
    if (forbidden) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!companyId) return NextResponse.json({ success: true, data: [] });
    return NextResponse.json({ success: true, data: await listUnitsByCompany(companyId) });
  } catch (err) {
    console.error('GET /api/organizations/units error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await canEditOrgStructure(request))) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const { companyId, forbidden } = await scopedCompanyId(request, body.company_id ?? null);
    if (forbidden) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!companyId) return NextResponse.json({ error: 'Thiếu công ty' }, { status: 400 });
    if (!body.name || !String(body.name).trim()) return NextResponse.json({ error: 'Thiếu tên đơn vị' }, { status: 400 });
    const data = await createUnit({
      company_id: companyId,
      parent_id: body.parent_id ?? null,
      level_rank: Number(body.level_rank) || 1,
      name: String(body.name),
      code: body.code ?? null,
      manager_id: body.manager_id ?? null,
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/organizations/units error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
