import { NextRequest, NextResponse } from 'next/server';
import { getManagerDashboard } from '@/lib/services/managerDashboardService';

export const dynamic = 'force-dynamic';

/** GET /api/dashboard/manager — số liệu đội ngũ cho role manager (scope theo cấp dưới). */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa xác thực' }, { status: 401 });
    const data = await getManagerDashboard(userId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/dashboard/manager error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
