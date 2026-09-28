import { NextRequest, NextResponse } from 'next/server';
import { requireWarehouseManager } from '@/lib/warehouse/adminGuard';
import { getOutputDay, saveOutputBatch, listPendingOutputs, reviewOutput } from '@/lib/services/warehouseOutputService';

export const dynamic = 'force-dynamic';

/**
 * GET: sản lượng đã nhập của 1 ngày (?warehouseId=&productId=&date=)
 * hoặc ?warehouseId=&pending=1 → sản lượng công nhân TỰ KHAI chờ duyệt.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const warehouseId = sp.get('warehouseId');
    const guard = await requireWarehouseManager(request, warehouseId);
    if ('response' in guard) return guard.response;
    if (sp.get('pending') === '1') {
      const rows = await listPendingOutputs(warehouseId!);
      return NextResponse.json({ success: true, data: rows });
    }
    const productId = sp.get('productId');
    const date = sp.get('date');
    if (!productId || !date) return NextResponse.json({ error: 'Thiếu productId/date' }, { status: 400 });
    const rows = await getOutputDay(warehouseId!, productId, date);
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/warehouse/admin/output error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * PUT: duyệt sản lượng công nhân tự khai.
 * Body { warehouseId, outputId, action: 'approved'|'deleted', quantity? }
 * (quantity kèm approved = quản lý cập nhật lại con số đúng)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const guard = await requireWarehouseManager(request, body.warehouseId, 'edit');
    if ('response' in guard) return guard.response;
    if (!body.outputId || (body.action !== 'approved' && body.action !== 'deleted')) {
      return NextResponse.json({ error: 'Thiếu outputId/action' }, { status: 400 });
    }
    await reviewOutput({
      outputId: body.outputId,
      action: body.action,
      quantity: body.quantity != null ? Number(body.quantity) : null,
      reviewedBy: guard.actor.id,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/warehouse/admin/output error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST: lưu lô sản lượng. Body { warehouseId, productId, workDate, rows: [{workerId, quantity}] } */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const guard = await requireWarehouseManager(request, body.warehouseId, 'edit');
    if ('response' in guard) return guard.response;
    if (!body.productId || !body.workDate || !Array.isArray(body.rows)) {
      return NextResponse.json({ error: 'Thiếu dữ liệu sản lượng' }, { status: 400 });
    }
    const saved = await saveOutputBatch({
      warehouseId: body.warehouseId,
      productId: body.productId,
      workDate: body.workDate,
      enteredBy: guard.actor.id,
      rows: body.rows.map((r: any) => ({ workerId: r.workerId, quantity: Number(r.quantity) })),
      productionOrderId: body.productionOrderId || null,   // gắn lô SX (optional, mig 296)
    });
    return NextResponse.json({ success: true, saved });
  } catch (err) {
    console.error('POST /api/warehouse/admin/output error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
