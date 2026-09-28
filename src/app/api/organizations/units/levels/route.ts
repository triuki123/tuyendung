import { NextRequest, NextResponse } from 'next/server';
import { listLevels, createLevel } from '@/lib/services/orgUnitService';
import { canEditOrgStructure } from '@/lib/api-permissions';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ success: true, data: await listLevels() });
  } catch (err) {
    console.error('GET /api/organizations/units/levels error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await canEditOrgStructure(request))) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const rank = Number(body.rank);
    if (!Number.isFinite(rank) || rank < 1) return NextResponse.json({ error: 'Số tầng phải ≥ 1' }, { status: 400 });
    if (!body.name || !String(body.name).trim()) return NextResponse.json({ error: 'Thiếu tên tầng' }, { status: 400 });
    await createLevel(rank, String(body.name));
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error('POST /api/organizations/units/levels error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
