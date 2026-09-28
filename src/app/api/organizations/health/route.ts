/**
 * GET /api/organizations/health — báo cáo "sức khoẻ tổ chức" cho HR/admin:
 *  - user active chưa có phân công chính (org_assignments)
 *  - đơn vị (công ty/phòng ban/bộ phận) chưa có trưởng khai báo
 *  - chức danh đang dùng nhưng còn cấp bậc mặc định (chưa xếp tường minh)
 * ?company_id=... để lọc theo 1 công ty. Admin bị khoá vào công ty hiệu lực.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getOrgHealthReport } from '@/lib/services/orgStructureService';
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

    const data = await getOrgHealthReport(companyId || undefined);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/organizations/health error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
