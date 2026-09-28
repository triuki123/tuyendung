import { NextRequest, NextResponse } from 'next/server';
import { getVariantById, updateVariant, deleteVariant } from '@/lib/services/ecardService';

export const dynamic = 'force-dynamic';

function hasProfilePerm(request: NextRequest): boolean {
  const role = request.headers.get('x-current-user-role');
  if (role === 'super_admin') return true;
  try {
    const raw = request.headers.get('x-user-permissions');
    if (!raw) return false;
    const perms = JSON.parse(raw);
    const p = perms?.['ho-so-nang-luc'];
    return Array.isArray(p) && p.length > 0;
  } catch {
    return false;
  }
}

/** GET /api/ecard/variant/[id] — full data để edit. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const callerId = request.headers.get('x-current-user-id');
    if (!callerId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!hasProfilePerm(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const v = await getVariantById(params.id);
    if (!v) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: v });
  } catch (err) {
    console.error('GET /api/ecard/variant/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const callerId = request.headers.get('x-current-user-id');
    if (!callerId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!hasProfilePerm(request)) return NextResponse.json({ error: 'Không có quyền biên soạn' }, { status: 403 });
    const body = await request.json();
    const v = await updateVariant(params.id, body || {});
    return NextResponse.json({ success: true, data: v });
  } catch (err: any) {
    console.error('PUT /api/ecard/variant/[id] error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi lưu' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (role !== 'super_admin') return NextResponse.json({ error: 'Chỉ Super Admin' }, { status: 403 });
    await deleteVariant(params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/ecard/variant/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi xóa' }, { status: 500 });
  }
}
