import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getVisibleCompanyIds, resolveDefaultCompanyId } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Số liệu tổng của công ty ĐANG CHỌN (chuyển công ty phụ = thoát vai công ty chính).
    // super_admin (allowed=null) tính toàn hệ thống.
    const allowed = await getVisibleCompanyIds(request.headers.get('x-current-user-id'));
    const activeCompanyId = resolveDefaultCompanyId(
      allowed,
      request.headers.get('x-current-user-company')
    );
    const scoped = allowed !== null;
    const params: unknown[] = scoped ? [[activeCompanyId].filter(Boolean)] : [];
    const F = (col: string) => (scoped ? `${col} = ANY($1::uuid[])` : '');

    const [companies, positions, departments, jobTitles, employeeStats] = await Promise.all([
      queryOne<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM companies
         WHERE is_active = true ${scoped ? 'AND id = ANY($1::uuid[])' : ''}`, params),
      queryOne<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM positions ${scoped ? `WHERE ${F('company_id')}` : ''}`, params),
      queryOne<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM departments ${scoped ? `WHERE ${F('company_id')}` : ''}`, params),
      queryOne<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM job_titles ${scoped ? `WHERE ${F('company_id')}` : ''}`, params),
      queryOne<{ total: number; active: number }>(
        `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'active')::int AS active
         FROM users ${scoped ? `WHERE ${F('company_id')}` : ''}`, params),
    ]);

    return NextResponse.json({
      companies: companies?.count ?? 0,
      positions: positions?.count ?? 0,
      departments: departments?.count ?? 0,
      jobTitles: jobTitles?.count ?? 0,
      employees: employeeStats?.total ?? 0,
      activeEmployees: employeeStats?.active ?? 0,
    });
  } catch (error) {
    console.error('Organization stats error:', error);
    return NextResponse.json({
      companies: 0,
      positions: 0,
      departments: 0,
      jobTitles: 0,
      employees: 0,
      activeEmployees: 0,
    });
  }
}
