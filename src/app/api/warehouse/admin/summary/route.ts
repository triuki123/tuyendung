import { NextRequest, NextResponse } from 'next/server';
import { requireWarehouseManager } from '@/lib/warehouse/adminGuard';
import { getMonthlySummary } from '@/lib/services/warehouseAttendanceService';
import { getMonthlyOutputSummary } from '@/lib/services/warehouseOutputService';

export const dynamic = 'force-dynamic';

/** GET: tổng hợp công + sản lượng tháng (?warehouseId=&month=YYYY-MM) — nguồn cho xuất Excel */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const warehouseId = sp.get('warehouseId');
    const guard = await requireWarehouseManager(request, warehouseId);
    if ('response' in guard) return guard.response;
    const month = sp.get('month') ||
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()).slice(0, 7);
    const [attendance, output] = await Promise.all([
      getMonthlySummary(warehouseId!, month),
      getMonthlyOutputSummary(warehouseId!, month),
    ]);
    return NextResponse.json({ success: true, data: { attendance, output, month } });
  } catch (err) {
    console.error('GET /api/warehouse/admin/summary error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
