import { NextRequest, NextResponse } from 'next/server';
import * as cfg from '@/lib/services/expenseConfigService';
import { hasExpensePerm } from '@/lib/services/expensePermissionService';

export const dynamic = 'force-dynamic';

/** Quyền `manage` xét theo ĐÚNG công ty sở hữu danh mục (null = danh mục dùng chung). */
async function requireManage(request: NextRequest, categoryId: string): Promise<NextResponse | null> {
  const userId = request.headers.get('x-current-user-id');
  if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  const cat = await cfg.getExpenseCategoryById(categoryId);
  if (!cat) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
  if (!(await hasExpensePerm(userId, cat.company_id ?? null, 'manage'))) {
    return NextResponse.json({ error: 'Không có quyền cấu hình tại công ty này' }, { status: 403 });
  }
  return null;
}

/** PUT — sửa loại chi phí (expense.manage tại công ty của danh mục). */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const deny = await requireManage(request, params.id);
    if (deny) return deny;
    const body = await request.json();
    const data = await cfg.updateExpenseCategory(params.id, body);
    if (!data) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('PUT /api/expense-categories/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE — xóa (đã dùng thì tắt). */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const deny = await requireManage(request, params.id);
    if (deny) return deny;
    const res = await cfg.deleteExpenseCategory(params.id);
    return NextResponse.json({ success: true, ...res });
  } catch (err) {
    console.error('DELETE /api/expense-categories/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
