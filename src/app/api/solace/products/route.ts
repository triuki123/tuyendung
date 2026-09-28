import { NextRequest, NextResponse } from 'next/server';
import { listProducts, createProduct } from '@/lib/services/solaceCatalogService';
import { canManageSolace } from '@/lib/services/solacePermissionService';
import { guardSolace, requireLogin } from '@/lib/solaceApiGuard';

export async function GET(request: NextRequest) {
  try {
    const auth = requireLogin(request);
    if (auth instanceof NextResponse) return auth;
    let includeInactive = new URL(request.url).searchParams.get('all') === '1';
    if (includeInactive) includeInactive = await canManageSolace(auth.userId, 'solace-menu', 'view');
    const data = await listProducts(includeInactive);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/products error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-menu', 'create');
    if (g instanceof NextResponse) return g;
    const body = await request.json();
    if (!body.name?.trim()) return NextResponse.json({ error: 'Thiếu tên món' }, { status: 400 });
    const data = await createProduct({
      code: body.code, category_id: body.category_id, name: body.name, description: body.description,
      price: body.price ?? 0, track_recipe: body.track_recipe, is_active: body.is_active, sort_order: body.sort_order,
    }, g.userId);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Mã món đã tồn tại' }, { status: 409 });
    }
    console.error('POST /api/solace/products error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
