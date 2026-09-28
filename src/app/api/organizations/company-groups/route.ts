import { NextRequest, NextResponse } from 'next/server';
import { listGroups, createGroup, setCompanyGroup } from '@/lib/services/companyGroupsService';
import { canEditOrgStructure } from '@/lib/api-permissions';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ success: true, data: await listGroups() });
  } catch (err) {
    console.error('GET /api/organizations/company-groups error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST: tạo nhóm { name, parent_id?, description? } HOẶC gán công ty { companyId, groupId }. */
export async function POST(request: NextRequest) {
  try {
    if (!(await canEditOrgStructure(request))) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    if (body.companyId !== undefined) {
      await setCompanyGroup(String(body.companyId), body.groupId ? String(body.groupId) : null);
      return NextResponse.json({ success: true });
    }
    if (!body.name || !String(body.name).trim()) return NextResponse.json({ error: 'Thiếu tên nhóm' }, { status: 400 });
    const data = await createGroup({ name: String(body.name), parent_id: body.parent_id ?? null, description: body.description ?? null });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/organizations/company-groups error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
