import { NextRequest, NextResponse } from 'next/server';
import { updateTransition, deleteTransition } from '@/lib/services/employmentTransitionService';
import { canManageEvaluations } from '@/lib/services/evaluationPermissionService';

export const dynamic = 'force-dynamic';

/** PUT — cập nhật luồng: { to_employment_type_id?, is_active?, contract_type_ids? }. */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageEvaluations(userId, 'edit'))) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    await updateTransition(params.id, {
      to_employment_type_id: body.to_employment_type_id,
      is_active: body.is_active,
      contract_type_ids: Array.isArray(body.contract_type_ids) ? body.contract_type_ids : undefined,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/** DELETE — xoá luồng. */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageEvaluations(userId, 'edit'))) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const ok = await deleteTransition(params.id);
    return NextResponse.json({ success: ok });
  } catch (err) {
    console.error('DELETE /api/employment-transitions/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
