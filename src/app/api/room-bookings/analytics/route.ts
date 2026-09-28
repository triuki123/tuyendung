import { NextRequest, NextResponse } from 'next/server';
import { getRoomAnalytics } from '@/lib/services/roomAnalyticsService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';
import { checkUnitAccess } from '@/lib/api-permissions';

export async function GET(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'room-bookings', 'view')) {
      return NextResponse.json({ error: 'Khong co quyen' }, { status: 403 });
    }
    const days = Math.min(365, Math.max(1, Number(request.nextUrl.searchParams.get('days')) || 30));
    const currentUserId = request.headers.get('x-current-user-id');
    const currentUserCompany = request.headers.get('x-current-user-company');
    const ctx = currentUserId
      ? await getEffectiveContext(currentUserId, currentUserCompany || null)
      : null;
    const data = await getRoomAnalytics(days, ctx?.role === 'admin' ? (ctx.company_id || null) : null);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/room-bookings/analytics error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
