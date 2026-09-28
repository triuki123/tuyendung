import { NextRequest, NextResponse } from 'next/server';
import { closeShift, closeActiveShift, getActiveShift, summarizeShift, summarizeDay, getShiftClose, todayBusinessDate } from '@/lib/services/solaceShiftService';
import { guardSolace } from '@/lib/solaceApiGuard';

// Xem tổng hợp ca hôm nay (hoặc 1 ngày) + bản kết ca đã chốt (nếu có) + ca đang mở.
export async function GET(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-pos', 'view');
    if (g instanceof NextResponse) return g;
    const date = new URL(request.url).searchParams.get('date') ?? await todayBusinessDate();
    const [summary, closed, activeShift] = await Promise.all([summarizeDay(date), getShiftClose(date), getActiveShift()]);
    const shiftLive = activeShift ? await summarizeShift(activeShift.id) : null;
    return NextResponse.json({ success: true, data: { businessDate: date, summary, closed, activeShift, shiftLive } });
  } catch (err) {
    console.error('GET /api/solace/shift-close error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

// Kết ca: nếu có phiên ca đang mở → đóng phiên ca (đối soát quỹ đầu ca); nếu không → chốt ngày.
export async function POST(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-pos', 'edit');
    if (g instanceof NextResponse) return g;
    const body = await request.json().catch(() => ({}));
    const cashCounted = body.cashCounted != null ? Number(body.cashCounted) : null;
    const active = await getActiveShift();
    if (active) {
      const shift = await closeActiveShift({ cashCounted, note: body.note ?? null, actor: g.userId });
      return NextResponse.json({ success: true, data: { shift } });
    }
    const data = await closeShift({
      businessDate: body.businessDate ?? undefined,
      cashCounted,
      note: body.note ?? null,
      actor: g.userId,
    });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    console.error('POST /api/solace/shift-close error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
