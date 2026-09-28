import { NextRequest, NextResponse } from 'next/server';
import { computeWorkingDays } from '@/lib/services/leaveRequestService';
import { queryOne } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** GET — preview số ngày công bị trừ: ?start=YYYY-MM-DD&end=YYYY-MM-DD&leaveTypeId=... */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    const leaveTypeId = searchParams.get('leaveTypeId');
    if (!start || !end || end < start) {
      return NextResponse.json({ error: 'Khoảng ngày không hợp lệ' }, { status: 400 });
    }
    let countSunday = false;
    if (leaveTypeId) {
      const t = await queryOne<{ count_sunday: boolean }>('SELECT count_sunday FROM leave_types WHERE id = $1', [leaveTypeId]);
      countSunday = !!t?.count_sunday;
    }
    const days = await computeWorkingDays(start, end, countSunday);
    return NextResponse.json({ success: true, days });
  } catch (err) {
    console.error('GET /api/leave/preview error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
