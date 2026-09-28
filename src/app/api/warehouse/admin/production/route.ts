import { NextRequest, NextResponse } from 'next/server';
import { requireWarehouseManager } from '@/lib/warehouse/adminGuard';
import * as prod from '@/lib/services/warehouseProductionService';
import { queryOne } from '@/lib/db';
import { syncOrderStatus, revertOrderIfNoProduction } from '@/lib/services/warehouseOrderService';

export const dynamic = 'force-dynamic';

/**
 * Sản xuất theo lô + định mức (BOM).
 * GET ?warehouseId=                          → danh sách lệnh sản xuất
 * GET ?warehouseId=&bomFor=<finishedItemId>  → BOM active của thành phẩm
 * GET ?warehouseId=&consumptionOf=<orderId>  → tiêu hao nguyên liệu của lô
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const warehouseId = sp.get('warehouseId');
    const guard = await requireWarehouseManager(request, warehouseId);
    if ('response' in guard) return guard.response;

    const bomFor = sp.get('bomFor');
    if (bomFor) {
      return NextResponse.json({ success: true, data: await prod.getActiveBom(bomFor) });
    }
    const consumptionOf = sp.get('consumptionOf');
    if (consumptionOf) {
      return NextResponse.json({ success: true, data: await prod.getOrderConsumption(consumptionOf) });
    }
    const status = sp.get('status') || undefined;
    return NextResponse.json({ success: true, data: await prod.listProductionOrders(warehouseId!, status) });
  } catch (err) {
    console.error('GET /api/warehouse/admin/production error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * POST — lưu BOM hoặc tạo lô.
 * Body { warehouseId, action: 'save_bom', finishedItemId, name?, lines: [{itemId?|supplyId?, quantity}] }
 * Body { warehouseId, action: 'create_order', finishedItemId, plannedQty, note? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const guard = await requireWarehouseManager(request, body.warehouseId, 'edit');
    if ('response' in guard) return guard.response;

    if (body.action === 'save_bom') {
      const result = await prod.saveBom({
        warehouseId: body.warehouseId,
        finishedItemId: String(body.finishedItemId || ''),
        name: body.name || null,
        lines: Array.isArray(body.lines)
          ? body.lines.map((l: any) => ({
              itemId: l.itemId || null, supplyId: l.supplyId || null, quantity: Number(l.quantity),
            }))
          : [],
        createdBy: guard.actor.id,
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true }, { status: 201 });
    }

    if (body.action === 'create_order') {
      const result = await prod.createProductionOrder({
        warehouseId: body.warehouseId,
        finishedItemId: String(body.finishedItemId || ''),
        plannedQty: Number(body.plannedQty),
        note: body.note || null,
        createdBy: guard.actor.id,
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true, data: result.order }, { status: 201 });
    }

    return NextResponse.json({ error: 'action không hợp lệ' }, { status: 400 });
  } catch (err) {
    console.error('POST /api/warehouse/admin/production error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * PUT — hoàn thành / hủy lô.
 * Body { warehouseId, orderId, action: 'complete', actualQty, wasteQty?, note? }
 * Body { warehouseId, orderId, action: 'cancel' }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const guard = await requireWarehouseManager(request, body.warehouseId, 'edit');
    if ('response' in guard) return guard.response;
    if (!body.orderId) return NextResponse.json({ error: 'Thiếu orderId' }, { status: 400 });

    if (body.action === 'complete') {
      const result = await prod.completeProductionOrder({
        orderId: body.orderId,
        actualQty: Number(body.actualQty),
        wasteQty: body.wasteQty != null && body.wasteQty !== '' ? Number(body.wasteQty) : 0,
        note: body.note || null,
        completedBy: guard.actor.id,
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      // Lô thuộc 1 đơn hàng → tính lại trạng thái đơn (đủ tồn mọi line ⇒ 'ready').
      // Nuốt lỗi: sync hỏng không được làm fail việc hoàn thành lô đã ghi sổ xong.
      try {
        const po = await queryOne<{ order_id: string | null }>(
          `SELECT order_id FROM warehouse_production_orders WHERE id = $1`, [body.orderId]
        );
        if (po?.order_id) await syncOrderStatus(po.order_id);
      } catch (e) { console.error('[production] syncOrderStatus lỗi (bỏ qua):', e); }
      return NextResponse.json({ success: true, materialCost: result.materialCost, unitCost: result.unitCost });
    }

    if (body.action === 'cancel') {
      const result = await prod.cancelProductionOrder(body.orderId);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      // Hủy hết chuỗi lệnh của 1 đơn → trả đơn về 'confirmed' để nổ lại (như DELETE).
      try {
        const po = await queryOne<{ order_id: string | null }>(
          `SELECT order_id FROM warehouse_production_orders WHERE id = $1`, [body.orderId]
        );
        if (po?.order_id) await revertOrderIfNoProduction(po.order_id);
      } catch (e) { console.error('[production] revertOrderIfNoProduction lỗi (bỏ qua):', e); }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'action không hợp lệ' }, { status: 400 });
  } catch (err) {
    console.error('PUT /api/warehouse/admin/production error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE — xoá lô sản xuất (?warehouseId=&orderId=). Quyền RBAC Xóa. Lô đã hoàn thành → service chặn. */
export async function DELETE(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const warehouseId = sp.get('warehouseId');
    const guard = await requireWarehouseManager(request, warehouseId, 'delete');
    if ('response' in guard) return guard.response;
    const orderId = sp.get('orderId');
    if (!orderId) return NextResponse.json({ error: 'Thiếu orderId' }, { status: 400 });
    // Đọc liên kết đơn hàng TRƯỚC khi xóa (xóa xong là mất dấu).
    const po = await queryOne<{ order_id: string | null }>(
      `SELECT order_id FROM warehouse_production_orders WHERE id = $1`, [orderId]
    );
    const result = await prod.deleteProductionOrder(orderId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    // Lô thuộc đơn hàng → nếu không còn lô nào sống, trả đơn về 'confirmed' để nổ lại
    // (không có bước này đơn kẹt ở 'in_production' vĩnh viễn). Nuốt lỗi như syncOrderStatus.
    try {
      if (po?.order_id) await revertOrderIfNoProduction(po.order_id);
    } catch (e) { console.error('[production] revertOrderIfNoProduction lỗi (bỏ qua):', e); }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/warehouse/admin/production error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
