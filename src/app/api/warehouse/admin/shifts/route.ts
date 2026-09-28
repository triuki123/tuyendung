import { NextRequest, NextResponse } from 'next/server';
import { requireWarehouseManager, requireWarehouseConfigurer } from '@/lib/warehouse/adminGuard';
import { listShifts, createShift, updateShift } from '@/lib/services/warehouseService';

export const dynamic = 'force-dynamic';

/** GET: danh sách ca (?warehouseId=) */
export async function GET(request: NextRequest) {
  try {
    const warehouseId = request.nextUrl.searchParams.get('warehouseId');
    const guard = await requireWarehouseManager(request, warehouseId);
    if ('response' in guard) return guard.response;
    const rows = await listShifts(warehouseId!, true);
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/warehouse/admin/shifts error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST: tạo ca. Body { warehouseId, name, start_time, end_time } */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const guard = await requireWarehouseConfigurer(request, body.warehouseId, 'create');
    if ('response' in guard) return guard.response;
    if (!body.name || !body.start_time || !body.end_time) {
      return NextResponse.json({ error: 'Nhập tên ca và giờ bắt đầu/kết thúc' }, { status: 400 });
    }
    const row = await createShift(body.warehouseId, body.name, body.start_time, body.end_time);
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    console.error('POST /api/warehouse/admin/shifts error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT: sửa/tắt ca. Body { warehouseId, id, ... } */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const guard = await requireWarehouseConfigurer(request, body.warehouseId, 'edit');
    if ('response' in guard) return guard.response;
    await updateShift(body.id, body);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/warehouse/admin/shifts error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
