import { NextRequest, NextResponse } from 'next/server';
import { getWorkerSession, workerUnauthorized, verifyQrToken } from '@/lib/warehouse/workerAuth';
import { checkIn, checkOut, getWorkerMonth } from '@/lib/services/warehouseAttendanceService';
import { getWorker } from '@/lib/services/warehouseService';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** GET: bảng công tháng của công nhân (?month=YYYY-MM) */
export async function GET(request: NextRequest) {
  try {
    const session = getWorkerSession(request);
    if (!session) return workerUnauthorized();
    const month = request.nextUrl.searchParams.get('month') ||
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()).slice(0, 7);
    const rows = await getWorkerMonth(session.workerId, month);
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/warehouse/attendance error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * POST: check-in / check-out.
 * Body JSON: { action: 'in'|'out', photo: dataURL jpeg, lat, lng, method: 'gps'|'qr', qrToken? }
 * - method 'gps': bắt buộc trong bán kính kho.
 * - method 'qr': bắt buộc qrToken hợp lệ (QR động ở cổng), bỏ qua GPS.
 * - Cả 2 đều bắt buộc ảnh selfie.
 */
export async function POST(request: NextRequest) {
  try {
    const session = getWorkerSession(request);
    if (!session) return workerUnauthorized();
    const body = await request.json();
    const action = body.action === 'out' ? 'out' : 'in';
    const method: 'gps' | 'qr' = body.method === 'qr' ? 'qr' : 'gps';

    // Ảnh bắt buộc
    const dataUrl: string = body.photo || '';
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
    if (!m) return NextResponse.json({ error: 'Thiếu ảnh chụp khuôn mặt' }, { status: 400 });
    const photoBuffer = Buffer.from(m[2], 'base64');
    if (photoBuffer.length > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'Ảnh quá lớn (tối đa 2MB)' }, { status: 400 });
    }

    if (method === 'qr') {
      if (!body.qrToken || !verifyQrToken(session.warehouseId, String(body.qrToken))) {
        return NextResponse.json({ error: 'Mã QR không hợp lệ hoặc đã hết hạn — hãy quét lại QR tại cổng.' }, { status: 400 });
      }
    }

    const lat = typeof body.lat === 'number' ? body.lat : null;
    const lng = typeof body.lng === 'number' ? body.lng : null;

    let result;
    if (action === 'in') {
      const worker = await getWorker(session.workerId);
      result = await checkIn({
        workerId: session.workerId, warehouseId: session.warehouseId,
        shiftId: body.shiftId || worker?.shift_id || null,
        photoBuffer, photoMime: m[1], lat, lng, method,
        // Chế độ flex: giờ ra TỰ KHAI của đợt trước (khi quên check-out) — chờ quản lý duyệt.
        declaredCheckoutAt: typeof body.declaredCheckoutAt === 'string' ? body.declaredCheckoutAt : null,
      });
    } else {
      // Sản lượng công nhân tự khai lúc check-out (tùy chọn, bỏ qua được) — chờ duyệt.
      const outputs = Array.isArray(body.outputs)
        ? body.outputs
            .map((o: any) => ({ productId: String(o.productId || ''), quantity: Number(o.quantity) }))
            .filter((o: any) => o.productId && Number.isFinite(o.quantity) && o.quantity > 0)
        : undefined;
      result = await checkOut({
        workerId: session.workerId, warehouseId: session.warehouseId,
        photoBuffer, photoMime: m[1], lat, lng, method,
        outputs,
      });
    }

    if (!result.ok) {
      // OPEN_SESSION: 409 để client mở màn khai giờ ra đợt trước rồi gửi lại.
      const status = result.code === 'OPEN_SESSION' ? 409 : 400;
      return NextResponse.json(
        { error: result.error, code: result.code, openSession: result.openSession, distance: result.distance },
        { status }
      );
    }
    return NextResponse.json({ success: true, data: result.attendance, distance: result.distance });
  } catch (err) {
    console.error('POST /api/warehouse/attendance error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
