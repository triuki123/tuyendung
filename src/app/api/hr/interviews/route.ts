import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { listInterviewCalendar } from '@/lib/services/interviewService';

export const dynamic = 'force-dynamic';

function canView(request: NextRequest): boolean {
  const role = request.headers.get('x-current-user-role') || '';
  return role === 'manager' || role === 'admin' || role === 'super_admin' ||
    checkUnitAccess(request, 'recruitment-order', 'view') ||
    checkUnitAccess(request, 'hr-requisitions', 'view') ||
    checkUnitAccess(request, 'hr-cv', 'view');
}

/** Lịch PV tổng hợp. Khoảng thời gian bắt buộc để không nạp toàn bộ lịch sử. */
export async function GET(request: NextRequest) {
  try {
    if (!canView(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return NextResponse.json({ error: 'Khoảng thời gian không hợp lệ' }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: await listInterviewCalendar(`${from}T00:00:00+07:00`, `${to}T00:00:00+07:00`) });
  } catch (error) {
    console.error('GET interview calendar error:', error);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
