import { NextRequest, NextResponse } from 'next/server';
import { updateGroup, deleteGroup } from '@/lib/services/companyGroupsService';
import { canEditOrgStructure } from '@/lib/api-permissions';

export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!(await canEditOrgStructure(request))) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    if (body.parent_id === params.id) return NextResponse.json({ error: 'Nhóm không thể là cấp trên của chính nó' }, { status: 400 });
    await updateGroup(params.id, body);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/organizations/company-groups/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!(await canEditOrgStructure(request))) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    await deleteGroup(params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/organizations/company-groups/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
