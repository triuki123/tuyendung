import { NextRequest, NextResponse } from 'next/server';
import { checkModuleAccess } from '@/lib/api-permissions';
import { getWorkforceMovement } from '@/lib/services/workforceMovementService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/workforce-movement?year=&date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
 * Số liệu Tình Hình Biến Động Nhân Sự (phòng Nhân Sự). Quyền: module hr (view).
 * company_id được suy từ effective context — không tin query param.
 */
export async function GET(request: NextRequest) {
  try {
    if (!checkModuleAccess(request, 'hr', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company');
    const effectiveContext = await getEffectiveContext(userId, activeCompany);
    const role = effectiveContext?.role ?? 'user';

    // super_admin có thể lọc theo company_id từ query; role khác chỉ thấy công ty active
    const sp = request.nextUrl.searchParams;
    const companyId = role === 'super_admin'
      ? (sp.get('company_id') || activeCompany)
      : activeCompany;

    const dateFrom = sp.get('date_from');
    const dateTo = sp.get('date_to');

    // Chế độ khoảng ngày
    if (dateFrom && dateTo) {
      const data = await getWorkforceMovement({ dateFrom, dateTo, companyId });
      return NextResponse.json({ success: true, data });
    }

    // Chế độ năm (mặc định)
    const yearParam = sp.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'Năm không hợp lệ' }, { status: 400 });
    }
    const data = await getWorkforceMovement({ year, companyId });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/hr/workforce-movement error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
