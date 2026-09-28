import { NextRequest, NextResponse } from 'next/server';
import { addOptionValue } from '@/lib/services/solaceCatalogService';
import { guardSolace } from '@/lib/solaceApiGuard';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-menu', 'edit');
    if (g instanceof NextResponse) return g;
    const body = await request.json();
    if (!body.name?.trim()) return NextResponse.json({ error: 'Thiếu tên tuỳ chọn' }, { status: 400 });
    const data = await addOptionValue(params.id, {
      name: body.name, extra_price: body.extra_price ?? 0, sort_order: body.sort_order ?? 0,
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/solace/option-groups/[id]/values error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
