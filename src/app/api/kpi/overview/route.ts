import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/kpi/overview — CHỈ Super Admin: thống kê KPI xuyên toàn bộ công ty.
 * ?company_id=... để soi 1 công ty cụ thể; không truyền = tổng quan mọi công ty.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    const role = request.headers.get('x-current-user-role') || '';
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (role !== 'super_admin') return NextResponse.json({ error: 'Chỉ Super Admin xem tổng quan toàn hệ thống' }, { status: 403 });

    const companyId = request.nextUrl.searchParams.get('company_id');
    const params: any[] = [];
    let where = '';
    if (companyId) { params.push(companyId); where = `WHERE a.company_id = $1`; }

    const byCompany = await query(
      `SELECT c.id AS company_id, c.name AS company_name,
              COUNT(a.id) FILTER (WHERE a.status = 'concluded') AS concluded_count,
              COUNT(a.id) AS total_count,
              ROUND(AVG(a.final_score) FILTER (WHERE a.status = 'concluded'), 2) AS avg_score
         FROM public.companies c
         LEFT JOIN kpi_assignments a ON a.company_id = c.id
         ${companyId ? 'WHERE c.id = $1' : ''}
        GROUP BY c.id, c.name
        ORDER BY c.name`,
      companyId ? [companyId] : []
    );

    const statusBreakdown = await query(
      `SELECT a.status, COUNT(*) AS count FROM kpi_assignments a ${where} GROUP BY a.status`,
      params
    );

    return NextResponse.json({ success: true, data: { byCompany, statusBreakdown } });
  } catch (err) {
    console.error('GET /api/kpi/overview error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
