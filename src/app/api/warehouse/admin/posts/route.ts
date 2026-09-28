import { NextRequest, NextResponse } from 'next/server';
import { requireWarehouseManager } from '@/lib/warehouse/adminGuard';
import { listPosts, createPost, deletePost } from '@/lib/services/warehouseService';

export const dynamic = 'force-dynamic';

/** GET: bảng tin (?warehouseId=) */
export async function GET(request: NextRequest) {
  try {
    const warehouseId = request.nextUrl.searchParams.get('warehouseId');
    const guard = await requireWarehouseManager(request, warehouseId);
    if ('response' in guard) return guard.response;
    const rows = await listPosts(warehouseId!);
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/warehouse/admin/posts error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST: đăng tin. Body { warehouseId, title, content, pinned } */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const guard = await requireWarehouseManager(request, body.warehouseId, 'create');
    if ('response' in guard) return guard.response;
    if (!body.title) return NextResponse.json({ error: 'Nhập tiêu đề' }, { status: 400 });
    const row = await createPost(body.warehouseId, body.title, body.content || '', !!body.pinned, guard.actor.id);
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    console.error('POST /api/warehouse/admin/posts error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE: xóa tin (?warehouseId=&id=) */
export async function DELETE(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const guard = await requireWarehouseManager(request, sp.get('warehouseId'), 'delete');
    if ('response' in guard) return guard.response;
    const id = sp.get('id');
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });
    await deletePost(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/warehouse/admin/posts error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
