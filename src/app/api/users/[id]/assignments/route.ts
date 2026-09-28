/**
 * GET  /api/users/[id]/assignments — danh sách phân công tổ chức của user (kèm tên đơn vị).
 * POST /api/users/[id]/assignments — tạo phân công mới (kiêm nhiệm). Chỉ super_admin/admin.
 * Body POST: { company_id, department_id?, sub_department_id?, job_title_id?,
 *              org_role?, manager_id?, is_primary?, note? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { listAssignmentsDetailed, createAssignment } from '@/lib/services/orgStructureService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

async function checkWriteAccess(request: NextRequest, targetCompanyId?: string) {
  const currentUserId = request.headers.get('x-current-user-id');
  if (!currentUserId) return { ok: false, status: 401, error: 'Chưa đăng nhập' };
  const actor = await queryOne<{ role: string; company_id: string | null }>(
    `SELECT role, company_id FROM users WHERE id::text = $1`,
    [currentUserId]
  );
  if (actor?.role === 'super_admin') return { ok: true };
  if (actor?.role === 'admin') {
    // Admin chỉ phân công trong công ty hiệu lực của mình
    const currentCompany = request.headers.get('x-current-user-company');
    const ctx = await getEffectiveContext(currentUserId, currentCompany || null);
    if (ctx?.role && ['admin', 'super_admin'].includes(ctx.role) && targetCompanyId && ctx.company_id === targetCompanyId) {
      return { ok: true };
    }
  }
  return { ok: false, status: 403, error: 'Không có quyền phân công tổ chức' };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    const data = await listAssignmentsDetailed(id);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/users/[id]/assignments error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    const body = await request.json();
    if (!body.company_id) {
      return NextResponse.json({ error: 'Thiếu company_id' }, { status: 400 });
    }
    const access = await checkWriteAccess(request, body.company_id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    const created = await createAssignment(id, body);
    const data = await listAssignmentsDetailed(id);
    return NextResponse.json({ success: true, created, data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/users/[id]/assignments error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
