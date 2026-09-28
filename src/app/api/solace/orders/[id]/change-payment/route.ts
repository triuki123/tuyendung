import { NextRequest, NextResponse } from 'next/server';
import { changeOrderPayment, type PaymentForm } from '@/lib/services/solaceOrderService';
import { guardSolace } from '@/lib/solaceApiGuard';

// Đổi hình thức thanh toán của đơn (đã thu/chưa thu) — đồng bộ Sổ Quỹ + ví.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-pos', 'edit');
    if (g instanceof NextResponse) return g;
    const body = await request.json().catch(() => ({}));
    const target = body.method as PaymentForm;
    if (!['cash', 'bankqr', 'wallet', 'debt'].includes(target)) {
      return NextResponse.json({ error: 'Hình thức không hợp lệ' }, { status: 400 });
    }
    await changeOrderPayment(params.id, target, { memberId: body.customer_user_id ?? null, actor: g.userId });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
