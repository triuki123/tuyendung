import { query } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getCompanyMemberUserIds, getEffectiveContext } from '@/lib/services/userCompanyService';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getOrgSubtreeUserIds } from '@/lib/services/attendanceService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'room-bookings', 'view')) {
      return NextResponse.json({ error: 'Khong co quyen' }, { status: 403 });
    }
    const currentUserId = request.headers.get('x-current-user-id');
    const currentUserCompany = request.headers.get('x-current-user-company');
    const ctx = currentUserId
      ? await getEffectiveContext(currentUserId, currentUserCompany || null)
      : null;

    const params: any[] = [];
    let scopeClause = '';
    if (ctx?.role === 'admin' && ctx.company_id) {
      params.push(ctx.company_id);
      scopeClause = `AND company_id::text = $1`;
    } else if (ctx?.role === 'manager' && currentUserId) {
      const visibleIds = [currentUserId, ...(await getOrgSubtreeUserIds(currentUserId, ctx.company_id || null))];
      params.push(visibleIds);
      scopeClause = `AND id::text = ANY($1::text[])`;
    } else if (ctx?.role && ctx.role !== 'super_admin' && currentUserId) {
      params.push(currentUserId);
      scopeClause = `AND id::text = $1`;
    }

    const users = await query(
      `SELECT * FROM users
       WHERE status = 'active'
       ${scopeClause}
       ORDER BY name ASC`,
      params
    );

    return NextResponse.json(users);
  } catch (error) {
    console.error('Error fetching participants:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch participants' },
      { status: 500 }
    );
  }
}
