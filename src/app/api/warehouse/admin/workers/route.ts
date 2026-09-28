import { NextRequest, NextResponse } from 'next/server';
import { requireWarehouseManager } from '@/lib/warehouse/adminGuard';
import { listWorkers, createWorker } from '@/lib/services/warehouseService';
import { generatePin } from '@/lib/warehouse/workerAuth';

export const dynamic = 'force-dynamic';

/** GET: danh sách công nhân (?warehouseId=&status=) */
export async function GET(request: NextRequest) {
  try {
    const warehouseId = request.nextUrl.searchParams.get('warehouseId');
    const guard = await requireWarehouseManager(request, warehouseId);
    if ('response' in guard) return guard.response;
    const status = request.nextUrl.searchParams.get('status') || undefined;
    const rows = await listWorkers(warehouseId!, status);
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/warehouse/admin/workers error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST: tạo công nhân — trả về PIN (chỉ hiện 1 lần) */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const guard = await requireWarehouseManager(request, body.warehouseId, 'create');
    if ('response' in guard) return guard.response;
    if (!body.fullName || !body.cccd) {
      return NextResponse.json({ error: 'Nhập họ tên và số CCCD' }, { status: 400 });
    }
    if (!/^\d{9,12}$/.test(String(body.cccd).trim())) {
      return NextResponse.json({ error: 'Số CCCD phải là 9-12 chữ số' }, { status: 400 });
    }
    const pin = generatePin();
    const worker = await createWorker({
      warehouseId: body.warehouseId,
      fullName: String(body.fullName).trim(),
      dob: body.dob || null,
      contact: body.contact || null,
      cccd: String(body.cccd).trim(),
      pin,
      shiftId: body.shiftId || null,
      createdBy: guard.actor.id,
    });
    return NextResponse.json({ success: true, data: { worker, pin } });
  } catch (err: any) {
    console.error('POST /api/warehouse/admin/workers error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 400 });
  }
}
