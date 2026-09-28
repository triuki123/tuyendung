import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/kpiUnitAssignmentService';
import { resolveKpiScope } from '@/lib/services/kpiCompanyContext';

export const dynamic = 'force-dynamic';

/** GET — chi tiết 1 phiếu đơn vị. Chỉ trưởng đơn vị/người trong chuỗi duyệt/admin công ty mới xem được. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const ctx = await resolveKpiScope(request, userId, request.nextUrl.searchParams.get('company_id'));
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });

    const assignment = await svc.getUnitAssignmentWithDetail(params.id, ctx.company_id);
    if (!assignment) return NextResponse.json({ error: 'Không tìm thấy phiếu' }, { status: 404 });

    const canView =
      assignment.self_reviewer_id === userId ||
      assignment.approvers.some((a) => a.approver_id === userId) ||
      ctx.role === 'admin' || ctx.role === 'super_admin';
    if (!canView) return NextResponse.json({ error: 'Không có quyền xem phiếu này' }, { status: 403 });

    const reviews = await svc.getUnitReviewHistory(params.id, ctx.company_id);
    let teamAvg: { avg: number | null; count: number } | null = null;
    try {
      teamAvg = await svc.getTeamAvgIndividualScore(ctx.company_id, assignment.unit_type, assignment.unit_id, assignment.cycle_id);
    } catch { /* tham khảo — lỗi thì bỏ qua, không chặn xem phiếu */ }
    const rollupReference = await svc.getUnitRollupReference(ctx.company_id, assignment.unit_type, assignment.unit_id, assignment.cycle_id).catch(() => null);

    return NextResponse.json({ success: true, data: { ...assignment, reviews, teamAvgIndividualScore: teamAvg, rollupReference } });
  } catch (err) {
    console.error('GET /api/kpi/unit-assignments/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
