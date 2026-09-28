import { query } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveContext, getCompanyMemberUserIds } from '@/lib/services/userCompanyService';

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

    const companyUserIds = effective.role === 'admin' && effective.company_id
      ? await getCompanyMemberUserIds(effective.company_id)
      : null;

    const assetSql = effective.role === 'super_admin'
      ? 'SELECT id, status, value, assigned_to FROM assets'
      : effective.role === 'admin'
        ? 'SELECT id, status, value, assigned_to FROM assets WHERE company_id::text = $1'
        : 'SELECT id, status, value, assigned_to FROM assets WHERE assigned_to::text = ANY($1::text[])';
    const assetParams = effective.role === 'super_admin'
      ? []
      : effective.role === 'admin'
        ? [effective.company_id || '__none__']
        : [[userId]];

    const ticketSql = effective.role === 'super_admin'
      ? "SELECT id, status FROM tickets WHERE status = ANY($1)"
      : effective.role === 'admin'
        ? "SELECT id, status FROM tickets WHERE status = ANY($1) AND (requester_id::text = ANY($2::text[]) OR assigned_to::text = ANY($2::text[]))"
        : "SELECT id, status FROM tickets WHERE status = ANY($1) AND (requester_id::text = $2 OR assigned_to::text = $2)";
    const ticketParams = effective.role === 'super_admin'
      ? [['open', 'in_progress']]
      : effective.role === 'admin'
        ? [['open', 'in_progress'], companyUserIds?.length ? companyUserIds : ['__none__']]
        : [['open', 'in_progress'], userId];

    const [assets, tickets] = await Promise.all([
      query<{ id: string; status: string; value: number; assigned_to: string | null }>(assetSql, assetParams),
      query<{ id: string; status: string }>(ticketSql, ticketParams),
    ]);

    let totalAssets = 0;
    let assigned = 0;
    let available = 0;
    let maintenance = 0;
    let broken = 0;
    let totalValue = 0;

    for (const asset of assets) {
      totalAssets += 1;
      if (asset.assigned_to !== null) assigned += 1;
      if (asset.status === 'available') available += 1;
      if (asset.status === 'maintenance') maintenance += 1;
      if (asset.status === 'broken') broken += 1;
      // assets.value là BIGINT → pg trả CHUỖI, cộng thẳng sẽ NỐI CHUỖI ("0"+"0"="00").
      const v = Number(asset.value);
      if (Number.isFinite(v)) totalValue += v;
    }

    let openTickets = 0;
    for (const ticket of tickets) {
      if (ticket.status === 'open') openTickets += 1;
    }

    const assignedPercent = totalAssets > 0 ? (assigned / totalAssets) * 100 : 0;
    const availablePercent = totalAssets > 0 ? (available / totalAssets) * 100 : 0;

    return NextResponse.json({
      total: totalAssets,
      assigned,
      available,
      maintenance,
      broken,
      openTickets,
      totalValue,
      assignedPercent: Math.round(assignedPercent * 10) / 10,
      availablePercent: Math.round(availablePercent * 10) / 10,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch dashboard stats' },
      { status: 500 }
    );
  }
}
