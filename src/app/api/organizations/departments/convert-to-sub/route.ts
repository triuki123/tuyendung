import { NextRequest, NextResponse } from 'next/server';
import { convertDepartmentToSubDepartment } from '@/lib/services/orgStructureService';
import { getVisibleCompanyIds } from '@/lib/services/userCompanyService';
import { checkUnitAccess } from '@/lib/api-permissions';
import { departmentsService } from '@/lib/services/departmentsService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/organizations/departments/convert-to-sub
 * Body: { departmentId, targetDepartmentId }
 * Chuyển 1 phòng ban (kèm nhân sự) thành bộ phận trực thuộc phòng ban đích.
 * Cần quyền organization: edit. Admin chỉ được thao tác trong công ty của mình.
 */
export async function POST(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'organization', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const departmentId = String(body?.departmentId || '');
    const targetDepartmentId = String(body?.targetDepartmentId || '');
    if (!departmentId || !targetDepartmentId) {
      return NextResponse.json({ error: 'Thiếu phòng ban nguồn hoặc đích' }, { status: 400 });
    }

    // Không phải super_admin → chỉ thao tác trong công ty MÌNH THUỘC VỀ.
    const allowed = await getVisibleCompanyIds(request.headers.get('x-current-user-id'));
    if (allowed !== null) {
      const src = await departmentsService.getDepartmentById(departmentId).catch(() => null);
      if (!src || !allowed.includes(src.company_id)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const res = await convertDepartmentToSubDepartment(departmentId, targetDepartmentId);
    return NextResponse.json({ success: true, ...res });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    console.error('POST /api/organizations/departments/convert-to-sub error:', err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
