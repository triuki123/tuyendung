import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/kpiAssignmentService';
import { resolveKpiScope } from '@/lib/services/kpiCompanyContext';
import { checkModuleAccess } from '@/lib/api-permissions';
import { getCompanySettings } from '@/lib/services/kpiConfigService';
import { KpiCycleClosedError } from '@/lib/services/kpiCycleService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/kpi/assignments — phiếu KPI theo phạm vi.
 *  ?scope=mine (mặc định) | manager (chờ tôi chấm) | senior (chờ tôi chốt) | company (cần kpi.view + company_id)
 * Cách ly: mọi nhánh đều lọc company_id — kể cả admin không xem chéo công ty.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const sp = request.nextUrl.searchParams;
    const scope = sp.get('scope') || 'mine';
    const requestedCompanyId = sp.get('company_id') || null;

    const ctx = await resolveKpiScope(request, userId, requestedCompanyId);
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });
    const companyId = ctx.company_id;

    let data;
    if (scope === 'manager') {
      data = await svc.listAssignmentsForManager(companyId, userId);
    } else if (scope === 'senior') {
      data = await svc.listAssignmentsForSenior(companyId, userId);
    } else if (scope === 'company') {
      if (!checkModuleAccess(request, 'kpi', 'view') && ctx.role === 'user') {
        return NextResponse.json({ error: 'Không có quyền xem KPI toàn công ty' }, { status: 403 });
      }
      if (ctx.role !== 'admin' && ctx.role !== 'super_admin') {
        return NextResponse.json({ error: 'Chỉ Admin/Super Admin xem KPI toàn công ty' }, { status: 403 });
      }
      data = await svc.listAssignmentsForCompany(companyId);
    } else {
      data = await svc.listMyAssignments(companyId, userId);
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/kpi/assignments error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST /api/kpi/assignments — tạo phiếu KPI cho 1 nhân viên (Admin/Manager, cần kpi.manage hoặc kpi.approve). */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const body = await request.json();
    const ctx = await resolveKpiScope(request, userId, body.company_id || null);
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });

    const canManage = checkModuleAccess(request, 'kpi', 'manage') || ctx.role === 'admin' || ctx.role === 'super_admin' || ctx.role === 'manager';
    if (!canManage) return NextResponse.json({ error: 'Không có quyền giao KPI' }, { status: 403 });
    const settings = await getCompanySettings(ctx.company_id);
    if (!settings.kpi_enabled) return NextResponse.json({ error: 'Công ty chưa bật module KPI & Đánh Giá' }, { status: 400 });

    if (!body.cycle_id || !body.employee_id) {
      return NextResponse.json({ error: 'Thiếu cycle_id hoặc employee_id' }, { status: 400 });
    }

    const assignment = await svc.createAssignment(ctx.company_id, {
      cycle_id: body.cycle_id,
      employee_id: body.employee_id,
      template_id: body.template_id ?? null,
      manager_id: body.manager_id ?? null,
      senior_id: body.senior_id ?? null,
    });

    return NextResponse.json({ success: true, data: assignment });
  } catch (err) {
    if (err instanceof KpiCycleClosedError) return NextResponse.json({ error: err.message }, { status: 409 });
    console.error('POST /api/kpi/assignments error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
