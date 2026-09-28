import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { resolveKpiScope } from '@/lib/services/kpiCompanyContext';

export const dynamic = 'force-dynamic';

/**
 * GET /api/kpi/company-users?q=... — nhân sự thuộc ĐÚNG công ty đang thao tác (company chính
 * hoặc có membership active), để chọn khi giao KPI/gán quản lý/cấp cao — không lẫn công ty khác.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const ctx = await resolveKpiScope(request, userId, request.nextUrl.searchParams.get('company_id'));
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });

    const q = request.nextUrl.searchParams.get('q') || '';
    const data = await query<{ id: string; name: string; email: string }>(
      `SELECT u.id, u.name, u.email FROM users u
        WHERE u.status = 'active'
          AND (u.company_id = $1 OR EXISTS (
                SELECT 1 FROM user_company_memberships m
                 WHERE m.user_id = u.id AND m.company_id = $1 AND m.is_active = true))
          AND ($2 = '' OR u.name ILIKE '%' || $2 || '%' OR u.email ILIKE '%' || $2 || '%')
        ORDER BY u.name LIMIT 50`,
      [ctx.company_id, q]
    );
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/kpi/company-users error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
