import { NextRequest, NextResponse } from 'next/server';
import { requireWarehouseManager } from '@/lib/warehouse/adminGuard';
import { getRanking } from '@/lib/services/warehouseOutputService';

export const dynamic = 'force-dynamic';

/** GET: xếp hạng công nhân (?warehouseId=&from=YYYY-MM-DD&to=YYYY-MM-DD) */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const warehouseId = sp.get('warehouseId');
    const guard = await requireWarehouseManager(request, warehouseId);
    if ('response' in guard) return guard.response;
    const from = sp.get('from');
    const to = sp.get('to');
    if (!from || !to) return NextResponse.json({ error: 'Thiếu khoảng ngày from/to' }, { status: 400 });
    const rows = await getRanking(warehouseId!, from, to);
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/warehouse/admin/ranking error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
