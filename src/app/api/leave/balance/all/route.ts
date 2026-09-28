import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/leaveBalanceService';
import { requireCompanyContext } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

/** GET — bảng số dư phép năm toàn nhân sự (admin): ?year=2026
 *  super_admin → toàn hệ thống; admin → công ty ĐANG LÀM VIỆC (active). */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireCompanyContext(request);
    if ('response' in ctx) return ctx.response;
    const { context } = ctx;
    if (context.role !== 'super_admin' && context.role !== 'admin') {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year')
      ? parseInt(searchParams.get('year')!)
      : new Date().getFullYear();

    // super_admin → toàn hệ thống; admin → công ty đang làm việc (không phải công ty
    // chính của admin). Nhờ vậy admin kiêm nhiệm quản đúng công ty đang chọn.
    const companyId = context.role === 'admin' ? context.company_id : null;

    const data = await svc.getAllBalances(year, { companyId });
    return NextResponse.json({ success: true, data, year });
  } catch (err) {
    console.error('GET /api/leave/balance/all error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
