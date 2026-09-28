import { NextRequest, NextResponse } from 'next/server';
import { deleteById, setActive } from '@/lib/services/shortLinkService';

export const dynamic = 'force-dynamic';

/** PATCH: bật/tắt link của mình. Body { active: boolean } */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const { active } = await request.json();
    const ok = await setActive(params.id, userId, !!active);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy link' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/short-links/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE: xóa link của mình */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const ok = await deleteById(params.id, userId);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy link' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/short-links/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
