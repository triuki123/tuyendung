import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/kpiAssignmentService';
import { resolveKpiScope } from '@/lib/services/kpiCompanyContext';
import { KpiCycleClosedError } from '@/lib/services/kpiCycleService';

export const dynamic = 'force-dynamic';

/** POST — nhân viên nộp tự nhận xét cho phiếu KPI của chính mình. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json();
    const ctx = await resolveKpiScope(request, userId, body.company_id || null);
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });

    if (!Array.isArray(body.items)) return NextResponse.json({ error: 'Thiếu items' }, { status: 400 });

    const updated = await svc.submitSelfReview(params.id, ctx.company_id, userId, body.items);
    if (!updated) return NextResponse.json({ error: 'Không tìm thấy phiếu KPI hoặc không thuộc về bạn' }, { status: 404 });

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof KpiCycleClosedError) return NextResponse.json({ error: err.message }, { status: 409 });
    console.error('POST /api/kpi/assignments/[id]/self-review error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
