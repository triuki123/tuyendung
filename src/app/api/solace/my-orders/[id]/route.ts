import { NextRequest, NextResponse } from 'next/server';
import { cancelMyOrder } from '@/lib/services/solaceCustomerOrderService';
import { payOrderWithWallet } from '@/lib/services/solaceWalletService';
import { getOrder } from '@/lib/services/solaceOrderService';
import { requireLogin } from '@/lib/solaceApiGuard';

// Khách tự huỷ đơn (khi còn chờ pha) hoặc trả đơn bằng ví của chính mình.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = requireLogin(request);
    if (auth instanceof NextResponse) return auth;
    const body = await request.json().catch(() => ({}));
    if (body.action === 'cancel') {
      await cancelMyOrder(auth.userId, params.id);
    } else if (body.action === 'pay_wallet') {
      // Chỉ cho trả ví đơn của chính mình (hoặc đơn chưa gắn ai).
      const order = await getOrder(params.id);
      if (!order || (order.customer_user_id && order.customer_user_id !== auth.userId)) {
        return NextResponse.json({ error: 'Không phải đơn của bạn' }, { status: 403 });
      }
      await payOrderWithWallet(params.id, auth.userId, auth.userId);
    } else {
      return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
