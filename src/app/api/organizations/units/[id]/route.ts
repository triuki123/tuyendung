import { NextRequest, NextResponse } from 'next/server';
import { updateUnit, deleteUnit } from '@/lib/services/orgUnitService';
import { canEditOrgStructure } from '@/lib/api-permissions';

export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!(await canEditOrgStructure(request))) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    if (body.parent_id === params.id) {
      return NextResponse.json({ error: 'Đơn vị không thể là cấp trên của chính nó' }, { status: 400 });
    }
    await updateUnit(params.id, body);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/organizations/units/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!(await canEditOrgStructure(request))) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const res = await deleteUnit(params.id);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/organizations/units/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
