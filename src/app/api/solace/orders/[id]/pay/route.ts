import { NextRequest, NextResponse } from 'next/server';
import { markOrderPaid, type PaymentMethod } from '@/lib/services/solaceOrderService';
import { payOrderWithWallet } from '@/lib/services/solaceWalletService';
import { guardSolace } from '@/lib/solaceApiGuard';

// Thu tiền đơn: tiền mặt / ví tín dụng / xác nhận đã nhận chuyển khoản (VietQR).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-pos', 'edit');
    if (g instanceof NextResponse) return g;
    const body = await request.json().catch(() => ({}));
    const method = (body.method ?? 'cash') as PaymentMethod;
    if (!['cash', 'wallet', 'bankqr'].includes(method)) {
      return NextResponse.json({ error: 'Phương thức không hợp lệ' }, { status: 400 });
    }
    if (method === 'wallet') {
      await payOrderWithWallet(params.id, body.customer_user_id ?? null, g.userId);
    } else {
      // cash hoặc bankqr (nhân viên đã xác nhận nhận tiền/chuyển khoản)
      await markOrderPaid(params.id, method, g.userId);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
