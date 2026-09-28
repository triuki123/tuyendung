import { NextRequest, NextResponse } from 'next/server';
import { requireWarehouseManager } from '@/lib/warehouse/adminGuard';
import {
  listSupplies, createSupply, updateSupply, deleteSupply, getSupply,
  type SupplyKind,
} from '@/lib/services/warehouseSupplyService';

export const dynamic = 'force-dynamic';

const KINDS: SupplyKind[] = ['material', 'tool'];

/** GET: danh sách vật tư kèm tồn kho (?warehouseId=&kind=material|tool&all=1) */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const warehouseId = sp.get('warehouseId');
    const guard = await requireWarehouseManager(request, warehouseId, 'view');
    if ('response' in guard) return guard.response;

    const kindRaw = sp.get('kind');
    const kind = KINDS.includes(kindRaw as SupplyKind) ? (kindRaw as SupplyKind) : undefined;

    const rows = await listSupplies(warehouseId!, { kind, includeInactive: sp.get('all') === '1' });
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/warehouse/admin/supplies error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST: thêm vật tư. Body { warehouseId, name, kind, unit, minQuantity?, note? } */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const guard = await requireWarehouseManager(request, body.warehouseId, 'create');
    if ('response' in guard) return guard.response;

    if (!body.name?.trim()) return NextResponse.json({ error: 'Nhập tên vật tư' }, { status: 400 });
    if (!KINDS.includes(body.kind)) return NextResponse.json({ error: 'Chọn loại vật tư' }, { status: 400 });

    const row = await createSupply({
      warehouseId: body.warehouseId,
      name: body.name,
      kind: body.kind,
      unit: body.unit,
      minQuantity: body.minQuantity === '' || body.minQuantity == null ? null : Number(body.minQuantity),
      note: body.note,
      createdBy: guard.actor.id,
    });
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    console.error('POST /api/warehouse/admin/supplies error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT: sửa vật tư. Body { warehouseId, id, name?, unit?, min_quantity?, note?, active? } */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const guard = await requireWarehouseManager(request, body.warehouseId, 'edit');
    if ('response' in guard) return guard.response;

    // Vật tư phải thuộc ĐÚNG kho đã qua guard — nếu không, người quản lý kho A
    // có thể sửa vật tư của kho B bằng cách gửi warehouseId của kho mình.
    const supply = await getSupply(body.id);
    if (!supply || supply.warehouse_id !== body.warehouseId) {
      return NextResponse.json({ error: 'Không tìm thấy vật tư trong kho này' }, { status: 404 });
    }

    await updateSupply(body.id, body);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/warehouse/admin/supplies error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE: xóa vật tư + toàn bộ sổ biến động (?warehouseId=&id=) */
export async function DELETE(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const warehouseId = sp.get('warehouseId');
    const id = sp.get('id');
    const guard = await requireWarehouseManager(request, warehouseId, 'delete');
    if ('response' in guard) return guard.response;
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });

    const supply = await getSupply(id);
    if (!supply || supply.warehouse_id !== warehouseId) {
      return NextResponse.json({ error: 'Không tìm thấy vật tư trong kho này' }, { status: 404 });
    }

    await deleteSupply(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/warehouse/admin/supplies error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
