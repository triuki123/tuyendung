import { NextRequest, NextResponse } from 'next/server';
import { updateEmploymentType, deactivateEmploymentType } from '@/lib/services/employmentTypeService';
import { canManageEvaluations } from '@/lib/services/evaluationPermissionService';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const canEdit = await canManageEvaluations(userId, 'edit');
    if (!canEdit) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const body = await request.json();
    const data = await updateEmploymentType(params.id, body);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('PUT /api/employment-types/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const canEdit = await canManageEvaluations(userId, 'edit');
    if (!canEdit) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const data = await deactivateEmploymentType(params.id);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('DELETE /api/employment-types/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
