import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { execute, queryOne } from '@/lib/db';
import { getActor } from '@/lib/apiAuth';

/**
 * POST /api/auth/admin-reset-password
 * Super Admin / Admin reset password của user khác (không cần old password)
 *
 * Body:
 * {
 *   "user_id": "uuid-của-user-cần-reset",
 *   "new_password": "mật-khẩu-mới"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Check permission
    const actor = await getActor(request);
    const role = actor?.role;
    const adminId = actor?.id;

    if (!adminId) {
      return NextResponse.json({ error: 'Vui lòng đăng nhập' }, { status: 401 });
    }

    if (role !== 'super_admin' && role !== 'admin') {
      return NextResponse.json({ error: 'Chỉ Admin mới có quyền reset password' }, { status: 403 });
    }

    const { user_id, new_password } = await request.json();

    if (!user_id || !new_password) {
      return NextResponse.json(
        { error: 'Thiếu user_id hoặc new_password' },
        { status: 400 }
      );
    }

    if (new_password.length < 8) {
      return NextResponse.json(
        { error: 'Mật khẩu phải có ít nhất 8 ký tự' },
        { status: 400 }
      );
    }

    // Check user tồn tại
    const user = await queryOne<{ id: string; name: string }>(
      `SELECT id, name FROM users WHERE id = $1`,
      [user_id]
    );

    if (!user) {
      return NextResponse.json({ error: 'Người dùng không tồn tại' }, { status: 404 });
    }

    // Hash password mới
    const hashedPassword = await bcrypt.hash(new_password, 10);

    // Update password
    await execute(
      `UPDATE users SET password = $1, updated_at = $2, updated_by = $3 WHERE id = $4`,
      [hashedPassword, new Date().toISOString(), adminId, user_id]
    );

    // Add audit log
    await execute(
      `INSERT INTO audit_logs ("userId", action, description, "performedBy", timestamp)
       VALUES ($1, $2, $3, $4, $5)`,
      [user_id, 'ADMIN_RESET_PASSWORD', `Password reset by ${role} ${adminId}`, adminId, new Date().toISOString()]
    ).catch(() => {
      // Ignore audit log error
    });

    console.log(`[Admin Reset Password] ${role} ${adminId} reset password for ${user.name} (${user_id})`);

    return NextResponse.json({
      success: true,
      message: `Đặt lại mật khẩu cho ${user.name} thành công`,
      data: { user_id, user_name: user.name },
    });
  } catch (error) {
    console.error('Admin reset password error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server' },
      { status: 500 }
    );
  }
}
