import { NextRequest, NextResponse } from 'next/server';
import { getExpenseCodeRule, upsertExpenseCodeRule } from '@/lib/services/expenseConfigService';
import { hasExpensePerm } from '@/lib/services/expensePermissionService';

export const dynamic = 'force-dynamic';

/** GET /api/expense-code-rules?company_id=... — quy tắc số phiếu của công ty (expense.manage). */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const companyId = request.nextUrl.searchParams.get('company_id');
    if (!companyId) return NextResponse.json({ error: 'Thiếu company_id' }, { status: 400 });
    // Quyền `manage` xét tại ĐÚNG công ty được hỏi.
    if (!(await hasExpensePerm(userId, companyId, 'manage'))) {
      return NextResponse.json({ error: 'Không có quyền cấu hình tại công ty này' }, { status: 403 });
    }
    const data = await getExpenseCodeRule(companyId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/expense-code-rules error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT — upsert quy tắc số phiếu cho công ty (expense.manage). */
export async function PUT(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json();
    if (!body.company_id) return NextResponse.json({ error: 'Thiếu company_id' }, { status: 400 });
    // Quyền `manage` xét tại ĐÚNG công ty của quy tắc.
    if (!(await hasExpensePerm(userId, body.company_id, 'manage'))) {
      return NextResponse.json({ error: 'Không có quyền cấu hình tại công ty này' }, { status: 403 });
    }
    const data = await upsertExpenseCodeRule(body.company_id, { pattern: body.pattern, reset_yearly: body.reset_yearly });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('PUT /api/expense-code-rules error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
