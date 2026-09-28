import { NextRequest, NextResponse } from 'next/server';
import { listOrders, createOrder, getOrder, applyAvailableWalletCredit, type OrderStatus } from '@/lib/services/solaceOrderService';
import { guardSolace } from '@/lib/solaceApiGuard';
import { getDebtConfig } from '@/lib/services/solaceSettingsService';

export async function GET(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-pos', 'view');
    if (g instanceof NextResponse) return g;
    const sp = new URL(request.url).searchParams;
    const data = await listOrders({
      businessDate: sp.get('date') ?? undefined,
      status: (sp.get('status') as OrderStatus) ?? undefined,
      activeOnly: sp.get('active') === '1',
      limit: sp.get('limit') ? Number(sp.get('limit')) : undefined,
    });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/orders error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-pos', 'create');
    if (g instanceof NextResponse) return g;
    const body = await request.json();
    const paymentStatus = body.paymentStatus === 'debt' ? 'debt' : 'unpaid';
    if (paymentStatus === 'debt') {
      const debt = await getDebtConfig();
      if (!debt.enabled) {
        return NextResponse.json({ error: 'Quán hiện không cho phép mua ghi nợ' }, { status: 400 });
      }
    }
    const data = await createOrder({
      channel: 'pos',
      customer_user_id: body.customer_user_id ?? null,
      customer_name: body.customer_name ?? null,
      fulfillment_type: body.fulfillment_type === 'dine_in' ? 'dine_in' : 'counter',
      floor_note: body.floor_note ?? null,
      payment_method: body.payment_method ?? 'cash',
      paid: !!body.paid,
      paymentStatus: body.paymentStatus === 'debt' ? 'debt' : undefined,
      discount: body.discount ?? 0,
      note: body.note ?? null,
      items: Array.isArray(body.items) ? body.items : [],
    }, g.userId);
    if (body.customer_user_id && !body.paid && body.payment_method !== 'wallet') {
      await applyAvailableWalletCredit(data.id, g.userId).catch(() => {});
    }
    const finalOrder = body.customer_user_id && !body.paid && body.payment_method !== 'wallet'
      ? await getOrder(data.id)
      : data;
    return NextResponse.json({ success: true, data: finalOrder ?? data, warnings: data.warnings ?? [] }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    // Lỗi nghiệp vụ (thiếu món, hết nguyên liệu, thiếu tầng…) → 400 cho client hiển thị.
    const isBiz = err instanceof Error && !/relation|column|syntax/i.test(msg);
    if (!isBiz) console.error('POST /api/solace/orders error:', err);
    return NextResponse.json({ error: msg }, { status: isBiz ? 400 : 500 });
  }
}
