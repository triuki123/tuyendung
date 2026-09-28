import {
  updateEmailAccount,
  deleteEmailAccount,
  getEmailAccountById,
} from '@/lib/services/emailAccountsService';
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
    if (!checkUnitAccess(request, 'asset-emails', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền sửa tài khoản email' }, { status: 403 });
    }

    const { id } = await params;
    const context = getScopeContext(request);
    if (!context) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const existing = await getEmailAccountById(id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!(await canAccessManagedAssetData(context, {
      companyId: existing.companyId,
      userId: existing.userId,
    }))) {
      return NextResponse.json({ error: 'Dữ liệu nằm ngoài phạm vi của bạn' }, { status: 403 });
    }

    const body = await request.json();
    if (context.role !== 'super_admin') {
      body.companyId = existing.companyId;
      body.company_id = existing.companyId;
      if (body.userId || body.user_id) {
        const visibleUserIds = await getAssetVisibleUserIds(context);
        const accountUserId = body.userId || body.user_id;
        if (!visibleUserIds.includes(accountUserId)) {
          return NextResponse.json({ error: 'Không được gán email ngoài phạm vi quản lý' }, { status: 403 });
        }
      }
    }

    const updated = await updateEmailAccount(id, body);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Email account update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update email account' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!checkUnitAccess(request, 'asset-emails', 'delete')) {
      return NextResponse.json({ error: 'Không có quyền xóa tài khoản email' }, { status: 403 });
    }

    const { id } = await params;
    const context = getScopeContext(request);
    if (!context) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const existing = await getEmailAccountById(id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!(await canAccessManagedAssetData(context, {
      companyId: existing.companyId,
      userId: existing.userId,
    }))) {
      return NextResponse.json({ error: 'Dữ liệu nằm ngoài phạm vi của bạn' }, { status: 403 });
    }

    await deleteEmailAccount(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Email account deletion error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete email account' },
      { status: 500 }
    );
  }
}
