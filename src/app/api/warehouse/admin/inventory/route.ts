import { NextRequest, NextResponse } from 'next/server';
import { requireWarehouseManager } from '@/lib/warehouse/adminGuard';
import * as inv from '@/lib/services/warehouseInventoryService';

export const dynamic = 'force-dynamic';

/**
 * Tồn kho sản xuất (hàng thô + thành phẩm + giá vốn BQ).
 * GET ?warehouseId=&view=overview            → tồn + giá vốn mọi mặt hàng
 * GET ?warehouseId=&view=items               → danh mục hàng (kèm inactive)
 * GET ?warehouseId=&view=moves&itemId=       → sổ chi tiết 1 mặt hàng
 * GET ?warehouseId=&view=xnt&from=&to=       → báo cáo Xuất-Nhập-Tồn theo kỳ
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const warehouseId = sp.get('warehouseId');
    const guard = await requireWarehouseManager(request, warehouseId);
    if ('response' in guard) return guard.response;

    const view = sp.get('view') || 'overview';
    if (view === 'items') {
      return NextResponse.json({ success: true, data: await inv.listItems(warehouseId!, true) });
    }
    if (view === 'moves') {
      const itemId = sp.get('itemId');
      if (!itemId) return NextResponse.json({ error: 'Thiếu itemId' }, { status: 400 });
      return NextResponse.json({ success: true, data: await inv.getItemMoves(itemId) });
    }
    if (view === 'xnt') {
      const from = sp.get('from');
      const to = sp.get('to');
      if (!from || !to) return NextResponse.json({ error: 'Thiếu from/to' }, { status: 400 });
      return NextResponse.json({ success: true, data: await inv.getXntReport(warehouseId!, from, to) });
    }
    return NextResponse.json({
      success: true,
      data: await inv.getStockOverview(warehouseId!, sp.get('all') === '1'),
    });
  } catch (err) {
    console.error('GET /api/warehouse/admin/inventory error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * POST — tạo mặt hàng hoặc ghi sổ (nhập thô / kiểm kê).
 * Body { warehouseId, action: 'create_item', ...item }
 * Body { warehouseId, action: 'stock_move', itemId, moveType, quantity, unitCost?, note? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const guard = await requireWarehouseManager(request, body.warehouseId, 'edit');
    if ('response' in guard) return guard.response;

    if (body.action === 'create_item') {
      const result = await inv.createItem({
        warehouseId: body.warehouseId,
        sku: String(body.sku || ''),
        barcode: body.barcode || null,
        name: String(body.name || '').trim(),
        itemType: ['finished', 'semi'].includes(body.itemType) ? body.itemType : 'raw',
        unit: body.unit || 'cái',
        unitsPerCarton: body.unitsPerCarton != null && body.unitsPerCarton !== '' ? Number(body.unitsPerCarton) : null,
        minQuantity: body.minQuantity != null && body.minQuantity !== '' ? Number(body.minQuantity) : null,
        note: body.note || null,
        createdBy: guard.actor.id,
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true, data: result.item }, { status: 201 });
    }

    // Tự sinh barcode EAN-13 nội bộ. itemId kèm theo → lưu thẳng vào mặt hàng.
    if (body.action === 'generate_barcode') {
      const result = await inv.generateItemBarcode(body.warehouseId, body.itemId || null);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true, barcode: result.barcode });
    }

    if (body.action === 'stock_move') {
      const moveType = body.moveType;
      if (!['purchase_in', 'adjust_in', 'adjust_out'].includes(moveType)) {
        return NextResponse.json({ error: 'moveType không hợp lệ' }, { status: 400 });
      }
      const result = await inv.addStockMove({
        warehouseId: body.warehouseId,
        itemId: String(body.itemId || ''),
        moveType,
        quantity: Number(body.quantity),
        unitCost: body.unitCost != null && body.unitCost !== '' ? Number(body.unitCost) : null,
        note: body.note || null,
        createdBy: guard.actor.id,
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'action không hợp lệ' }, { status: 400 });
  } catch (err) {
    console.error('POST /api/warehouse/admin/inventory error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * PUT — sửa mặt hàng, hoặc sửa GIÁ một lượt nhập đã ghi.
 * Body sửa hàng: { warehouseId, itemId, ...fields }
 * Body sửa giá:  { warehouseId, action: 'update_move_cost', moveId, unitCost }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const guard = await requireWarehouseManager(request, body.warehouseId, 'edit');
    if ('response' in guard) return guard.response;

    if (body.action === 'update_move_cost') {
      if (!body.moveId) return NextResponse.json({ error: 'Thiếu moveId' }, { status: 400 });
      const { queryOne } = await import('@/lib/db');
      const actor = await queryOne<{ name: string }>(`SELECT name FROM users WHERE id = $1::uuid`, [guard.actor.id]);
      const result = await inv.updateStockMoveCost({
        moveId: body.moveId,
        unitCost: body.unitCost != null && body.unitCost !== '' ? Number(body.unitCost) : null,
        editedByName: actor?.name || guard.actor.id,
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    if (!body.itemId) return NextResponse.json({ error: 'Thiếu itemId' }, { status: 400 });
    await inv.updateItem(body.itemId, body);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/warehouse/admin/inventory error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * DELETE — xoá mặt hàng (?warehouseId=&itemId=). Quyền RBAC Xóa.
 * Chỉ xoá được khi CHƯA có sổ/định mức/lệnh SX — có rồi thì service trả lỗi hướng dẫn ẨN.
 */
export async function DELETE(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const warehouseId = sp.get('warehouseId');
    const guard = await requireWarehouseManager(request, warehouseId, 'delete');
    if ('response' in guard) return guard.response;
    const itemId = sp.get('itemId');
    if (!itemId) return NextResponse.json({ error: 'Thiếu itemId' }, { status: 400 });
    const result = await inv.deleteItem(itemId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/warehouse/admin/inventory error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
