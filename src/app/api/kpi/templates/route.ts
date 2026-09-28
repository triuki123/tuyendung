import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/kpiTemplateService';
import { resolveKpiScope } from '@/lib/services/kpiCompanyContext';
import { getCompanySettings } from '@/lib/services/kpiConfigService';

export const dynamic = 'force-dynamic';

function canManage(role: string) {
  return role === 'admin' || role === 'super_admin';
}

/** GET /api/kpi/templates — bộ chỉ tiêu mẫu của công ty hiện tại. */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const ctx = await resolveKpiScope(request, userId, request.nextUrl.searchParams.get('company_id'));
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });

    const data = await svc.listTemplates(ctx.company_id);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/kpi/templates error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST /api/kpi/templates — tạo bộ chỉ tiêu mẫu (Admin/Super Admin). */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json();
    const ctx = await resolveKpiScope(request, userId, body.company_id || null);
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });
    if (!canManage(ctx.role)) return NextResponse.json({ error: 'Không có quyền cấu hình KPI' }, { status: 403 });
    const settings = await getCompanySettings(ctx.company_id);
    if (!settings.kpi_enabled) return NextResponse.json({ error: 'Công ty chưa bật module KPI & Đánh Giá' }, { status: 400 });

    if (!body.name || !Array.isArray(body.items)) return NextResponse.json({ error: 'Thiếu name hoặc items' }, { status: 400 });

    const tpl = await svc.createTemplate(ctx.company_id, {
      name: body.name,
      scope_type: body.scope_type || 'company',
      scope_id: body.scope_id ?? null,
      items: body.items,
      integration_sources: body.integration_sources || [],
    }, userId);

    return NextResponse.json({ success: true, data: tpl });
  } catch (err) {
    console.error('POST /api/kpi/templates error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
