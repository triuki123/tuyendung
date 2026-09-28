import { NextRequest, NextResponse } from 'next/server';
import { getBmhsStatus, canManageBmhs, enableBmhs, disableBmhs } from '@/lib/services/bmhsService';

export const dynamic = 'force-dynamic';

/** GET /api/users/[id]/bmhs — trạng thái khóa + người xem có quyền quản trị BMHS không. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const status = await getBmhsStatus(params.id);
    const canManage = await canManageBmhs(userId);
    return NextResponse.json({ success: true, data: { ...status, canManage } });
  } catch (err) {
    console.error('GET bmhs status error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST /api/users/[id]/bmhs — bật khóa + đặt mật khẩu (super_admin + BMHS). */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageBmhs(userId))) return NextResponse.json({ error: 'Không có quyền BMHS' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const password = String(body.password || '');
    const confirm = String(body.confirm || '');
    if (password.length < 6) return NextResponse.json({ error: 'Mật khẩu tối thiểu 6 ký tự' }, { status: 400 });
    if (password !== confirm) return NextResponse.json({ error: 'Mật khẩu nhập lại không khớp' }, { status: 400 });

    await enableBmhs(params.id, password, userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST bmhs enable error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE /api/users/[id]/bmhs — tắt khóa (super_admin + BMHS). */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageBmhs(userId))) return NextResponse.json({ error: 'Không có quyền BMHS' }, { status: 403 });
    await disableBmhs(params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE bmhs disable error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
