import { getEmailAccounts, createEmailAccount } from '@/lib/services/emailAccountsService';
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
    if (!checkUnitAccess(request, 'asset-emails', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const provider = searchParams.get('provider');
    const nguoisudung = searchParams.get('nguoisudung');
    const congtydonvi = searchParams.get('congtydonvi');
    const phongban = searchParams.get('phongban');
    const context = await getScopeContext(request);
    if (!context) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const accounts = await getEmailAccounts({
      status: status || undefined,
      provider: provider || undefined,
      nguoisudung: nguoisudung || undefined,
      congtydonvi: congtydonvi || undefined,
      phongban: phongban || undefined,
      companyId: context.role === 'admin' ? context.companyId || '__none__' : undefined,
      userIds: context.role === 'super_admin' || context.role === 'admin'
        ? undefined
        : await getAssetVisibleUserIds(context),
    });

    return NextResponse.json(accounts);
  } catch (error) {
    console.error('Email accounts fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch email accounts' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'asset-emails', 'create')) {
      return NextResponse.json({ error: 'Không có quyền tạo tài khoản email' }, { status: 403 });
    }

    const context = await getScopeContext(request);
    if (!context) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (context.role !== 'super_admin' && !context.companyId) {
      return NextResponse.json({ error: 'Tài khoản chưa được gán công ty' }, { status: 403 });
    }

    const body = await request.json();
    if (context.role !== 'super_admin') {
      body.companyId = context.companyId;
      body.company_id = context.companyId;
      if (body.userId || body.user_id) {
        const visibleUserIds = await getAssetVisibleUserIds(context);
        const accountUserId = body.userId || body.user_id;
        if (!visibleUserIds.includes(accountUserId)) {
          return NextResponse.json({ error: 'Không được gán email ngoài phạm vi quản lý' }, { status: 403 });
        }
      }
    }

    const newAccount = await createEmailAccount(body);
    return NextResponse.json(newAccount, { status: 201 });
  } catch (error) {
    console.error('Email account creation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create email accounts' },
      { status: 500 }
    );
  }
}
