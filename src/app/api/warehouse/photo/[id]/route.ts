import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { requireWarehouseManager } from '@/lib/warehouse/adminGuard';
import { getPhoto } from '@/lib/services/warehouseAttendanceService';

export const dynamic = 'force-dynamic';

/** GET: ảnh chấm công — chỉ quản lý kho (hoặc super_admin) xem được */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const owner = await queryOne<{ warehouse_id: string }>(
      `SELECT w.warehouse_id FROM warehouse_photos p JOIN warehouse_workers w ON w.id = p.worker_id WHERE p.id = $1`,
      [params.id]
    );
    if (!owner) return NextResponse.json({ error: 'Không tìm thấy ảnh' }, { status: 404 });
    const guard = await requireWarehouseManager(request, owner.warehouse_id, 'view');
    if ('response' in guard) return guard.response;
    const photo = await getPhoto(params.id);
    if (!photo) return NextResponse.json({ error: 'Không tìm thấy ảnh' }, { status: 404 });
    return new NextResponse(new Uint8Array(photo.content), {
      headers: { 'Content-Type': photo.mime_type, 'Cache-Control': 'private, max-age=3600' },
    });
  } catch (err) {
    console.error('GET /api/warehouse/photo/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
