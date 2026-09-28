import { NextRequest, NextResponse } from 'next/server';
import { moveSubDepartmentToDepartment } from '@/lib/services/orgStructureService';
import { getVisibleCompanyIds } from '@/lib/services/userCompanyService';
import { checkUnitAccess } from '@/lib/api-permissions';
import { queryOne } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/organizations/sub-departments/move
 * Body: { subDepartmentId, targetDepartmentId }
 * Chuyển 1 bộ phận (kèm nhân sự) sang phòng ban khác cùng công ty. Cần organization: edit.
 */
export async function POST(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'organization', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const subDepartmentId = String(body?.subDepartmentId || '');
    const targetDepartmentId = String(body?.targetDepartmentId || '');
    if (!subDepartmentId || !targetDepartmentId) {
      return NextResponse.json({ error: 'Thiếu bộ phận hoặc phòng ban đích' }, { status: 400 });
    }

    // Không phải super_admin → chỉ thao tác trong công ty MÌNH THUỘC VỀ.
    const allowed = await getVisibleCompanyIds(request.headers.get('x-current-user-id'));
    if (allowed !== null) {
      const row = await queryOne<{ company_id: string }>(
        `SELECT d.company_id::text AS company_id
           FROM sub_departments sd JOIN departments d ON d.id = sd.department_id
          WHERE sd.id::text = $1`, [subDepartmentId]);
      if (!row || !allowed.includes(row.company_id)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const res = await moveSubDepartmentToDepartment(subDepartmentId, targetDepartmentId);
    return NextResponse.json({ success: true, ...res });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    console.error('POST /api/organizations/sub-departments/move error:', err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
