import { NextRequest, NextResponse } from 'next/server';
import { requireWarehouseManager } from '@/lib/warehouse/adminGuard';
import { queryOne } from '@/lib/db';
import { planProduction, createProductionChain } from '@/lib/services/warehouseOrderService';

export const dynamic = 'force-dynamic';

async function warehouseOf(orderId: string): Promise<string | null> {
  const row = await queryOne<{ warehouse_id: string }>(
    `SELECT warehouse_id FROM warehouse_orders WHERE id = $1`, [orderId]
  );
  return row?.warehouse_id ?? null;
}

/** GET: cây đề xuất sản xuất (MRP-lite đệ quy) + cảnh báo nguyên liệu thiếu. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const whId = await warehouseOf(params.id);
    if (!whId) return NextResponse.json({ error: 'Không tìm thấy đơn hàng' }, { status: 404 });
    const guard = await requireWarehouseManager(request, whId, 'view');
    if ('response' in guard) return guard.response;
    const r = await planProduction(params.id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ success: true, data: r.plan });
  } catch (err) {
    console.error('GET /api/warehouse/admin/orders/[id]/plan error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST: tạo CHUỖI lệnh SX từ cây đã duyệt. Body { nodes: [{itemId, qty, level}] } */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const whId = await warehouseOf(params.id);
    if (!whId) return NextResponse.json({ error: 'Không tìm thấy đơn hàng' }, { status: 404 });
    const guard = await requireWarehouseManager(request, whId, 'create');
    if ('response' in guard) return guard.response;
    const body = await request.json();
    const r = await createProductionChain({
      orderId: params.id,
      nodes: Array.isArray(body.nodes) ? body.nodes : [],
      createdBy: guard.actor.id,
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ success: true, data: r.created });
  } catch (err) {
    console.error('POST /api/warehouse/admin/orders/[id]/plan error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
