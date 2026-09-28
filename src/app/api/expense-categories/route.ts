import { NextRequest, NextResponse } from 'next/server';
import * as cfg from '@/lib/services/expenseConfigService';
import { hasExpensePerm } from '@/lib/services/expensePermissionService';

export const dynamic = 'force-dynamic';

/** GET /api/expense-categories — danh mục loại chi phí (mọi người đăng nhập; lọc theo company_id). */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const sp = request.nextUrl.searchParams;
    const data = await cfg.listExpenseCategories(sp.get('all') !== 'true', sp.get('company_id'));
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/expense-categories error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST — tạo loại chi phí (cần expense.manage). */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json();
    if (!(await hasExpensePerm(userId, body.company_id ?? null, 'manage'))) {
      return NextResponse.json({ error: 'Không có quyền cấu hình' }, { status: 403 });
    }
    if (!body.code?.trim() || !body.name?.trim()) return NextResponse.json({ error: 'Thiếu mã hoặc tên' }, { status: 400 });
    const data = await cfg.createExpenseCategory(body);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === '23505') return NextResponse.json({ error: 'Mã loại đã tồn tại' }, { status: 409 });
    console.error('POST /api/expense-categories error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
