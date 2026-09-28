import { NextRequest, NextResponse } from 'next/server';
import { getExpenseAnalytics } from '@/lib/services/expenseAnalyticsService';
import { hasExpensePerm } from '@/lib/services/expensePermissionService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/expenses/analytics?company_id=&month=YYYY-MM&include_pending=1
 * Số liệu + cảnh báo cho tab Tổng quan. Cần `expense.view` TẠI CÔNG TY được hỏi.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const sp = request.nextUrl.searchParams;
    const companyId = sp.get('company_id');
    if (!companyId) return NextResponse.json({ error: 'Thiếu company_id' }, { status: 400 });

    if (!(await hasExpensePerm(userId, companyId, 'view'))) {
      return NextResponse.json({ error: 'Không có quyền xem chi phí công ty này' }, { status: 403 });
    }

    const now = new Date();
    const monthParam = sp.get('month');
    const month = /^\d{4}-\d{2}$/.test(monthParam || '')
      ? (monthParam as string)
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const data = await getExpenseAnalytics(companyId, month, sp.get('include_pending') === '1');
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/expenses/analytics error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
