import { updateDomain, deleteDomain, getDomainById } from '@/lib/services/domainsService';
import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import {
  canAccessManagedAssetData,
  getAssetVisibleUserIds,
  type AssetScopeContext,
} from '@/lib/services/assetAccessService';

function getScopeContext(request: NextRequest): AssetScopeContext | null {
  const userId = request.headers.get('x-current-user-id');
  if (!userId) return null;
  return {
    userId,
    role: request.headers.get('x-current-user-role') || 'user',
    companyId: request.headers.get('x-current-user-company'),
  };
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!checkUnitAccess(request, 'asset-domains', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const { id } = await params;
    const context = getScopeContext(request);
    if (!context) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const existing = await getDomainById(id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!(await canAccessManagedAssetData(context, {
      companyId: existing.ownerCompanyId,
      userId: existing.managerUserId,
    }))) {
      return NextResponse.json({ error: 'Dữ liệu nằm ngoài phạm vi của bạn' }, { status: 403 });
    }
    const body = await request.json();
    if (context.role !== 'super_admin') {
      body.ownerCompanyId = existing.ownerCompanyId;
      body.owner_company_id = existing.ownerCompanyId;
      if (body.managerUserId || body.manager_user_id) {
        const visibleUserIds = await getAssetVisibleUserIds(context);
        const managerUserId = body.managerUserId || body.manager_user_id;
        if (!visibleUserIds.includes(managerUserId)) {
          return NextResponse.json({ error: 'Không được gán tên miền ngoài phạm vi quản lý' }, { status: 403 });
        }
      }
    }
    const updated = await updateDomain(id, body);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Domain update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update domain' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!checkUnitAccess(request, 'asset-domains', 'delete')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const { id } = await params;
    const context = getScopeContext(request);
    if (!context) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const existing = await getDomainById(id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!(await canAccessManagedAssetData(context, {
      companyId: existing.ownerCompanyId,
      userId: existing.managerUserId,
    }))) {
      return NextResponse.json({ error: 'Dữ liệu nằm ngoài phạm vi của bạn' }, { status: 403 });
    }
    await deleteDomain(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Domain deletion error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete domain' },
      { status: 500 }
    );
  }
}
