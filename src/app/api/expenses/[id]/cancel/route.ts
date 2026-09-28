import { NextRequest, NextResponse } from 'next/server';
import { cancelExpense } from '@/lib/services/expenseService';

export const dynamic = 'force-dynamic';

/** POST /api/expenses/[id]/cancel — hủy phiếu đã duyệt trước khi bàn giao Kế toán (11.5). */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const res = await cancelExpense(params.id, userId, String(body.reason || ''));
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/expenses/[id]/cancel error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
