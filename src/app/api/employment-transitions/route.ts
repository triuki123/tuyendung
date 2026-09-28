import { NextRequest, NextResponse } from 'next/server';
import { listTransitions, createTransition } from '@/lib/services/employmentTransitionService';
import { canManageEvaluations } from '@/lib/services/evaluationPermissionService';

export const dynamic = 'force-dynamic';

/** GET — danh sách luồng chuyển tiếp sau thử việc (kèm loại HĐ tự sinh). */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const data = await listTransitions();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/employment-transitions error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST — tạo luồng mới { from_employment_type_id, to_employment_type_id }. */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageEvaluations(userId, 'edit'))) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    const id = await createTransition({
      from_employment_type_id: body.from_employment_type_id,
      to_employment_type_id: body.to_employment_type_id,
    });
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
