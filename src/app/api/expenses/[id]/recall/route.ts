import { NextRequest, NextResponse } from 'next/server';
import { recallExpense } from '@/lib/services/expenseService';
import { resolveApprovalMessages } from '@/lib/telegram/approvalMessageSync';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const res = await recallExpense(params.id, userId);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });

    await resolveApprovalMessages('expense', params.id, 'cancelled').catch(() => {});
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/expenses/[id]/recall error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
