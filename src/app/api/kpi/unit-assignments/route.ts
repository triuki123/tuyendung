import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/kpiUnitAssignmentService';
import { resolveKpiScope } from '@/lib/services/kpiCompanyContext';
import { getCompanySettings } from '@/lib/services/kpiConfigService';

export const dynamic = 'force-dynamic';

function canManage(role: string) {
  return role === 'admin' || role === 'super_admin';
}

/** GET — ?scope=mine (trưởng đơn vị) | approve (chờ tôi duyệt) | company (Admin/Super Admin). */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const ctx = await resolveKpiScope(request, userId, request.nextUrl.searchParams.get('company_id'));
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });

    const scope = request.nextUrl.searchParams.get('scope') || 'mine';
    let data;
    if (scope === 'approve') {
      data = await svc.listUnitAssignmentsForApprover(ctx.company_id, userId);
    } else if (scope === 'company') {
      if (!canManage(ctx.role)) return NextResponse.json({ error: 'Chỉ Admin/Super Admin xem toàn bộ phiếu đơn vị' }, { status: 403 });
      data = await svc.listUnitAssignmentsForCompany(ctx.company_id);
    } else {
      data = await svc.listUnitAssignmentsAsSelfReviewer(ctx.company_id, userId);
    }
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/kpi/unit-assignments error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST — tạo phiếu đánh giá đơn vị (Admin/Super Admin), chuỗi duyệt N cấp tự chọn. */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json();
    const ctx = await resolveKpiScope(request, userId, body.company_id || null);
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });
    if (!canManage(ctx.role)) return NextResponse.json({ error: 'Không có quyền tạo phiếu đơn vị' }, { status: 403 });
    const settings = await getCompanySettings(ctx.company_id);
    if (!settings.kpi_enabled) return NextResponse.json({ error: 'Công ty chưa bật module KPI & Đánh Giá' }, { status: 400 });

    if (!body.cycle_id || !body.unit_type || !body.unit_id || !Array.isArray(body.approver_ids) || !body.approver_ids.length) {
      return NextResponse.json({ error: 'Thiếu cycle_id/unit_type/unit_id hoặc chưa chọn người duyệt' }, { status: 400 });
    }

    const assignment = await svc.createUnitAssignment(ctx.company_id, {
      cycle_id: body.cycle_id,
      unit_type: body.unit_type,
      unit_id: body.unit_id,
      template_id: body.template_id ?? null,
      self_reviewer_id: body.self_reviewer_id ?? null,
      approver_ids: body.approver_ids,
    });
    return NextResponse.json({ success: true, data: assignment });
  } catch (err: any) {
    console.error('POST /api/kpi/unit-assignments error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 500 });
  }
}
