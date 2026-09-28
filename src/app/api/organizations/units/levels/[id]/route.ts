import { NextRequest, NextResponse } from 'next/server';
import { updateLevel, deleteLevel } from '@/lib/services/orgUnitService';
import { canEditOrgStructure } from '@/lib/api-permissions';

export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!(await canEditOrgStructure(request))) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    await updateLevel(params.id, body);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/organizations/units/levels/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!(await canEditOrgStructure(request))) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    await deleteLevel(params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/organizations/units/levels/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
