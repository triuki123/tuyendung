import { NextRequest, NextResponse } from 'next/server';
import { requireWarehouseManager, requireWarehouseConfigurer } from '@/lib/warehouse/adminGuard';
import { listProducts, createProduct, updateProduct } from '@/lib/services/warehouseOutputService';

export const dynamic = 'force-dynamic';

/** GET: danh sách sản phẩm/công đoạn (?warehouseId=&all=1) */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const warehouseId = sp.get('warehouseId');
    const guard = await requireWarehouseManager(request, warehouseId);
    if ('response' in guard) return guard.response;
    const rows = await listProducts(warehouseId!, sp.get('all') === '1');
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/warehouse/admin/products error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST: tạo sản phẩm. Body { warehouseId, name, unit } */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const guard = await requireWarehouseConfigurer(request, body.warehouseId, 'create');
    if ('response' in guard) return guard.response;
    if (!body.name) return NextResponse.json({ error: 'Nhập tên sản phẩm' }, { status: 400 });
    const row = await createProduct(body.warehouseId, String(body.name).trim(), body.unit || 'cái');
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    console.error('POST /api/warehouse/admin/products error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT: sửa/ẩn sản phẩm. Body { warehouseId, id, name?, unit?, active? } */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const guard = await requireWarehouseConfigurer(request, body.warehouseId, 'edit');
    if ('response' in guard) return guard.response;
    await updateProduct(body.id, body);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/warehouse/admin/products error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
