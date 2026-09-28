import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/kpiConfigService';
import { resolveKpiScope } from '@/lib/services/kpiCompanyContext';

export const dynamic = 'force-dynamic';

function canManage(role: string) {
  return role === 'admin' || role === 'super_admin';
}

/** GET /api/kpi/config — công tắc bật/tắt + chu kỳ mặc định + xếp hạng + nhóm chỉ tiêu + ngưỡng xếp loại. */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const ctx = await resolveKpiScope(request, userId, request.nextUrl.searchParams.get('company_id'));
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });

    const [settings, participants, categories, gradeThresholds] = await Promise.all([
      svc.getCompanySettings(ctx.company_id),
      svc.getParticipantSettings(ctx.company_id),
      svc.getCategories(ctx.company_id),
      svc.getGradeThresholds(ctx.company_id),
    ]);
    return NextResponse.json({ success: true, data: { settings, participants, categories, gradeThresholds } });
  } catch (err) {
    console.error('GET /api/kpi/config error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT /api/kpi/config — cập nhật công tắc/chu kỳ/xếp hạng/nhóm chỉ tiêu/ngưỡng xếp loại (Admin/Super Admin). */
export async function PUT(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json();
    const ctx = await resolveKpiScope(request, userId, body.company_id || null);
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });
    if (!canManage(ctx.role)) return NextResponse.json({ error: 'Không có quyền cấu hình KPI' }, { status: 403 });

    if (body.settings) {
      await svc.upsertCompanySettings(ctx.company_id, body.settings);
    }
    if (Array.isArray(body.participants)) {
      for (const p of body.participants) {
        await svc.setParticipantRanking(ctx.company_id, p.user_id, p.ranking_enabled, p.excluded_reason);
      }
    }
    if (Array.isArray(body.categories)) {
      await svc.setCategories(ctx.company_id, body.categories);
    }
    if (body.gradeThresholds) {
      await svc.setGradeThresholds(ctx.company_id, body.gradeThresholds);
    }

    const [settings, participants, categories, gradeThresholds] = await Promise.all([
      svc.getCompanySettings(ctx.company_id),
      svc.getParticipantSettings(ctx.company_id),
      svc.getCategories(ctx.company_id),
      svc.getGradeThresholds(ctx.company_id),
    ]);
    return NextResponse.json({ success: true, data: { settings, participants, categories, gradeThresholds } });
  } catch (err) {
    console.error('PUT /api/kpi/config error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
