import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/kpiAssignmentService';
import { resolveKpiScope } from '@/lib/services/kpiCompanyContext';
import { KpiCycleClosedError } from '@/lib/services/kpiCycleService';

export const dynamic = 'force-dynamic';

/** POST — quản lý chấm điểm phiếu KPI của nhân viên cấp dưới. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json();
    const ctx = await resolveKpiScope(request, userId, body.company_id || null);
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });

    if (!Array.isArray(body.items)) return NextResponse.json({ error: 'Thiếu items' }, { status: 400 });

    const updated = await svc.submitManagerReview(params.id, ctx.company_id, userId, body.items, body.note, body.summary);
    if (!updated) return NextResponse.json({ error: 'Không tìm thấy phiếu KPI hoặc bạn không phải quản lý được giao' }, { status: 404 });

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof KpiCycleClosedError) return NextResponse.json({ error: err.message }, { status: 409 });
    console.error('POST /api/kpi/assignments/[id]/manager-review error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
