import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { token, newPassword, confirmPassword } = await request.json();

    // Validate input
    if (!token || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { error: 'Tất cả trường là bắt buộc' },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: 'Mật khẩu không khớp' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Mật khẩu phải có ít nhất 6 ký tự' },
        { status: 400 }
      );
    }

    // 1. Verify token exists, is not expired, and not used
    const resetToken = await queryOne<{
      id: string;
      user_id: string;
      email: string;
      expires_at: string;
    }>(
      `SELECT id, user_id, email, expires_at
       FROM password_reset_tokens
       WHERE token = $1 AND used = FALSE`,
      [token]
    );

    if (!resetToken) {
      return NextResponse.json(
        { error: 'Token không hợp lệ' },
        { status: 400 }
      );
    }

    // 2. Check token expiry
    const tokenExpiresAt = new Date(resetToken.expires_at);
    if (tokenExpiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Token đã hết hạn. Vui lòng yêu cầu reset mới' },
        { status: 400 }
      );
    }

    // 3. Hash the new password and update the users table.
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updated = await execute(
      'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, resetToken.user_id]
    );

    if (updated === 0) {
      console.error('Password update affected 0 rows, user_id:', resetToken.user_id);
      return NextResponse.json(
        { error: 'Không thể cập nhật mật khẩu' },
        { status: 500 }
      );
    }

    // 4. Mark this token as used to prevent reuse
    await execute(
      'UPDATE password_reset_tokens SET used = TRUE WHERE id = $1',
      [resetToken.id]
    ).catch((err) => {
      // Non-fatal: password is already updated; log and continue
      console.warn('Warning - mark token used error:', err.message);
    });

    // 5. Invalidate all other reset tokens for this user
    await execute(
      'UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND id <> $2',
      [resetToken.user_id, resetToken.id]
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      message: 'Mật khẩu đã được cập nhật thành công. Vui lòng đăng nhập với mật khẩu mới.'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server' },
      { status: 500 }
    );
  }
}
