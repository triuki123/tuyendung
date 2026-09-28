import { updateSoftware, deleteSoftware, getSoftwareById } from '@/lib/services/softwareService';
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
    if (!checkUnitAccess(request, 'software', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const { id } = await params;
    const context = getScopeContext(request);
    if (!context) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const existing = await getSoftwareById(id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!(await canAccessManagedAssetData(context, {
      companyId: existing.companyId,
      userId: existing.managerUserId,
    }))) {
      return NextResponse.json({ error: 'Dữ liệu nằm ngoài phạm vi của bạn' }, { status: 403 });
    }
    const body = await request.json();
    if (context.role !== 'super_admin') {
      body.companyId = existing.companyId;
      body.company_id = existing.companyId;
      if (body.managerUserId || body.manager_user_id) {
        const visibleUserIds = await getAssetVisibleUserIds(context);
        const managerUserId = body.managerUserId || body.manager_user_id;
        if (!visibleUserIds.includes(managerUserId)) {
          return NextResponse.json({ error: 'Không được gán phần mềm ngoài phạm vi quản lý' }, { status: 403 });
        }
      }
    }
    const updated = await updateSoftware(id, body);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Software update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update software' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!checkUnitAccess(request, 'software', 'delete')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const { id } = await params;
    const context = getScopeContext(request);
    if (!context) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const existing = await getSoftwareById(id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!(await canAccessManagedAssetData(context, {
      companyId: existing.companyId,
      userId: existing.managerUserId,
    }))) {
      return NextResponse.json({ error: 'Dữ liệu nằm ngoài phạm vi của bạn' }, { status: 403 });
    }
    await deleteSoftware(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Software deletion error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete software' },
      { status: 500 }
    );
  }
}
