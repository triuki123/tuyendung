import { NextRequest, NextResponse } from 'next/server';
import { requireWarehouseManager } from '@/lib/warehouse/adminGuard';
import { buildMonthlyReportBuffer, buildRangeReportBuffer } from '@/lib/warehouse/reportData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * GET: tải Excel báo cáo — 3 sheet (tổng hợp + công + sản lượng theo ngày).
 * Theo tháng: ?warehouseId=&month=YYYY-MM
 * Theo khoảng ngày (kỳ công tùy chỉnh): ?warehouseId=&from=YYYY-MM-DD&to=YYYY-MM-DD
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const warehouseId = sp.get('warehouseId');
    const guard = await requireWarehouseManager(request, warehouseId, 'view');
    if ('response' in guard) return guard.response;

    const from = sp.get('from');
    const to = sp.get('to');
    let report: Awaited<ReturnType<typeof buildRangeReportBuffer>>;
    let suffix: string;

    if (from && to) {
      if (!isDate(from) || !isDate(to)) return NextResponse.json({ error: 'Ngày không hợp lệ (YYYY-MM-DD)' }, { status: 400 });
      if (from > to) return NextResponse.json({ error: 'Từ ngày phải trước Đến ngày' }, { status: 400 });
      report = await buildRangeReportBuffer(warehouseId!, from, to);
      suffix = `${from}_${to}`;
    } else {
      const month = sp.get('month') ||
        new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()).slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'Tháng không hợp lệ (YYYY-MM)' }, { status: 400 });
      report = await buildMonthlyReportBuffer(warehouseId!, month);
      suffix = month;
    }
    if (!report) return NextResponse.json({ error: 'Không tìm thấy kho' }, { status: 404 });
    return new NextResponse(new Uint8Array(report.buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="bao-cao-${report.warehouse.code}-${suffix}.xlsx"`,
      },
    });
  } catch (err) {
    console.error('GET /api/warehouse/admin/report error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
