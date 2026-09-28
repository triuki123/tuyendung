import { NextRequest, NextResponse } from 'next/server';
import { editOrderItems, type OrderItemInput } from '@/lib/services/solaceOrderService';
import { guardSolace } from '@/lib/solaceApiGuard';

// Sửa MÓN của đơn chưa thu (thay toàn bộ danh sách) — reconcile kho + tính lại tiền.
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-pos', 'edit');
    if (g instanceof NextResponse) return g;
    const body = await request.json().catch(() => ({}));
    const items: OrderItemInput[] = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) return NextResponse.json({ error: 'Đơn phải còn ít nhất 1 món' }, { status: 400 });
    const data = await editOrderItems(params.id, items, g.userId);
    return NextResponse.json({ success: true, data, warnings: data.warnings ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    const isBiz = err instanceof Error && !/relation|column|syntax/i.test(msg);
    if (!isBiz) console.error('PUT /api/solace/orders/[id]/items error:', err);
    return NextResponse.json({ error: msg }, { status: isBiz ? 400 : 500 });
  }
}
