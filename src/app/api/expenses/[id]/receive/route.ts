import { NextRequest, NextResponse } from 'next/server';
import { receiveAssets, getExpenseById } from '@/lib/services/expenseService';
import { hasExpensePerm } from '@/lib/services/expensePermissionService';

export const dynamic = 'force-dynamic';

/** POST /api/expenses/[id]/receive — NHẬN HÀNG: tài sản treo của phiếu → đưa vào sử dụng. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const e = await getExpenseById(params.id);
    if (!e) return NextResponse.json({ error: 'Không tìm thấy phiếu' }, { status: 404 });
    const isCreator = e.requested_by.toLowerCase() === userId.toLowerCase();
    if (!isCreator && !(await hasExpensePerm(userId, e.company_id, 'view'))) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    const res = await receiveAssets(params.id, userId);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ success: true, count: res.count });
  } catch (err) {
    console.error('POST /api/expenses/[id]/receive error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
