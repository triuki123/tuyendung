import { NextRequest, NextResponse } from 'next/server';
import { requireWarehouseManager } from '@/lib/warehouse/adminGuard';
import { queryOne } from '@/lib/db';
import { createShipmentFromOrder } from '@/lib/services/warehouseOrderService';

export const dynamic = 'force-dynamic';

/** POST: tạo đợt xuất từ đơn (line = phần khách đặt chưa xuất). */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const row = await queryOne<{ warehouse_id: string }>(
      `SELECT warehouse_id FROM warehouse_orders WHERE id = $1`, [params.id]
    );
    if (!row) return NextResponse.json({ error: 'Không tìm thấy đơn hàng' }, { status: 404 });
    const guard = await requireWarehouseManager(request, row.warehouse_id, 'create');
    if ('response' in guard) return guard.response;

    const r = await createShipmentFromOrder(params.id, guard.actor.id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ success: true, data: r.shipment });
  } catch (err) {
    console.error('POST /api/warehouse/admin/orders/[id]/shipment error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
