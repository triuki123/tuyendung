import { NextRequest, NextResponse } from 'next/server';
import { listRules, createRule } from '@/lib/services/expenseApprovalService';
import { hasExpensePerm } from '@/lib/services/expensePermissionService';

export const dynamic = 'force-dynamic';

/** GET /api/expense-approval-rules — rule fallback per-company (expense.manage). */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await hasExpensePerm(userId, null, 'manage'))) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const data = await listRules();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/expense-approval-rules error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST — tạo rule (expense.manage). */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json();
    // Quyền `manage` xét tại ĐÚNG công ty của rule sắp tạo (null = rule dùng chung).
    if (!(await hasExpensePerm(userId, body.company_id ?? null, 'manage'))) {
      return NextResponse.json({ error: 'Không có quyền cấu hình tại công ty này' }, { status: 403 });
    }
    if (!Array.isArray(body.steps) || !body.steps.length) return NextResponse.json({ error: 'Chuỗi duyệt rỗng' }, { status: 400 });
    const data = await createRule(body);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/expense-approval-rules error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
