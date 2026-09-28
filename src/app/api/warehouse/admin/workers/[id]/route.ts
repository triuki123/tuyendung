import { NextRequest, NextResponse } from 'next/server';
import { requireWarehouseManager } from '@/lib/warehouse/adminGuard';
import { getWorker, updateWorker, resetWorkerPin, setWorkerStatus, hardDeleteWorker } from '@/lib/services/warehouseService';
import { getWorkerMonth } from '@/lib/services/warehouseAttendanceService';
import { getWorkerOutput } from '@/lib/services/warehouseOutputService';
import { generatePin } from '@/lib/warehouse/workerAuth';

export const dynamic = 'force-dynamic';

async function guardWorker(request: NextRequest, workerId: string, action: 'view' | 'edit' | 'delete' = 'view') {
  const worker = await getWorker(workerId);
  if (!worker) return { response: NextResponse.json({ error: 'Không tìm thấy công nhân' }, { status: 404 }) };
  const guard = await requireWarehouseManager(request, worker.warehouse_id, action);
  if ('response' in guard) return guard;
  return { actor: guard.actor, worker };
}

/** GET: hồ sơ công nhân + công + sản lượng (?month= để xem 1 tháng, mặc định tháng này) */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardWorker(request, params.id);
    if ('response' in g) return g.response;
    const month = request.nextUrl.searchParams.get('month') ||
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()).slice(0, 7);
    const [attendance, output] = await Promise.all([
      getWorkerMonth(params.id, month),
      getWorkerOutput(params.id, month),
    ]);
    return NextResponse.json({ success: true, data: { worker: g.worker, attendance, output, month } });
  } catch (err) {
    console.error('GET /api/warehouse/admin/workers/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT: sửa hồ sơ / đổi ca / ghi chú */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardWorker(request, params.id, 'edit');
    if ('response' in g) return g.response;
    const body = await request.json();
    await updateWorker(params.id, body);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/warehouse/admin/workers/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * POST: hành động. Body { action: 'reset-pin' } → PIN mới;
 * { action: 'deactivate' | 'reactivate' } → ngưng/tái kích hoạt.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { action } = await request.json();
    const g = await guardWorker(request, params.id, action === 'deactivate' ? 'delete' : 'edit');
    if ('response' in g) return g.response;
    if (action === 'reset-pin') {
      const pin = generatePin();
      await resetWorkerPin(params.id, pin);
      return NextResponse.json({ success: true, data: { pin } });
    }
    if (action === 'deactivate' || action === 'reactivate') {
      await setWorkerStatus(params.id, action === 'reactivate');
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 });
  } catch (err) {
    console.error('POST /api/warehouse/admin/workers/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * DELETE: xóa CỨNG công nhân + toàn bộ dữ liệu (chấm công, ảnh, sản lượng).
 * KHÔNG khôi phục được.
 *
 * Quyền: RBAC Xóa module 'warehouse' + là quản lý kho của công nhân đó
 * (đã bỏ rào super_admin — quyền nay do tick RBAC quyết định).
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardWorker(request, params.id, 'delete');
    if ('response' in g) return g.response;
    const ok = await hardDeleteWorker(params.id);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy công nhân' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/warehouse/admin/workers/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
