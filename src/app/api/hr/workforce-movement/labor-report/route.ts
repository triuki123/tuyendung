import { NextRequest, NextResponse } from 'next/server';
import { checkModuleAccess } from '@/lib/api-permissions';
import { getLaborUsageReport } from '@/lib/services/workforceMovementService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/workforce-movement/labor-report?year=&company_id=
 * Dữ liệu Báo cáo sử dụng lao động (Mẫu 01/PLI — Nghị định 145/2020/NĐ-CP).
 * Quyền: module hr (view). Client dùng dữ liệu này để dựng file Excel.
 * Phân quyền: super_admin → dùng query param company_id hoặc activeCompany;
 *             role khác → bắt buộc dùng activeCompany từ header.
 */
export async function GET(request: NextRequest) {
  try {
    if (!checkModuleAccess(request, 'hr', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const uid = request.headers.get('x-current-user-id');
    if (!uid) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const activeCompany = request.headers.get('x-current-user-company');
    const ctx = await getEffectiveContext(uid, activeCompany);

    const sp = request.nextUrl.searchParams;
    const yearParam = sp.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'Năm không hợp lệ' }, { status: 400 });
    }

    // super_admin có thể chọn công ty qua query param; role khác bắt buộc dùng công ty active
    const companyId: string | null =
      ctx?.role === 'super_admin'
        ? (sp.get('company_id') || activeCompany)
        : (activeCompany ?? null);

    const data = await getLaborUsageReport({ year, companyId });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/hr/workforce-movement/labor-report error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
