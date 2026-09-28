import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/hrDocumentTypeService';
import { canManageContracts } from '@/lib/services/contractPermissionService';

export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageContracts(userId, 'edit'))) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    const row = await svc.updateHrDocumentType(params.id, {
      name: body.name,
      description: body.description,
      sort_order: body.sort_order,
      is_active: body.is_active,
      onboarding_visible: body.onboarding_visible,
      onboarding_required: body.onboarding_required,
      onboarding_multiple: body.onboarding_multiple,
    });
    if (!row) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    console.error('PUT /api/hr-document-types/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageContracts(userId, 'edit'))) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const row = await svc.deactivateHrDocumentType(params.id);
    if (!row) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    console.error('DELETE /api/hr-document-types/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
