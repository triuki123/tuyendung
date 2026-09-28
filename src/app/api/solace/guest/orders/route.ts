import { NextRequest, NextResponse } from 'next/server';
import { createGuestOrder } from '@/lib/services/solaceCustomerOrderService';
import { guestRateLimit, clientIp } from '@/lib/solace/guestRateLimit';

// Tạo đơn khách vãng lai (PUBLIC) — chỉ tiền mặt / VietQR, có rate-limit theo IP.
export async function POST(request: NextRequest) {
  try {
    const ip = clientIp(request.headers);
    if (!guestRateLimit(`order:${ip}`)) {
      return NextResponse.json({ error: 'Bạn đặt quá nhanh, vui lòng thử lại sau ít phút.' }, { status: 429 });
    }
    const body = await request.json().catch(() => ({}));
    const order = await createGuestOrder({
      name: String(body.name ?? ''),
      phone: body.phone ?? null,
      fulfillment_type: body.fulfillment_type === 'dine_in' ? 'dine_in' : 'counter',
      floor_note: body.floor_note ?? null,
      payment_method: body.payment_method === 'bankqr' ? 'bankqr' : 'cash',
      items: Array.isArray(body.items) ? body.items : [],
    });
    // Chỉ trả id + code để khách theo dõi trạng thái (không lộ dữ liệu nội bộ).
    return NextResponse.json({ success: true, data: { id: order.id, code: order.code } }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    const isBiz = err instanceof Error && !/relation|column|syntax/i.test(msg);
    if (!isBiz) console.error('POST /api/solace/guest/orders error:', err);
    return NextResponse.json({ error: msg }, { status: isBiz ? 400 : 500 });
  }
}
