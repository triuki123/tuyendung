import { NextRequest, NextResponse } from 'next/server';
import { listMovements, recordMovement } from '@/lib/services/solaceInventoryService';
import { postCashTxn } from '@/lib/services/solaceCashService';
import { guardSolace } from '@/lib/solaceApiGuard';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-inventory', 'view');
    if (g instanceof NextResponse) return g;
    const limit = Number(new URL(request.url).searchParams.get('limit') ?? '50');
    const data = await listMovements(params.id, Math.min(Math.max(limit, 1), 200));
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/ingredients/[id]/stock error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-inventory', 'edit');
    if (g instanceof NextResponse) return g;
    const body = await request.json();
    const type = body.type as 'in' | 'out' | 'adjust' | 'waste';
    if (!['in', 'out', 'adjust', 'waste'].includes(type)) {
      return NextResponse.json({ error: 'Loại biến động không hợp lệ' }, { status: 400 });
    }
    let qty = Number(body.qty);
    if (!Number.isFinite(qty) || qty === 0) return NextResponse.json({ error: 'Số lượng không hợp lệ' }, { status: 400 });
    // Quy ước dấu: nhập = dương, xuất/hao hụt = âm, điều chỉnh giữ nguyên dấu nhập vào.
    if (type === 'out' || type === 'waste') qty = -Math.abs(qty);
    if (type === 'in') qty = Math.abs(qty);

    const data = await recordMovement({
      ingredientId: params.id, type, qty,
      unitCost: body.unit_cost != null ? Number(body.unit_cost) : undefined,
      reason: body.reason ?? (type === 'in' ? 'purchase' : type === 'adjust' ? 'stocktake' : null),
      note: body.note ?? null, performedBy: g.userId,
    });

    // Sổ Quỹ: nhập kho có CHI TIỀN (chọn quỹ) → ghi khoản chi mua nguyên liệu.
    if (type === 'in' && (body.pay_account === 'cash' || body.pay_account === 'bank') && body.unit_cost != null) {
      const spend = Math.round(Math.abs(qty) * Number(body.unit_cost));
      await postCashTxn({
        account: body.pay_account, direction: 'out', amount: spend, category: 'purchase',
        refType: 'ingredient', refId: params.id, note: body.note || 'Mua nguyên liệu', actor: g.userId,
      }).catch(() => {});
    }
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/solace/ingredients/[id]/stock error:', err);
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
