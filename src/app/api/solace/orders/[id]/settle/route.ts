import { NextRequest, NextResponse } from 'next/server';
import { settleOrder } from '@/lib/services/solaceDebtService';
import { guardSolace } from '@/lib/solaceApiGuard';

// Trả nợ 1 đơn (từng phần/hết) bằng ví hoặc tiền mặt — người quản lý công nợ.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-debt', 'edit');
    if (g instanceof NextResponse) return g;
    const body = await request.json();
    const method = body.method === 'wallet' ? 'wallet' : 'cash';
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Số tiền không hợp lệ' }, { status: 400 });
    const data = await settleOrder(params.id, amount, method, g.userId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
