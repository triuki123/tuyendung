import { NextRequest, NextResponse } from 'next/server';
import { requireWarehousePermission } from '@/lib/warehouse/adminGuard';
import { getManagedWarehouses, createWarehouse, addManager } from '@/lib/services/warehouseService';

export const dynamic = 'force-dynamic';

/** GET: danh sách kho mà user hiện tại quản lý */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireWarehousePermission(request, 'view');
    if ('response' in guard) return guard.response;
    const rows = await getManagedWarehouses(guard.actor.id, guard.actor.role);
    return NextResponse.json({ success: true, data: rows, role: guard.actor.role });
  } catch (err) {
    console.error('GET /api/warehouse/admin/warehouses error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * POST: tạo kho mới — chỉ cần quyền RBAC Thêm module 'warehouse' (đã bỏ rào super_admin).
 *
 * Người tạo được TỰ GÁN làm quản lý kho vừa tạo. Bắt buộc, không phải tiện ích:
 * phạm vi kho dựa trên warehouse_managers, nên kho mới mà không có quản lý thì
 * chính người vừa tạo cũng không cấu hình được nó (trừ super_admin thấy mọi kho).
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireWarehousePermission(request, 'create');
    if ('response' in guard) return guard.response;
    const body = await request.json();
    if (!body.name || !body.code) {
      return NextResponse.json({ error: 'Nhập tên và mã kho' }, { status: 400 });
    }
    const wh = await createWarehouse(body);
    await addManager(wh.id, guard.actor.id);
    if (body.manager_user_id && body.manager_user_id !== guard.actor.id) {
      await addManager(wh.id, body.manager_user_id);
    }
    return NextResponse.json({ success: true, data: wh });
  } catch (err: any) {
    console.error('POST /api/warehouse/admin/warehouses error:', err);
    const msg = String(err?.message || '').includes('duplicate') ? 'Mã kho đã tồn tại' : 'Lỗi server';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
