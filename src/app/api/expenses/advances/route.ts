import { NextRequest, NextResponse } from 'next/server';
import { listMyUnsettledAdvances } from '@/lib/services/expenseService';

export const dynamic = 'force-dynamic';

/** GET /api/expenses/advances — phiếu tạm ứng CỦA TÔI đã duyệt, chưa quyết toán (cho picker). */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const companyId = request.nextUrl.searchParams.get('company_id');
    const data = await listMyUnsettledAdvances(userId, companyId);
    return NextResponse.json({
      success: true,
      data: data.map((e) => ({ id: e.id, code: e.code, title: e.title, amount: e.amount, company_id: e.company_id, settlement_status: e.settlement_status })),
    });
  } catch (err) {
    console.error('GET /api/expenses/advances error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
