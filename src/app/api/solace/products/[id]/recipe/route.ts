import { NextRequest, NextResponse } from 'next/server';
import { getRecipe, setRecipe } from '@/lib/services/solaceInventoryService';
import { guardSolace, requireLogin } from '@/lib/solaceApiGuard';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = requireLogin(request);
    if (auth instanceof NextResponse) return auth;
    const data = await getRecipe(params.id);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/products/[id]/recipe error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-menu', 'edit');
    if (g instanceof NextResponse) return g;
    const body = await request.json();
    const items = Array.isArray(body.items) ? body.items : [];
    await setRecipe(params.id, items);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/solace/products/[id]/recipe error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
