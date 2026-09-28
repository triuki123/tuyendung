import { NextRequest, NextResponse } from 'next/server';
import { getProductOptionGroupIds, setProductOptionGroups } from '@/lib/services/solaceCatalogService';
import { guardSolace, requireLogin } from '@/lib/solaceApiGuard';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = requireLogin(request);
    if (auth instanceof NextResponse) return auth;
    const data = await getProductOptionGroupIds(params.id);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/products/[id]/option-groups error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-menu', 'edit');
    if (g instanceof NextResponse) return g;
    const body = await request.json();
    const ids = Array.isArray(body.groupIds) ? body.groupIds : [];
    await setProductOptionGroups(params.id, ids);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/solace/products/[id]/option-groups error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
