/**
 * GET /api/users/[id]/companies
 * Danh sách công ty của 1 user (công ty chính + các công ty phụ) — dùng cho
 * company switcher trên Topbar và khi đăng nhập.
 *
 * PUT /api/users/[id]/companies
 * Thay thế toàn bộ công ty phụ (chỉ super_admin). Body: { memberships: [...] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getUserMemberships, setMemberships } from '@/lib/services/userCompanyService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    const memberships = await getUserMemberships(id);
    return NextResponse.json({ success: true, data: memberships });
  } catch (error) {
    console.error('GET /api/users/[id]/companies error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'User ID required' }, { status: 400 });

    const currentUserId = request.headers.get('x-current-user-id');
    if (!currentUserId) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    }
    const actor = await queryOne<{ role: string }>(
      `SELECT role FROM users WHERE id = $1`,
      [currentUserId]
    );
    if (actor?.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Chỉ Super Admin được cấu hình Đa Công Ty' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const memberships = Array.isArray(body.memberships) ? body.memberships : [];
    await setMemberships(id, memberships);
    const data = await getUserMemberships(id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('PUT /api/users/[id]/companies error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server' },
      { status: 500 }
    );
  }
}
