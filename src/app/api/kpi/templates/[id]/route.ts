import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/kpiTemplateService';
import { resolveKpiScope } from '@/lib/services/kpiCompanyContext';

export const dynamic = 'force-dynamic';

function canManage(role: string) {
  return role === 'admin' || role === 'super_admin';
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const ctx = await resolveKpiScope(request, userId, request.nextUrl.searchParams.get('company_id'));
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });

    const tpl = await svc.getTemplateWithItems(params.id, ctx.company_id);
    if (!tpl) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ success: true, data: tpl });
  } catch (err) {
    console.error('GET /api/kpi/templates/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json();
    const ctx = await resolveKpiScope(request, userId, body.company_id || null);
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });
    if (!canManage(ctx.role)) return NextResponse.json({ error: 'Không có quyền cấu hình KPI' }, { status: 403 });

    const tpl = await svc.updateTemplate(params.id, ctx.company_id, {
      name: body.name,
      is_active: body.is_active,
      items: body.items,
      integration_sources: body.integration_sources,
      scope_type: body.scope_type,
      scope_id: body.scope_id,
    });
    if (!tpl) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ success: true, data: tpl });
  } catch (err) {
    console.error('PUT /api/kpi/templates/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const ctx = await resolveKpiScope(request, userId, request.nextUrl.searchParams.get('company_id'));
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });
    if (!canManage(ctx.role)) return NextResponse.json({ error: 'Không có quyền cấu hình KPI' }, { status: 403 });

    const ok = await svc.deleteTemplate(params.id, ctx.company_id);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/kpi/templates/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
