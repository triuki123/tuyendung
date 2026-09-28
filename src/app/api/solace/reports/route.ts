import { NextRequest, NextResponse } from 'next/server';
import { getReport, defaultRange } from '@/lib/services/solaceReportService';
import { guardSolace } from '@/lib/solaceApiGuard';

// Báo cáo quán theo khoảng ngày kinh doanh (?from=YYYY-MM-DD&to=YYYY-MM-DD).
// Mặc định 30 ngày gần nhất. Yêu cầu quyền xem unit solace-reports.
export async function GET(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-reports', 'view');
    if (g instanceof NextResponse) return g;

    const sp = new URL(request.url).searchParams;
    const def = await defaultRange();
    const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
    let from = isDate(sp.get('from')) ? sp.get('from')! : def.from;
    let to = isDate(sp.get('to')) ? sp.get('to')! : def.to;
    if (from > to) [from, to] = [to, from]; // tự đảo nếu nhập ngược

    const data = await getReport({ from, to });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/reports error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
