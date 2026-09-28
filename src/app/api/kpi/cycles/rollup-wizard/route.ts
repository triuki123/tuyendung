import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/kpiCycleService';
import { resolveKpiScope } from '@/lib/services/kpiCompanyContext';
import { getCompanySettings } from '@/lib/services/kpiConfigService';

export const dynamic = 'force-dynamic';

function canManage(role: string) {
  return role === 'admin' || role === 'super_admin';
}

/**
 * POST /api/kpi/cycles/rollup-wizard — tạo 1 kỳ Quý/6 Tháng/Năm KÈM tự sinh + liên kết đủ các
 * kỳ Tháng con trong 1 lần bấm (thay vì tạo tay từng tháng rồi liên kết thủ công).
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json();
    const ctx = await resolveKpiScope(request, userId, body.company_id || null);
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });
    if (!canManage(ctx.role)) return NextResponse.json({ error: 'Không có quyền tạo kỳ đánh giá' }, { status: 403 });
    const settings = await getCompanySettings(ctx.company_id);
    if (!settings.kpi_enabled) return NextResponse.json({ error: 'Công ty chưa bật module KPI & Đánh Giá' }, { status: 400 });

    if (!body.name || !body.start_date || !body.end_date || !['quarter', 'half_year', 'year'].includes(body.period_type)) {
      return NextResponse.json({ error: 'Thiếu name/start_date/end_date hoặc period_type phải là quarter/half_year/year' }, { status: 400 });
    }

    const result = await svc.createRollupCycleWithMonths(ctx.company_id, {
      period_type: body.period_type, name: body.name, start_date: body.start_date, end_date: body.end_date,
    }, userId);
    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error('POST /api/kpi/cycles/rollup-wizard error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 400 });
  }
}
