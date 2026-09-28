import { NextRequest, NextResponse } from 'next/server';
import { listMyUnpaidOrders } from '@/lib/services/solaceCustomerOrderService';
import { requireLogin } from '@/lib/solaceApiGuard';

// Đơn chưa thanh toán của khách (để trả bằng ví / quét QR quán).
export async function GET(request: NextRequest) {
  try {
    const auth = requireLogin(request);
    if (auth instanceof NextResponse) return auth;
    const data = await listMyUnpaidOrders(auth.userId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/my-orders/unpaid error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
