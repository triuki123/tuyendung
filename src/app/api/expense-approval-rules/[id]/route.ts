import { NextRequest, NextResponse } from 'next/server';
import { updateRule, deleteRule, getRuleById } from '@/lib/services/expenseApprovalService';
import { hasExpensePerm } from '@/lib/services/expensePermissionService';

export const dynamic = 'force-dynamic';

/** Quyền `manage` xét theo ĐÚNG công ty sở hữu rule (null = rule dùng chung). */
async function requireManage(request: NextRequest, ruleId: string): Promise<NextResponse | null> {
  const userId = request.headers.get('x-current-user-id');
  if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  const rule = await getRuleById(ruleId);
  if (!rule) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
  if (!(await hasExpensePerm(userId, rule.company_id ?? null, 'manage'))) {
    return NextResponse.json({ error: 'Không có quyền cấu hình tại công ty này' }, { status: 403 });
  }
  return null;
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const deny = await requireManage(request, params.id);
    if (deny) return deny;
    const data = await updateRule(params.id, await request.json());
    if (!data) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('PUT /api/expense-approval-rules/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const deny = await requireManage(request, params.id);
    if (deny) return deny;
    await deleteRule(params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/expense-approval-rules/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
