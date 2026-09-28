import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/kpiCycleService';
import { resolveKpiScope } from '@/lib/services/kpiCompanyContext';

export const dynamic = 'force-dynamic';

function canManage(role: string) {
  return role === 'admin' || role === 'super_admin';
}

/** GET — kỳ tháng đã liên kết + gợi ý kỳ tháng nằm trọn trong khoảng ngày của kỳ tổng hợp này. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const ctx = await resolveKpiScope(request, userId, request.nextUrl.searchParams.get('company_id'));
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });

    const [children, candidates] = await Promise.all([
      svc.getRollupChildren(params.id, ctx.company_id),
      svc.suggestRollupCandidates(params.id, ctx.company_id),
    ]);
    return NextResponse.json({ success: true, data: { children, candidates } });
  } catch (err) {
    console.error('GET /api/kpi/cycles/[id]/rollup error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT — thay toàn bộ danh sách kỳ tháng liên kết vào kỳ tổng hợp này (Admin/Super Admin). */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json();
    const ctx = await resolveKpiScope(request, userId, body.company_id || null);
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });
    if (!canManage(ctx.role)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    if (!Array.isArray(body.child_cycle_ids)) return NextResponse.json({ error: 'Thiếu child_cycle_ids' }, { status: 400 });
    const weights = body.weights && typeof body.weights === 'object' ? body.weights as Record<string, number | null> : undefined;

    await svc.setRollupChildren(params.id, ctx.company_id, body.child_cycle_ids, weights);
    const children = await svc.getRollupChildren(params.id, ctx.company_id);
    return NextResponse.json({ success: true, data: { children } });
  } catch (err: any) {
    console.error('PUT /api/kpi/cycles/[id]/rollup error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 500 });
  }
}
