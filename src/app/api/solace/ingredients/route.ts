import { NextRequest, NextResponse } from 'next/server';
import { listIngredients, createIngredient } from '@/lib/services/solaceInventoryService';
import { guardSolace } from '@/lib/solaceApiGuard';

export async function GET(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-inventory', 'view');
    if (g instanceof NextResponse) return g;
    const includeInactive = new URL(request.url).searchParams.get('all') === '1';
    const data = await listIngredients(includeInactive);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/ingredients error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-inventory', 'create');
    if (g instanceof NextResponse) return g;
    const body = await request.json();
    if (!body.name?.trim()) return NextResponse.json({ error: 'Thiếu tên nguyên liệu' }, { status: 400 });
    const data = await createIngredient({
      code: body.code, name: body.name, unit: body.unit, min_qty: body.min_qty, avg_cost: body.avg_cost,
      purchase_unit: body.purchase_unit, purchase_factor: body.purchase_factor,
    }, g.userId);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Mã nguyên liệu đã tồn tại' }, { status: 409 });
    }
    console.error('POST /api/solace/ingredients error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
