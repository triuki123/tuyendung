import { NextRequest, NextResponse } from 'next/server';
import { getOrder, updateOrderStatus, cancelOrder, deleteOrderHard, type OrderStatus } from '@/lib/services/solaceOrderService';
import { guardSolace } from '@/lib/solaceApiGuard';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-pos', 'view');
    if (g instanceof NextResponse) return g;
    const data = await getOrder(params.id);
    if (!data) return NextResponse.json({ error: 'Không tìm thấy đơn' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/orders/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-pos', 'edit');
    if (g instanceof NextResponse) return g;
    const body = await request.json();
    const status = body.status as OrderStatus;
    if (!['pending', 'preparing', 'ready', 'done', 'cancelled'].includes(status)) {
      return NextResponse.json({ error: 'Trạng thái không hợp lệ' }, { status: 400 });
    }
    if (status === 'cancelled') {
      await cancelOrder(params.id, g.userId, body.cancel_reason ?? null, { creditToWallet: !!body.refund_to_wallet });
    } else {
      await updateOrderStatus(params.id, status, g.userId);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/** Xoá CỨNG đơn (dọn đơn test). Chỉ Super Admin + có quyền Xóa trên solace-pos. */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-pos', 'delete');
    if (g instanceof NextResponse) return g;
    // Hành động phá huỷ → bắt buộc Super Admin (vai trò do middleware tiêm, tin cậy).
    if (request.headers.get('x-current-user-role') !== 'super_admin') {
      return NextResponse.json({ error: 'Chỉ Super Admin được xoá cứng đơn' }, { status: 403 });
    }
    await deleteOrderHard(params.id, g.userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
