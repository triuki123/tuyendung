import { NextRequest, NextResponse } from 'next/server';
import { requireWarehouseManager } from '@/lib/warehouse/adminGuard';
import { queryOne } from '@/lib/db';
import { getOrder, setOrderStatus, deleteOrder } from '@/lib/services/warehouseOrderService';

export const dynamic = 'force-dynamic';

/** Đơn thuộc kho nào — để guard phạm vi kho trước khi thao tác. */
async function warehouseOf(orderId: string): Promise<string | null> {
  const row = await queryOne<{ warehouse_id: string }>(
    `SELECT warehouse_id FROM warehouse_orders WHERE id = $1`, [orderId]
  );
  return row?.warehouse_id ?? null;
}

/** GET: chi tiết đơn (lines + tồn/đã xuất + lệnh SX + đợt xuất đã gắn) */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const whId = await warehouseOf(params.id);
    if (!whId) return NextResponse.json({ error: 'Không tìm thấy đơn hàng' }, { status: 404 });
    const guard = await requireWarehouseManager(request, whId, 'view');
    if ('response' in guard) return guard.response;
    const order = await getOrder(params.id);
    return NextResponse.json({ success: true, data: order });
  } catch (err) {
    console.error('GET /api/warehouse/admin/orders/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT: chuyển trạng thái. Body { status: 'confirmed'|'cancelled' } */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const whId = await warehouseOf(params.id);
    if (!whId) return NextResponse.json({ error: 'Không tìm thấy đơn hàng' }, { status: 404 });
    const guard = await requireWarehouseManager(request, whId, 'edit');
    if ('response' in guard) return guard.response;
    const body = await request.json();
    const r = await setOrderStatus(params.id, body.status);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/warehouse/admin/orders/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE: xóa đơn nháp */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const whId = await warehouseOf(params.id);
    if (!whId) return NextResponse.json({ error: 'Không tìm thấy đơn hàng' }, { status: 404 });
    const guard = await requireWarehouseManager(request, whId, 'delete');
    if ('response' in guard) return guard.response;
    const r = await deleteOrder(params.id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/warehouse/admin/orders/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
