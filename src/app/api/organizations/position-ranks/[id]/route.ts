import { NextRequest, NextResponse } from 'next/server';
import { updateRank, deleteRank } from '@/lib/services/positionRankService';
import { canEditOrgStructure } from '@/lib/api-permissions';

export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!(await canEditOrgStructure(request))) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    if (body.rank !== undefined && (!Number.isFinite(Number(body.rank)) || Number(body.rank) < 1)) {
      return NextResponse.json({ error: 'Số cấp bậc phải ≥ 1' }, { status: 400 });
    }
    await updateRank(params.id, body);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/organizations/position-ranks/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!(await canEditOrgStructure(request))) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    await deleteRank(params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/organizations/position-ranks/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
