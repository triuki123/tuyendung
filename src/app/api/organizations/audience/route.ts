import { NextRequest, NextResponse } from 'next/server';
import { resolveOrgAudience } from '@/lib/services/orgAudienceService';
import { getVisibleCompanyIds } from '@/lib/services/userCompanyService';

/**
 * GET /api/organizations/audience?company_id=&department_id=&sub_department_id=
 * Resolve nhân sự đang active theo phạm vi tổ chức — dùng cho Trung Tâm Email (tab Nội Bộ)
 * nhắm đối tượng gửi email/Telegram theo Công ty/Phòng ban/Bộ phận hoặc toàn công ty.
 */
export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id');
    const departmentId = request.nextUrl.searchParams.get('department_id');
    const subDepartmentId = request.nextUrl.searchParams.get('sub_department_id');
    if (!companyId) return NextResponse.json({ error: 'Thiếu company_id' }, { status: 400 });

    const allowed = await getVisibleCompanyIds(request.headers.get('x-current-user-id'));
    if (allowed !== null && !allowed.includes(companyId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const data = await resolveOrgAudience({ companyId, departmentId, subDepartmentId });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('GET /api/organizations/audience error:', error);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
