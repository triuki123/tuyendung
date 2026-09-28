import { NextRequest, NextResponse } from 'next/server';
import { listMyOrders, createWebOrder } from '@/lib/services/solaceCustomerOrderService';
import { requireLogin } from '@/lib/solaceApiGuard';

// Đơn của chính khách (theo dõi).
export async function GET(request: NextRequest) {
  try {
    const auth = requireLogin(request);
    if (auth instanceof NextResponse) return auth;
    const data = await listMyOrders(auth.userId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/my-orders error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

// Khách tự đặt món (webapp).
export async function POST(request: NextRequest) {
  try {
    const auth = requireLogin(request);
    if (auth instanceof NextResponse) return auth;
    const body = await request.json();
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'Giỏ hàng trống' }, { status: 400 });
    }
    const { order, warning } = await createWebOrder(auth.userId, {
      fulfillment_type: body.fulfillment_type === 'dine_in' ? 'dine_in' : 'counter',
      floor_note: body.floor_note ?? null,
      pickup_time: body.pickup_time ?? null,
      payment_method: body.payment_method ?? 'wallet',
      voucher_code: body.voucher_code ?? null,
      note: body.note ?? null,
      items: body.items,
    });
    return NextResponse.json({ success: true, data: order, warning: warning ?? null }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
