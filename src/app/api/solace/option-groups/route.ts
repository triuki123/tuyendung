import { NextRequest, NextResponse } from 'next/server';
import { listOptionGroups, createOptionGroup } from '@/lib/services/solaceCatalogService';
import { canManageSolace } from '@/lib/services/solacePermissionService';
import { guardSolace, requireLogin } from '@/lib/solaceApiGuard';

export async function GET(request: NextRequest) {
  try {
    const auth = requireLogin(request);
    if (auth instanceof NextResponse) return auth;
    let includeInactive = new URL(request.url).searchParams.get('all') === '1';
    if (includeInactive) includeInactive = await canManageSolace(auth.userId, 'solace-menu', 'view');
    const data = await listOptionGroups(includeInactive);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/option-groups error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-menu', 'create');
    if (g instanceof NextResponse) return g;
    const body = await request.json();
    if (!body.name?.trim()) return NextResponse.json({ error: 'Thiếu tên nhóm tuỳ chọn' }, { status: 400 });
    const data = await createOptionGroup({
      name: body.name, selection_type: body.selection_type, is_required: body.is_required, sort_order: body.sort_order,
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/solace/option-groups error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
