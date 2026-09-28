import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/kpiCycleService';
import { resolveKpiScope } from '@/lib/services/kpiCompanyContext';

export const dynamic = 'force-dynamic';

function canManage(role: string) {
  return role === 'admin' || role === 'super_admin';
}

/**
 * PUT /api/kpi/cycles/[id] — đổi trạng thái kỳ ({status}) HOẶC sửa tên/ngày/loại kỳ
 * ({name, period_type, start_date, end_date}) — sửa nội dung chỉ khi kỳ CHƯA có phiếu nào.
 */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json();
    const ctx = await resolveKpiScope(request, userId, body.company_id || null);
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });
    if (!canManage(ctx.role)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    if (body.status) {
      const cycle = await svc.setCycleStatus(params.id, ctx.company_id, body.status);
      if (!cycle) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
      return NextResponse.json({ success: true, data: cycle });
    }

    if (!body.name || !body.period_type || !body.start_date || !body.end_date) {
      return NextResponse.json({ error: 'Thiếu name/period_type/start_date/end_date hoặc status' }, { status: 400 });
    }
    const cycle = await svc.updateCycle(params.id, ctx.company_id, {
      name: body.name, period_type: body.period_type, start_date: body.start_date, end_date: body.end_date,
    });
    if (!cycle) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ success: true, data: cycle });
  } catch (err: any) {
    console.error('PUT /api/kpi/cycles/[id] error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const ctx = await resolveKpiScope(request, userId, request.nextUrl.searchParams.get('company_id'));
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });
    if (!canManage(ctx.role)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const ok = await svc.deleteCycle(params.id, ctx.company_id);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('DELETE /api/kpi/cycles/[id] error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 400 });
  }
}
