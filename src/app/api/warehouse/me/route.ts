import { NextRequest, NextResponse } from 'next/server';
import { getWorkerSession, workerUnauthorized } from '@/lib/warehouse/workerAuth';
import { getWorker, getWarehouse, listShifts } from '@/lib/services/warehouseService';
import { getTodayAttendance } from '@/lib/services/warehouseAttendanceService';
import { listProducts } from '@/lib/services/warehouseOutputService';

export const dynamic = 'force-dynamic';

/** Thông tin công nhân hiện tại + kho + ca + chấm công hôm nay (mọi đợt) + sản phẩm (khai sản lượng) */
export async function GET(request: NextRequest) {
  try {
    const session = getWorkerSession(request);
    if (!session) return workerUnauthorized();
    const worker = await getWorker(session.workerId);
    if (!worker || worker.status !== 'active') return workerUnauthorized();
    const [warehouse, shifts, today, products] = await Promise.all([
      getWarehouse(worker.warehouse_id),
      listShifts(worker.warehouse_id),
      getTodayAttendance(worker.id),
      listProducts(worker.warehouse_id),
    ]);
    return NextResponse.json({
      success: true,
      data: {
        worker: {
          id: worker.id, full_name: worker.full_name, cccd: worker.cccd,
          shift_id: worker.shift_id, shift_name: worker.shift_name,
          must_change_pin: !!(worker as any).must_change_pin,
        },
        warehouse: warehouse ? {
          id: warehouse.id, name: warehouse.name, code: warehouse.code,
          has_gps: warehouse.lat != null, radius_m: warehouse.radius_m,
          advance_enabled: !!warehouse.advance_enabled,
          attendance_mode: (warehouse as any).attendance_mode === 'flex' ? 'flex' : 'shift',
        } : null,
        shifts,
        products: products.map((p) => ({ id: p.id, name: p.name, unit: p.unit })),
        today,
      },
    });
  } catch (err) {
    console.error('GET /api/warehouse/me error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
