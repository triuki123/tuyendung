import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import * as svc from '@/lib/services/kpiAssignmentService';
import { getUnitMemberIds } from '@/lib/services/kpiUnitAssignmentService';
import { resolveKpiScope } from '@/lib/services/kpiCompanyContext';
import { getCompanySettings } from '@/lib/services/kpiConfigService';
import { KpiCycleClosedError } from '@/lib/services/kpiCycleService';

export const dynamic = 'force-dynamic';

function canManage(role: string) {
  return role === 'admin' || role === 'super_admin';
}

/**
 * POST /api/kpi/assignments/bulk — giao KPI hàng loạt cho cả phòng ban hoặc toàn công ty.
 * Mỗi người tự resolve bộ chỉ tiêu phù hợp nhất + quản lý trực tiếp; bỏ qua người đã có phiếu.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json();
    const ctx = await resolveKpiScope(request, userId, body.company_id || null);
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });
    if (!canManage(ctx.role)) return NextResponse.json({ error: 'Không có quyền giao KPI hàng loạt' }, { status: 403 });
    const settings = await getCompanySettings(ctx.company_id);
    if (!settings.kpi_enabled) return NextResponse.json({ error: 'Công ty chưa bật module KPI & Đánh Giá' }, { status: 400 });

    if (!body.cycle_id || !body.scope) return NextResponse.json({ error: 'Thiếu cycle_id hoặc scope' }, { status: 400 });

    let employeeIds: string[];
    if (body.scope === 'department') {
      if (!body.department_id) return NextResponse.json({ error: 'Thiếu department_id' }, { status: 400 });
      employeeIds = await getUnitMemberIds(ctx.company_id, 'department', body.department_id);
    } else if (body.scope === 'sub_department') {
      if (!body.sub_department_id) return NextResponse.json({ error: 'Thiếu sub_department_id' }, { status: 400 });
      employeeIds = await getUnitMemberIds(ctx.company_id, 'sub_department', body.sub_department_id);
    } else if (body.scope === 'company') {
      const rows = await query<{ id: string }>(
        `SELECT DISTINCT u.id::text AS id FROM users u
          WHERE u.status = 'active'
            AND (u.company_id = $1 OR EXISTS (
                  SELECT 1 FROM user_company_memberships m
                   WHERE m.user_id = u.id AND m.company_id = $1 AND m.is_active = true))`,
        [ctx.company_id]
      );
      employeeIds = rows.map((r) => r.id);
    } else {
      return NextResponse.json({ error: 'scope phải là department, sub_department hoặc company' }, { status: 400 });
    }

    if (!employeeIds.length) return NextResponse.json({ success: true, data: { created: 0, skipped: 0 } });

    const result = await svc.bulkCreateAssignments(ctx.company_id, { cycle_id: body.cycle_id, employee_ids: employeeIds });
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof KpiCycleClosedError) return NextResponse.json({ error: err.message }, { status: 409 });
    console.error('POST /api/kpi/assignments/bulk error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
