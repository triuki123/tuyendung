import { NextRequest, NextResponse } from 'next/server';
import { getActiveShift, openShift, suggestOpeningFloat, summarizeShift } from '@/lib/services/solaceShiftService';
import { getSalesShifts } from '@/lib/services/solaceSettingsService';
import { suggestSalesShiftId } from '@/lib/config/solaceConfig';
import { queryOne } from '@/lib/db';
import { guardSolace } from '@/lib/solaceApiGuard';

// Trạng thái ca: ca đang mở (kèm số liệu tạm tính) + gợi ý quỹ đầu ca + danh sách ca bán hàng + gợi ý loại ca.
export async function GET(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-pos', 'view');
    if (g instanceof NextResponse) return g;
    const active = await getActiveShift();
    const [live, suggestedFloat, salesShifts, now] = await Promise.all([
      active ? summarizeShift(active.id) : Promise.resolve(null),
      suggestOpeningFloat(),
      getSalesShifts(),
      queryOne<{ t: string }>(`SELECT to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI') AS t`),
    ]);
    const suggestedShiftId = suggestSalesShiftId(salesShifts, now?.t ?? '00:00');
    return NextResponse.json({ success: true, data: { activeShift: active, live, suggestedFloat, salesShifts, suggestedShiftId } });
  } catch (err) {
    console.error('GET /api/solace/shift error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

// Mở ca mới (nhập quỹ đầu ca + loại ca Sáng/Chiều).
export async function POST(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-pos', 'edit');
    if (g instanceof NextResponse) return g;
    const body = await request.json().catch(() => ({}));
    const shift = await openShift({
      openingFloat: body.openingFloat != null ? Number(body.openingFloat) : 0,
      shiftType: body.shiftType ?? null,
      shiftLabel: body.shiftLabel ?? null,
      actor: g.userId,
    });
    return NextResponse.json({ success: true, data: shift });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    console.error('POST /api/solace/shift error:', err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
