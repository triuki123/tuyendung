import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/kpiUnitAssignmentService';
import { resolveKpiScope } from '@/lib/services/kpiCompanyContext';

export const dynamic = 'force-dynamic';

/** POST — trưởng đơn vị nộp tự nhận xét, chuyển sang tầng duyệt đầu tiên. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json();
    const ctx = await resolveKpiScope(request, userId, body.company_id || null);
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });
    if (!Array.isArray(body.items)) return NextResponse.json({ error: 'Thiếu items' }, { status: 400 });

    const updated = await svc.submitUnitSelfReview(params.id, ctx.company_id, userId, body.items);
    if (!updated) return NextResponse.json({ error: 'Không tìm thấy phiếu hoặc bạn không phải trưởng đơn vị được giao' }, { status: 404 });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('POST /api/kpi/unit-assignments/[id]/self-review error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
