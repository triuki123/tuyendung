/**
 * GET    /api/organizations/hidden-units?company_id=...
 *   → toàn bộ phòng ban/bộ phận đã XOÁ MỀM (is_active=false) còn trong DB,
 *     kèm số phân công/user còn "ngầm" trỏ vào.
 * DELETE /api/organizations/hidden-units
 *   Body: { unit_type: 'department'|'sub_department', id }
 *   → XOÁ CỨNG (dọn sạch tham chiếu trước). CHỈ super_admin.
 */
import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { listHiddenUnits, hardDeleteHiddenUnit } from '@/lib/services/orgStructureService';
import { getVisibleCompanyIds, resolveDefaultCompanyId } from '@/lib/services/userCompanyService';
import { checkUnitAccess } from '@/lib/api-permissions';

export async function GET(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'organization', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const requestedCompanyId = searchParams.get('company_id');
    // super_admin (allowed=null) xem mọi công ty; còn lại khoá vào công ty ĐANG CHỌN.
    const allowed = await getVisibleCompanyIds(request.headers.get('x-current-user-id'));
    const companyId: string | null =
      requestedCompanyId ??
      resolveDefaultCompanyId(allowed, request.headers.get('x-current-user-company'));
    if (allowed !== null && (!companyId || !allowed.includes(companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const data = await listHiddenUnits(companyId || undefined);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/organizations/hidden-units error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    if (!currentUserId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const actor = await queryOne<{ role: string }>(
      `SELECT role FROM users WHERE id::text = $1`, [currentUserId]);
    if (actor?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Chỉ Super Admin được xoá cứng đơn vị' }, { status: 403 });
    }

    const body = await request.json();
    if (!body.id || !['company', 'department', 'sub_department'].includes(body.unit_type)) {
      return NextResponse.json({ error: 'Thiếu unit_type/id hợp lệ' }, { status: 400 });
    }
    const result = await hardDeleteHiddenUnit(body.unit_type, body.id);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('DELETE /api/organizations/hidden-units error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi server' },
      { status: 400 }
    );
  }
}
