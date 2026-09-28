import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/kpiAssignmentService';
import { resolveKpiScope } from '@/lib/services/kpiCompanyContext';

export const dynamic = 'force-dynamic';

/** GET /api/kpi/assignments/[id] — chi tiết 1 phiếu KPI kèm chỉ tiêu. Chỉ người liên quan (nhân viên/quản lý/cấp cao/admin công ty) mới xem được. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const ctx = await resolveKpiScope(request, userId, request.nextUrl.searchParams.get('company_id'));
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });

    const assignment = await svc.getAssignmentWithItems(params.id, ctx.company_id);
    if (!assignment) return NextResponse.json({ error: 'Không tìm thấy phiếu KPI' }, { status: 404 });

    const canView =
      assignment.employee_id === userId ||
      assignment.manager_id === userId ||
      assignment.senior_id === userId ||
      ctx.role === 'admin' ||
      ctx.role === 'super_admin';
    if (!canView) return NextResponse.json({ error: 'Không có quyền xem phiếu này' }, { status: 403 });

    const reviews = await svc.getReviewHistory(params.id, ctx.company_id);
    const rollupReference = await svc.getRollupReference(ctx.company_id, assignment.employee_id, assignment.cycle_id).catch(() => null);
    return NextResponse.json({ success: true, data: { ...assignment, reviews, rollupReference } });
  } catch (err) {
    console.error('GET /api/kpi/assignments/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * DELETE — xoá 1 phiếu KPI khi giao nhầm. Quyền: Admin/Super Admin của công ty, HOẶC quản lý
 * được giao chấm (manager_id) — nhưng quản lý KHÔNG được xoá phiếu đã chốt (giữ điểm chính thức).
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const ctx = await resolveKpiScope(request, userId, request.nextUrl.searchParams.get('company_id'));
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });

    const meta = await svc.getAssignmentMeta(params.id, ctx.company_id);
    if (!meta) return NextResponse.json({ error: 'Không tìm thấy phiếu KPI' }, { status: 404 });

    const isAdmin = ctx.role === 'admin' || ctx.role === 'super_admin';
    const isOwningManager = meta.manager_id === userId;
    if (!isAdmin && !isOwningManager) {
      return NextResponse.json({ error: 'Không có quyền xóa phiếu này' }, { status: 403 });
    }
    // Quản lý (không phải admin) không được xoá phiếu đã chốt — bảo toàn điểm chính thức.
    if (!isAdmin && meta.status === 'concluded') {
      return NextResponse.json({ error: 'Phiếu đã chốt — chỉ Admin mới xóa được' }, { status: 403 });
    }

    await svc.deleteAssignment(params.id, ctx.company_id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/kpi/assignments/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
