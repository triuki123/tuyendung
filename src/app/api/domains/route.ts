import { getDomains, createDomain } from '@/lib/services/domainsService';
import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getAssetVisibleUserIds, type AssetScopeContext } from '@/lib/services/assetAccessService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

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
    if (!checkUnitAccess(request, 'asset-domains', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const context = await getScopeContext(request);
    if (!context) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const domains = await getDomains({
      status: status || undefined,
      companyId: context.role === 'admin' ? context.companyId || '__none__' : undefined,
      managerUserIds: context.role === 'super_admin' || context.role === 'admin'
        ? undefined
        : await getAssetVisibleUserIds(context),
    });

    return NextResponse.json(domains);
  } catch (error) {
    console.error('Domains fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch domains' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'asset-domains', 'create')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const context = await getScopeContext(request);
    if (!context) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (context.role !== 'super_admin' && !context.companyId) {
      return NextResponse.json({ error: 'Tài khoản chưa được gán công ty' }, { status: 403 });
    }
    const body = await request.json();
    if (context.role !== 'super_admin') {
      body.ownerCompanyId = context.companyId;
      body.owner_company_id = context.companyId;
      if (body.managerUserId || body.manager_user_id) {
        const visibleUserIds = await getAssetVisibleUserIds(context);
        const managerUserId = body.managerUserId || body.manager_user_id;
        if (!visibleUserIds.includes(managerUserId)) {
          return NextResponse.json({ error: 'Không được gán tên miền ngoài phạm vi quản lý' }, { status: 403 });
        }
      }
    }
    const newDomain = await createDomain(body);
    return NextResponse.json(newDomain, { status: 201 });
  } catch (error) {
    console.error('Domain creation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create domain' },
      { status: 500 }
    );
  }
}
