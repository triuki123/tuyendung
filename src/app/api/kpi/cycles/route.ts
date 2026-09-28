import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/kpiCycleService';
import { resolveKpiScope } from '@/lib/services/kpiCompanyContext';
import { getCompanySettings } from '@/lib/services/kpiConfigService';

export const dynamic = 'force-dynamic';

function canManage(role: string) {
  return role === 'admin' || role === 'super_admin';
}

/** GET /api/kpi/cycles — kỳ đánh giá của công ty hiện tại. */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const ctx = await resolveKpiScope(request, userId, request.nextUrl.searchParams.get('company_id'));
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });

    const data = await svc.listCycles(ctx.company_id);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/kpi/cycles error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST /api/kpi/cycles — tạo kỳ đánh giá mới (Admin/Super Admin). */
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

    if (!body.name || !body.start_date || !body.end_date) {
      return NextResponse.json({ error: 'Thiếu name/start_date/end_date' }, { status: 400 });
    }

    const cycle = await svc.createCycle(ctx.company_id, {
      period_type: body.period_type || 'quarter',
      name: body.name,
      start_date: body.start_date,
      end_date: body.end_date,
    }, userId);

    return NextResponse.json({ success: true, data: cycle });
  } catch (err) {
    console.error('POST /api/kpi/cycles error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
