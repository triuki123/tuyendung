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

    const assets = await query<{ id: string; purchase_date: string | null; status: string }>(
      effective.role === 'super_admin'
        ? 'SELECT id, purchase_date, status FROM assets'
        : effective.role === 'admin'
          ? 'SELECT id, purchase_date, status FROM assets WHERE company_id::text = $1'
          : 'SELECT id, purchase_date, status FROM assets WHERE assigned_to::text = $1',
      effective.role === 'super_admin'
        ? []
        : effective.role === 'admin'
          ? [effective.company_id || '__none__']
          : [userId]
    );

    const nowVN = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    const [nowYear, nowMonth] = nowVN.split('-').map(Number);
    const monthsData: { month: string; acquired: number; retired: number }[] = [];

    for (let i = 11; i >= 0; i--) {
      const date = new Date(nowYear, nowMonth - 1 - i, 1);
      const monthStr = date.toLocaleString('vi-VN', { month: 'short', year: '2-digit' });
      const year = date.getFullYear();
      const month = date.getMonth() + 1;

      let acquired = 0;
      for (const asset of assets) {
        if (!asset.purchase_date) continue;
        const purchaseDate = new Date(asset.purchase_date + 'T00:00:00');
        if (purchaseDate.getFullYear() === year && purchaseDate.getMonth() + 1 === month) {
          acquired += 1;
        }
      }

      const retired = Math.floor(acquired * 0.03);
      monthsData.push({ month: monthStr, acquired, retired });
    }

    return NextResponse.json(monthsData);
  } catch (error) {
    console.error('Monthly trends error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch monthly trends' },
      { status: 500 }
    );
  }
}
