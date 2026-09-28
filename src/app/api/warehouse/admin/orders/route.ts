import { NextRequest, NextResponse } from 'next/server';
import { requireWarehouseManager } from '@/lib/warehouse/adminGuard';
import { listOrders, createOrder } from '@/lib/services/warehouseOrderService';

export const dynamic = 'force-dynamic';

/** GET: danh sách đơn hàng (?warehouseId=&status=) */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const warehouseId = sp.get('warehouseId');
    const guard = await requireWarehouseManager(request, warehouseId, 'view');
    if ('response' in guard) return guard.response;
    const rows = await listOrders(warehouseId!, sp.get('status') || undefined);
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/warehouse/admin/orders error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST: tạo đơn. Body { warehouseId, customerName, customerContact?, expectedDate?, note?, lines: [{itemId, quantity}] } */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const guard = await requireWarehouseManager(request, body.warehouseId, 'create');
    if ('response' in guard) return guard.response;
    const r = await createOrder({ ...body, createdBy: guard.actor.id });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ success: true, data: r.order });
  } catch (err) {
    console.error('POST /api/warehouse/admin/orders error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
