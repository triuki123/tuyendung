import { NextRequest, NextResponse } from 'next/server';
import { getProduct, updateProduct, deleteProduct } from '@/lib/services/solaceCatalogService';
import { guardSolace, requireLogin } from '@/lib/solaceApiGuard';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = requireLogin(request);
    if (auth instanceof NextResponse) return auth;
    const data = await getProduct(params.id);
    if (!data) return NextResponse.json({ error: 'Không tìm thấy món' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/products/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-menu', 'edit');
    if (g instanceof NextResponse) return g;
    const body = await request.json();
    await updateProduct(params.id, {
      code: body.code, category_id: body.category_id, name: body.name, description: body.description,
      price: body.price, track_recipe: body.track_recipe, is_active: body.is_active, sort_order: body.sort_order,
    }, g.userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Mã món đã tồn tại' }, { status: 409 });
    }
    console.error('PUT /api/solace/products/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-menu', 'delete');
    if (g instanceof NextResponse) return g;
    await deleteProduct(params.id, g.userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/solace/products/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
