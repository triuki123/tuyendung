import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { hardDeleteUser, addAuditLog } from '@/lib/services/usersService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/users/[id]/hard-delete — XOÁ CỨNG tài khoản (không hồi phục).
 * Yêu cầu: actor là admin/super_admin + nhập đúng mật khẩu xoá cứng (env HARD_DELETE_PASSWORD).
 * Body: { password: string }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Thiếu ID người dùng' }, { status: 400 });

    const actorId = request.headers.get('x-current-user-id');
    if (!actorId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (actorId === id) return NextResponse.json({ error: 'Không thể tự xoá tài khoản của chính mình' }, { status: 400 });

    // Quyền: chỉ admin/super_admin
    const actor = await queryOne<{ role: string }>(`SELECT role FROM users WHERE id::text = $1`, [actorId]);
    const role = actor?.role ?? 'user';
    if (role !== 'super_admin' && role !== 'admin') {
      return NextResponse.json({ error: 'Bạn không có quyền xoá cứng tài khoản' }, { status: 403 });
    }

    // Mật khẩu xoá cứng — cấu hình ở env, verify hoàn toàn server-side
    const expected = process.env.HARD_DELETE_PASSWORD;
    if (!expected) {
      return NextResponse.json({ error: 'Tính năng chưa được cấu hình (thiếu HARD_DELETE_PASSWORD)' }, { status: 500 });
    }
    const body = await request.json().catch(() => ({}));
    const password = typeof body?.password === 'string' ? body.password : '';
    if (password !== expected) {
      return NextResponse.json({ error: 'Mật khẩu không đúng' }, { status: 403 });
    }

    // Lấy tên trước khi xoá (cho audit)
    const target = await queryOne<{ name: string; email: string }>(
      `SELECT name, email FROM users WHERE id::text = $1`, [id]
    );
    if (!target) return NextResponse.json({ error: 'Không tìm thấy người dùng' }, { status: 404 });

    const ok = await hardDeleteUser(id);
    if (!ok) return NextResponse.json({ error: 'Không xoá được người dùng' }, { status: 500 });

    // Ghi audit (actor là người xoá). addAuditLog yêu cầu performedBy hợp lệ.
    await addAuditLog('HARD_DELETE', actorId, `Xoá cứng tài khoản: ${target.name} (${target.email})`, actorId).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('POST /api/users/[id]/hard-delete error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 500 });
  }
}
