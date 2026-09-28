import { NextRequest, NextResponse } from 'next/server';
import { requireWarehouseManager } from '@/lib/warehouse/adminGuard';
import {
  getWarehouseDay, getMissingCheckouts, adjustAttendance, deleteAttendance, vnToday,
  getPendingDeclared, reviewDeclaredCheckout,
} from '@/lib/services/warehouseAttendanceService';

export const dynamic = 'force-dynamic';

/**
 * GET: bảng công 1 ngày của kho (?warehouseId=&date=YYYY-MM-DD)
 * kèm quên check-out của ngày hôm trước (missing) + giờ ra TỰ KHAI chờ duyệt (declared).
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const warehouseId = sp.get('warehouseId');
    const guard = await requireWarehouseManager(request, warehouseId);
    if ('response' in guard) return guard.response;
    const date = sp.get('date') || vnToday();
    const yesterday = new Date(new Date(date + 'T12:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);
    const [rows, missing, declared] = await Promise.all([
      getWarehouseDay(warehouseId!, date),
      getMissingCheckouts(warehouseId!, yesterday),
      getPendingDeclared(warehouseId!),
    ]);
    return NextResponse.json({ success: true, data: { rows, missing, declared, date, yesterday } });
  } catch (err) {
    console.error('GET /api/warehouse/admin/attendance error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * PUT: quản lý sửa tay giờ công / duyệt giờ ra tự khai.
 * Body sửa tay:   { warehouseId, attendanceId, checkInAt?, checkOutAt?, note? }
 * Body duyệt khai: { warehouseId, attendanceId, reviewDeclared: 'approved'|'rejected', checkOutAt? }
 *   (checkOutAt kèm approved = quản lý sửa lại giờ đúng rồi duyệt)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const guard = await requireWarehouseManager(request, body.warehouseId, 'edit');
    if ('response' in guard) return guard.response;
    if (!body.attendanceId) return NextResponse.json({ error: 'Thiếu attendanceId' }, { status: 400 });

    if (body.reviewDeclared === 'approved' || body.reviewDeclared === 'rejected') {
      await reviewDeclaredCheckout({
        attendanceId: body.attendanceId,
        action: body.reviewDeclared,
        checkOutAt: body.checkOutAt ?? null,
        reviewedBy: guard.actor.id,
      });
      return NextResponse.json({ success: true });
    }

    await adjustAttendance({
      attendanceId: body.attendanceId,
      checkInAt: body.checkInAt,
      checkOutAt: body.checkOutAt,
      note: body.note,
      adjustedBy: guard.actor.id,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/warehouse/admin/attendance error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * DELETE: xóa 1 ngày công (+ ảnh). KHÔNG khôi phục được.
 *
 * Quyền: RBAC Xóa module 'warehouse' + là quản lý kho đó
 * (đã bỏ rào super_admin). (?warehouseId=&attendanceId=)
 */
export async function DELETE(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const warehouseId = sp.get('warehouseId');
    const guard = await requireWarehouseManager(request, warehouseId, 'delete');
    if ('response' in guard) return guard.response;
    const attendanceId = sp.get('attendanceId');
    if (!attendanceId) return NextResponse.json({ error: 'Thiếu attendanceId' }, { status: 400 });
    const ok = await deleteAttendance(attendanceId);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy bản ghi' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/warehouse/admin/attendance error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
