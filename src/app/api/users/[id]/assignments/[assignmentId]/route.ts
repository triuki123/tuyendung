/**
 * PUT    /api/users/[id]/assignments/[assignmentId] — cập nhật phân công (đơn vị/chức danh/vai trò/quản lý/primary).
 * DELETE /api/users/[id]/assignments/[assignmentId] — kết thúc phân công (soft, is_active=false).
 * Chỉ super_admin, hoặc admin trong công ty hiệu lực của mình.
 */
import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { updateAssignment, endAssignment, listAssignmentsDetailed } from '@/lib/services/orgStructureService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

async function checkWriteAccess(request: NextRequest, assignmentId: string, userId: string) {
  const currentUserId = request.headers.get('x-current-user-id');
  if (!currentUserId) return { ok: false, status: 401, error: 'Chưa đăng nhập' };

  const assignment = await queryOne<{ company_id: string; user_id: string }>(
    `SELECT company_id::text AS company_id, user_id::text AS user_id
       FROM org_assignments WHERE id = $1`,
    [assignmentId]
  );
  if (!assignment || assignment.user_id !== userId) {
    return { ok: false, status: 404, error: 'Không tìm thấy phân công' };
  }

  const actor = await queryOne<{ role: string }>(
    `SELECT role FROM users WHERE id::text = $1`,
    [currentUserId]
  );
  if (actor?.role === 'super_admin') return { ok: true };
  if (actor?.role === 'admin') {
    const currentCompany = request.headers.get('x-current-user-company');
    const ctx = await getEffectiveContext(currentUserId, currentCompany || null);
    if (ctx?.role && ['admin', 'super_admin'].includes(ctx.role) && ctx.company_id === assignment.company_id) {
      return { ok: true };
    }
  }
  return { ok: false, status: 403, error: 'Không có quyền phân công tổ chức' };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const { id, assignmentId } = await params;
    const access = await checkWriteAccess(request, assignmentId, id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    const body = await request.json();
    const updated = await updateAssignment(assignmentId, body);
    if (!updated) return NextResponse.json({ error: 'Không tìm thấy phân công' }, { status: 404 });
    const data = await listAssignmentsDetailed(id);
    return NextResponse.json({ success: true, updated, data });
  } catch (err) {
    console.error('PUT /api/users/[id]/assignments/[assignmentId] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const { id, assignmentId } = await params;
    const access = await checkWriteAccess(request, assignmentId, id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    const ok = await endAssignment(assignmentId);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy phân công' }, { status: 404 });
    const data = await listAssignmentsDetailed(id);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('DELETE /api/users/[id]/assignments/[assignmentId] error:', err);
    // Lỗi nghiệp vụ (vd chặn kết thúc phân công chính tại công ty chính) → trả message rõ cho UI toast
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi server' },
      { status: 400 }
    );
  }
}
