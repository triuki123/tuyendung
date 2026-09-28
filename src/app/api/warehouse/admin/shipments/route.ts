import { NextRequest, NextResponse } from 'next/server';
import { requireWarehouseManager } from '@/lib/warehouse/adminGuard';
import * as ship from '@/lib/services/warehouseShipmentService';
import { queryOne } from '@/lib/db';
import { syncOrderStatus } from '@/lib/services/warehouseOrderService';

export const dynamic = 'force-dynamic';

/**
 * Đợt xuất kho + kiểm đếm quét mã.
 * GET ?warehouseId=            → danh sách đợt
 * GET ?warehouseId=&id=        → chi tiết 1 đợt (dòng hàng + log quét)
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const warehouseId = sp.get('warehouseId');
    const guard = await requireWarehouseManager(request, warehouseId);
    if ('response' in guard) return guard.response;
    const id = sp.get('id');
    if (id) {
      const data = await ship.getShipment(id);
      if (!data) return NextResponse.json({ error: 'Không tìm thấy đợt xuất' }, { status: 404 });
      return NextResponse.json({ success: true, data });
    }
    const status = sp.get('status') || undefined;
    return NextResponse.json({ success: true, data: await ship.listShipments(warehouseId!, status) });
  } catch (err) {
    console.error('GET /api/warehouse/admin/shipments error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST — tạo đợt xuất. Body { warehouseId, customer?, note?, lines: [{itemId, qtyPlanned}] } */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const guard = await requireWarehouseManager(request, body.warehouseId, 'edit');
    if ('response' in guard) return guard.response;
    const result = await ship.createShipment({
      warehouseId: body.warehouseId,
      customer: body.customer || null,
      note: body.note || null,
      lines: Array.isArray(body.lines)
        ? body.lines.map((l: any) => ({ itemId: String(l.itemId || ''), qtyPlanned: Number(l.qtyPlanned) }))
        : [],
      createdBy: guard.actor.id,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true, data: result.shipment }, { status: 201 });
  } catch (err) {
    console.error('POST /api/warehouse/admin/shipments error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * PUT — thao tác trên 1 đợt.
 * Body { warehouseId, shipmentId, action: 'start_counting' | 'cancel' }
 * Body { warehouseId, shipmentId, action: 'scan', code, carton? }
 * Body { warehouseId, shipmentId, action: 'set_counted', lineId, qtyCounted }
 * Body { warehouseId, shipmentId, action: 'finalize', allowShort? }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const guard = await requireWarehouseManager(request, body.warehouseId, 'edit');
    if ('response' in guard) return guard.response;
    if (!body.shipmentId) return NextResponse.json({ error: 'Thiếu shipmentId' }, { status: 400 });

    if (body.action === 'start_counting' || body.action === 'cancel') {
      const result = await ship.setShipmentStatus(
        body.shipmentId,
        body.action === 'cancel' ? 'cancelled' : 'counting'
      );
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    if (body.action === 'scan') {
      const result = await ship.scanShipmentCode({
        shipmentId: body.shipmentId,
        code: String(body.code || ''),
        carton: body.carton !== false,
        scannedBy: guard.actor.id,
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true, line: result.line, added: result.added });
    }

    if (body.action === 'set_counted') {
      const result = await ship.setLineCounted({
        lineId: String(body.lineId || ''),
        qtyCounted: Number(body.qtyCounted),
        by: guard.actor.id,
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    if (body.action === 'finalize') {
      const result = await ship.finalizeShipment({
        shipmentId: body.shipmentId,
        allowShort: !!body.allowShort,
        by: guard.actor.id,
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      // Đợt xuất thuộc 1 đơn hàng → tính lại trạng thái đơn (xuất đủ ⇒ 'shipped').
      // Nuốt lỗi: sync hỏng không được làm fail đợt xuất đã ghi sổ xong.
      try {
        const sh = await queryOne<{ order_id: string | null }>(
          `SELECT order_id FROM warehouse_shipments WHERE id = $1`, [body.shipmentId]
        );
        if (sh?.order_id) await syncOrderStatus(sh.order_id);
      } catch (e) { console.error('[shipments] syncOrderStatus lỗi (bỏ qua):', e); }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'action không hợp lệ' }, { status: 400 });
  } catch (err) {
    console.error('PUT /api/warehouse/admin/shipments error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE — xoá đợt xuất (?warehouseId=&id=). Quyền RBAC Xóa. Đợt đã xuất → service chặn. */
export async function DELETE(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const warehouseId = sp.get('warehouseId');
    const guard = await requireWarehouseManager(request, warehouseId, 'delete');
    if ('response' in guard) return guard.response;
    const id = sp.get('id');
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });
    const result = await ship.deleteShipment(id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/warehouse/admin/shipments error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
