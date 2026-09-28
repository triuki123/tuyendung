import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { execute, queryOne } from '@/lib/db';
import { softDeleteMedia } from '@/lib/services/mediaService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

async function assertScoped(id: string, userId: string, companyId: string | null) {
  const ctx = await getEffectiveContext(userId, companyId);
  if (!ctx) return false;
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM design_requests WHERE id = $1 AND ($2::text IS NULL OR company_id = $2)`,
    [id, ctx.role === 'super_admin' ? null : ctx.company_id]
  );
  return !!row;
}

// PATCH — đánh dấu 1 phiên bản là "Đã duyệt" (chỉ 1 phiên bản/yêu cầu được
// đánh dấu tại 1 thời điểm — bỏ đánh dấu các phiên bản khác cùng yêu cầu).
export async function PATCH(request: NextRequest, { params }: { params: { id: string; versionId: string } }) {
  try {
    if (!checkUnitAccess(request, 'design-requests', 'edit')) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await assertScoped(params.id, userId, request.headers.get('x-current-user-company'))))
      return NextResponse.json({ error: 'Không tìm thấy yêu cầu' }, { status: 404 });
    const body = await request.json();
    if (body.status && !['pending', 'approved'].includes(body.status)) return NextResponse.json({ error: 'Trạng thái không hợp lệ' }, { status: 400 });
    if (body.status === 'approved') {
      await execute(`UPDATE design_request_versions SET status='pending' WHERE design_request_id=$1`, [params.id]);
    }
    const row = await queryOne(
      `UPDATE design_request_versions SET status=COALESCE($3,status), note=COALESCE($4,note)
        WHERE id=$1 AND design_request_id=$2 RETURNING *`,
      [params.versionId, params.id, body.status || null, body.note ?? null]
    );
    if (!row) return NextResponse.json({ error: 'Không tìm thấy phiên bản' }, { status: 404 });
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    console.error('PATCH version error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string; versionId: string } }) {
  try {
    if (!checkUnitAccess(request, 'design-requests', 'delete')) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await assertScoped(params.id, userId, request.headers.get('x-current-user-company'))))
      return NextResponse.json({ error: 'Không tìm thấy yêu cầu' }, { status: 404 });
    const row = await queryOne<{ media_id: string | null }>(
      `DELETE FROM design_request_versions WHERE id=$1 AND design_request_id=$2 RETURNING media_id`,
      [params.versionId, params.id]
    );
    if (row?.media_id) await softDeleteMedia(row.media_id).catch(() => {});
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE version error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
