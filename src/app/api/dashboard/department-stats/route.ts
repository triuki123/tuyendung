import { query } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    const activeCompany = request.headers.get('x-current-user-company');
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const effective = await getEffectiveContext(userId, activeCompany || null);
    if (!effective) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const whereClause = effective.role === 'super_admin'
      ? ''
      : effective.role === 'admin'
        ? 'WHERE a.company_id::text = $1'
        : 'WHERE a.assigned_to::text = $1';
    const params = effective.role === 'super_admin'
      ? []
      : effective.role === 'admin'
        ? [effective.company_id || '__none__']
        : [userId];

    const stats = await query<{ department: string; count: string }>(
      `SELECT COALESCE(d.name, 'Chưa phân loại') as department, COUNT(*) as count
       FROM assets a
       LEFT JOIN departments d ON d.id = a.department_id
       ${whereClause}
       GROUP BY COALESCE(d.name, 'Chưa phân loại')
       ORDER BY count DESC
       LIMIT 10`,
      params
    );

    return NextResponse.json(
      stats.map((s) => ({ department: s.department, count: parseInt(s.count, 10) }))
    );
  } catch (error) {
    console.error('Department stats error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch department stats' },
      { status: 500 }
    );
  }
}
