import { NextRequest, NextResponse } from 'next/server';
import { getIngredient, updateIngredient, deleteIngredient } from '@/lib/services/solaceInventoryService';
import { guardSolace } from '@/lib/solaceApiGuard';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-inventory', 'view');
    if (g instanceof NextResponse) return g;
    const data = await getIngredient(params.id);
    if (!data) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/ingredients/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-inventory', 'edit');
    if (g instanceof NextResponse) return g;
    const body = await request.json();
    await updateIngredient(params.id, {
      code: body.code, name: body.name, unit: body.unit, min_qty: body.min_qty,
      avg_cost: body.avg_cost, is_active: body.is_active,
      purchase_unit: body.purchase_unit, purchase_factor: body.purchase_factor,
    }, g.userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Mã nguyên liệu đã tồn tại' }, { status: 409 });
    }
    console.error('PUT /api/solace/ingredients/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-inventory', 'delete');
    if (g instanceof NextResponse) return g;
    await deleteIngredient(params.id, g.userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/solace/ingredients/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
