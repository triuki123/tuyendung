import { NextRequest, NextResponse } from 'next/server';
import { getWorkerSession, workerUnauthorized } from '@/lib/warehouse/workerAuth';
import { getWorkerOutput } from '@/lib/services/warehouseOutputService';

export const dynamic = 'force-dynamic';

/** Sản lượng tháng của công nhân hiện tại (?month=YYYY-MM) */
export async function GET(request: NextRequest) {
  try {
    const session = getWorkerSession(request);
    if (!session) return workerUnauthorized();
    const month = request.nextUrl.searchParams.get('month') ||
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()).slice(0, 7);
    const rows = await getWorkerOutput(session.workerId, month);
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/warehouse/output error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
