import { NextRequest, NextResponse } from 'next/server';
import { listCategories, createCategory } from '@/lib/services/solaceCatalogService';
import { canManageSolace } from '@/lib/services/solacePermissionService';
import { guardSolace, requireLogin } from '@/lib/solaceApiGuard';

export async function GET(request: NextRequest) {
  try {
    const auth = requireLogin(request);
    if (auth instanceof NextResponse) return auth;
    // Chỉ người vận hành mới được xem cả mục đã ẩn (?all=1).
    let includeInactive = new URL(request.url).searchParams.get('all') === '1';
    if (includeInactive) includeInactive = await canManageSolace(auth.userId, 'solace-menu', 'view');
    const data = await listCategories(includeInactive);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/categories error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-menu', 'create');
    if (g instanceof NextResponse) return g;
    const body = await request.json();
    if (!body.name?.trim()) return NextResponse.json({ error: 'Thiếu tên danh mục' }, { status: 400 });
    const data = await createCategory(body.name, body.sort_order ?? 0, g.userId);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/solace/categories error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
