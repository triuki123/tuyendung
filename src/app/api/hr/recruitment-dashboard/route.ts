import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getVisibleCompanyIds } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/recruitment-dashboard — số liệu tổng hợp Tình Hình Tuyển Dụng Nhân Sự.
 * Phân quyền dữ liệu: super_admin → toàn bộ; các role khác → chỉ công ty active.
 */
export async function GET(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'hr-recruitment-dashboard', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    const uid = request.headers.get('x-current-user-id');
    if (!uid) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const activeCompany = request.headers.get('x-current-user-company');
    const sp = request.nextUrl.searchParams;
    const requested = sp.get('company') || undefined;

    // Phạm vi công ty được phép xem — dùng helper CHUẨN của toàn hệ thống:
    //   null  = super_admin (mọi công ty)
    //   []    = không thuộc công ty nào
    //   [...] = chỉ các công ty user thuộc về
    // KHÔNG dùng getEffectiveContext ở đây: nó còn chạy overlay org_assignments (điểm dễ vỡ
    // trên prod) → nếu lỗi sẽ null hóa → super_admin bị nhận nhầm → bộ lọc ?company= bị bỏ qua.
    // getVisibleCompanyIds trả null NGAY sau khi xác định super_admin, không đụng org_assignments.
    const allowed = await getVisibleCompanyIds(uid);
    if (allowed !== null && allowed.length === 0) {
      return NextResponse.json({ error: 'Không có công ty trong phạm vi quyền' }, { status: 403 });
    }

    // Áp bộ lọc theo YÊU CẦU nếu user được phép xem công ty đó (super_admin: allowed=null →
    // xem mọi công ty nên luôn được). Không có/không hợp lệ → về công ty đang active / công ty
    // đầu tiên trong phạm vi quyền (không bao giờ để lộ toàn hệ thống cho user bị giới hạn).
    let companyId: string | undefined;
    if (requested && (allowed === null || allowed.includes(requested))) {
      companyId = requested;
    } else if (allowed === null) {
      companyId = undefined; // super_admin không chọn công ty → toàn hệ thống
    } else {
      companyId = (activeCompany && allowed.includes(activeCompany) ? activeCompany : allowed[0]) || undefined;
    }

    const data = process.env.NEXT_PUBLIC_RECRUITMENT_FOCUS === 'true'
      ? await (await import('@/lib/services/recruitmentFocusService')).getRecruitmentFocusOverview(companyId)
      : await (await import('@/lib/services/recruitmentDashboardService')).getRecruitmentDashboard({
          companyId,
          from: sp.get('from') || undefined,
          to: sp.get('to') || undefined,
        });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/hr/recruitment-dashboard error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
