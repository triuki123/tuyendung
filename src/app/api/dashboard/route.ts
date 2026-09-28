import { getSoftware } from '@/lib/services/softwareService';
import { getDomains } from '@/lib/services/domainsService';
import { getEmailAccounts } from '@/lib/services/emailAccountsService';
import { query } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getAssetVisibleUserIds, type AssetScopeContext } from '@/lib/services/assetAccessService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

async function getScopeContext(request: NextRequest): Promise<AssetScopeContext | null> {
  const userId = request.headers.get('x-current-user-id');
  if (!userId) return null;
  const activeCompany = request.headers.get('x-current-user-company');
  const ctx = await getEffectiveContext(userId, activeCompany || null);
  if (!ctx) return null;
  return {
    userId,
    role: ctx.role,
    companyId: ctx.company_id,
  };
}

export async function GET(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'asset-management', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const context = await getScopeContext(request);
    if (!context) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const visibleUserIds = context.role === 'super_admin' || context.role === 'admin'
      ? undefined
      : await getAssetVisibleUserIds(context);
    const companyId = context.role === 'admin' ? context.companyId || '__none__' : undefined;
    const hardwareWhere = context.role === 'super_admin'
      ? ''
      : context.role === 'admin'
        ? 'WHERE company_id::text = $1'
        : 'WHERE assigned_to::text = ANY($1::text[])';
    const hardwareParams = context.role === 'super_admin'
      ? []
      : context.role === 'admin'
        ? [context.companyId || '__none__']
        : [visibleUserIds || []];

    const [softwareResult, domainsResult, emailAccountsResult, hardwareResult] = await Promise.all([
      getSoftware({
        companyId,
        managerUserIds: visibleUserIds,
      }).catch(() => []),
      getDomains({
        companyId,
        managerUserIds: visibleUserIds,
      }).catch(() => []),
      getEmailAccounts({
        companyId,
        userIds: visibleUserIds,
      }).catch(() => []),
      query(`SELECT * FROM assets ${hardwareWhere}`, hardwareParams).catch(() => []),
    ]);

    const softwareData = Array.isArray(softwareResult) ? softwareResult : [];
    const domainsData = Array.isArray(domainsResult) ? domainsResult : [];
    const emailAccountsData = Array.isArray(emailAccountsResult) ? emailAccountsResult : [];
    const hardwareData = Array.isArray(hardwareResult) ? hardwareResult : [];

    const softwareCount = softwareData.length;
    const domainsCount = domainsData.length;
    const emailAccountsCount = emailAccountsData.length;
    const hardwareCount = hardwareData.length;

    const expiringDomains = domainsData.filter((d: any) => d.status === 'expiring' || d.status === 'expired').length;
    const expiringSoftware = softwareData.filter((s: any) => s.status === 'expiring' || s.status === 'expired').length;
    const totalWarnings = expiringDomains + expiringSoftware;

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let recentActivityCount = 0;
    recentActivityCount += domainsData.filter((d: any) => new Date(d.created_at) >= sevenDaysAgo).length;
    recentActivityCount += softwareData.filter((s: any) => new Date(s.created_at) >= sevenDaysAgo).length;
    recentActivityCount += emailAccountsData.filter((e: any) => new Date(e.created_at) >= sevenDaysAgo).length;
    recentActivityCount += hardwareData.filter((h: any) => new Date(h.created_at) >= sevenDaysAgo).length;

    const totalAssets = softwareCount + domainsCount + emailAccountsCount + hardwareCount;

    return NextResponse.json({
      modules: {
        hardware: { count: hardwareCount, label: 'Phần Cứng' },
        domains: { count: domainsCount, label: 'Tên Miền' },
        emailAccounts: { count: emailAccountsCount, label: 'Tài Khoản Email' },
        software: { count: softwareCount, label: 'Phần Mềm' },
      },
      summary: {
        totalAssets,
        warnings: totalWarnings,
        recentActivity: recentActivityCount,
      },
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      {
        modules: {
          hardware: { count: 0, label: 'Phần Cứng' },
          domains: { count: 0, label: 'Tên Miền' },
          emailAccounts: { count: 0, label: 'Tài Khoản Email' },
          software: { count: 0, label: 'Phần Mềm' },
        },
        summary: {
          totalAssets: 0,
          warnings: 0,
          recentActivity: 0,
        },
      },
      { status: 200 }
    );
  }
}
