import { NextRequest, NextResponse } from 'next/server';
import { requireWarehouseManager, requireWarehouseConfigurer } from '@/lib/warehouse/adminGuard';
import { getWarehouse, updateWarehouse, listManagers, listShifts } from '@/lib/services/warehouseService';
import { listProducts } from '@/lib/services/warehouseOutputService';

export const dynamic = 'force-dynamic';

/** GET: chi tiết kho + quản lý + ca + sản phẩm */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const guard = await requireWarehouseManager(request, params.id);
    if ('response' in guard) return guard.response;
    const [warehouse, managers, shifts, products] = await Promise.all([
      getWarehouse(params.id),
      listManagers(params.id),
      listShifts(params.id, true),
      listProducts(params.id, true),
    ]);
    if (!warehouse) return NextResponse.json({ error: 'Không tìm thấy kho' }, { status: 404 });
    return NextResponse.json({ success: true, data: { warehouse, managers, shifts, products } });
  } catch (err) {
    console.error('GET /api/warehouse/admin/warehouses/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT: cập nhật cấu hình kho (GPS, bán kính, email báo cáo, retention...) */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const guard = await requireWarehouseConfigurer(request, params.id, 'edit');
    if ('response' in guard) return guard.response;
    const body = await request.json();
    const wh = await updateWarehouse(params.id, body);
    return NextResponse.json({ success: true, data: wh });
  } catch (err) {
    console.error('PUT /api/warehouse/admin/warehouses/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
