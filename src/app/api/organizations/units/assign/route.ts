import { NextRequest, NextResponse } from 'next/server';
import { assignUserToUnit, listUnitMembers } from '@/lib/services/orgUnitService';
import { canEditOrgStructure } from '@/lib/api-permissions';

export const dynamic = 'force-dynamic';

/** GET ?unitId= — người đang gán trực tiếp vào đơn vị. */
export async function GET(request: NextRequest) {
  try {
    const unitId = request.nextUrl.searchParams.get('unitId');
    if (!unitId) return NextResponse.json({ success: true, data: [] });
    return NextResponse.json({ success: true, data: await listUnitMembers(unitId) });
  } catch (err) {
    console.error('GET /api/organizations/units/assign error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST { userId, unitId } — gán người vào đơn vị (ghi org_unit_id + đồng bộ cột legacy). */
export async function POST(request: NextRequest) {
  try {
    if (!(await canEditOrgStructure(request))) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    if (!body.userId || !body.unitId) return NextResponse.json({ error: 'Thiếu userId/unitId' }, { status: 400 });
    await assignUserToUnit(String(body.userId), String(body.unitId));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/organizations/units/assign error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
