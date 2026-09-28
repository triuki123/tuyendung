import { NextRequest, NextResponse } from 'next/server';
import { listActiveRanks, listAllRanks, createRank } from '@/lib/services/positionRankService';
import { canEditOrgStructure } from '@/lib/api-permissions';

export const dynamic = 'force-dynamic';

/** GET ?all=1 → gồm cả mức đã ẩn (màn quản lý); mặc định chỉ mức đang bật. */
export async function GET(request: NextRequest) {
  try {
    const all = request.nextUrl.searchParams.get('all') === '1';
    const data = all ? await listAllRanks() : await listActiveRanks();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/organizations/position-ranks error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await canEditOrgStructure(request))) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const rank = Number(body.rank);
    if (!Number.isFinite(rank) || rank < 1) return NextResponse.json({ error: 'Số cấp bậc phải ≥ 1' }, { status: 400 });
    if (!body.label || !String(body.label).trim()) return NextResponse.json({ error: 'Thiếu tên cấp bậc' }, { status: 400 });
    const data = await createRank({ rank, label: String(body.label), description: body.description, color: body.color });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/organizations/position-ranks error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
