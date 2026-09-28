import { NextRequest, NextResponse } from 'next/server';
import { listEmploymentTypes, createEmploymentType } from '@/lib/services/employmentTypeService';
import { canManageEvaluations } from '@/lib/services/evaluationPermissionService';

export async function GET(request: NextRequest) {
  try {
    const all = new URL(request.url).searchParams.get('all') === '1';
    const data = await listEmploymentTypes(all);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/employment-types error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const canEdit = await canManageEvaluations(userId, 'edit');
    if (!canEdit) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const body = await request.json();
    if (!body.name?.trim()) return NextResponse.json({ error: 'Thiếu tên' }, { status: 400 });

    const data = await createEmploymentType({
      name: body.name,
      description: body.description ?? null,
      default_duration_days: body.default_duration_days ?? null,
      requires_evaluation: body.requires_evaluation ?? false,
      sort_order: body.sort_order ?? 0,
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/employment-types error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
