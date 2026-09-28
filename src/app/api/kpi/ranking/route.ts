import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/kpiRankingService';
import { resolveKpiScope } from '@/lib/services/kpiCompanyContext';

export const dynamic = 'force-dynamic';

/** GET /api/kpi/ranking?cycle_id=... — bảng xếp hạng Best Performer của kỳ (chỉ người ranking_enabled). */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const cycleId = request.nextUrl.searchParams.get('cycle_id');
    if (!cycleId) return NextResponse.json({ error: 'Thiếu cycle_id' }, { status: 400 });

    const ctx = await resolveKpiScope(request, userId, request.nextUrl.searchParams.get('company_id'));
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });

    const data = await svc.getCycleRanking(cycleId, ctx.company_id);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/kpi/ranking error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
