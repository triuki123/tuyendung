import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/contractTypeService';
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
    const row = await svc.updateContractType(params.id, {
      name: body.name,
      description: body.description,
      code: body.code,
      code_template: body.code_template,
      sort_order: body.sort_order,
      is_active: body.is_active,
    });
    if (!row) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    console.error('PUT /api/contract-types/[id] error:', err);
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
    const row = await svc.deactivateContractType(params.id);
    if (!row) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    console.error('DELETE /api/contract-types/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
