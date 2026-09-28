import { NextRequest, NextResponse } from 'next/server';
import { updateOptionValue, deleteOptionValue } from '@/lib/services/solaceCatalogService';
import { guardSolace } from '@/lib/solaceApiGuard';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-menu', 'edit');
    if (g instanceof NextResponse) return g;
    const body = await request.json();
    await updateOptionValue(params.id, {
      name: body.name, extra_price: body.extra_price, sort_order: body.sort_order, is_active: body.is_active,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/solace/option-values/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-menu', 'delete');
    if (g instanceof NextResponse) return g;
    await deleteOptionValue(params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/solace/option-values/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
