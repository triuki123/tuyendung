import { NextRequest, NextResponse } from 'next/server';
import { getOrderEvents } from '@/lib/services/solaceOrderService';
import { guardSolace } from '@/lib/solaceApiGuard';

// Lịch sử thao tác của 1 đơn (audit): ai làm gì, lúc nào.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-pos', 'view');
    if (g instanceof NextResponse) return g;
    const data = await getOrderEvents(params.id);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/orders/[id]/events error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
