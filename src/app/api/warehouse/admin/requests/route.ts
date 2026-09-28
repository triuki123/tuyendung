import { NextRequest, NextResponse } from 'next/server';
import { requireWarehouseManager } from '@/lib/warehouse/adminGuard';
import { listPendingRequests, decideRequest, getWarehouse } from '@/lib/services/warehouseService';

export const dynamic = 'force-dynamic';

/** GET: đơn nghỉ + ứng lương của kho (?warehouseId=) */
export async function GET(request: NextRequest) {
  try {
    const warehouseId = request.nextUrl.searchParams.get('warehouseId');
    const guard = await requireWarehouseManager(request, warehouseId);
    if ('response' in guard) return guard.response;
    const [data, wh] = await Promise.all([listPendingRequests(warehouseId!), getWarehouse(warehouseId!)]);
    return NextResponse.json({ success: true, data, advance_enabled: !!wh?.advance_enabled });
  } catch (err) {
    console.error('GET /api/warehouse/admin/requests error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST: duyệt/từ chối. Body { warehouseId, kind: 'leave'|'advance', id, approve: boolean } */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const guard = await requireWarehouseManager(request, body.warehouseId, 'edit');
    if ('response' in guard) return guard.response;
    if (!body.id || !['leave', 'advance'].includes(body.kind)) {
      return NextResponse.json({ error: 'Thiếu dữ liệu' }, { status: 400 });
    }
    await decideRequest(body.kind, body.id, !!body.approve, guard.actor.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/warehouse/admin/requests error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
