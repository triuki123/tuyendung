import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import { sendPasswordResetEmail } from '@/lib/services/emailService';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email là bắt buộc' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Email không hợp lệ' },
        { status: 400 }
      );
    }

    // 1. Check if user exists in users table
    const user = await queryOne<{ id: string; email: string }>(
      'SELECT id, email FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (!user) {
      // For security: don't reveal if email exists
      return NextResponse.json({
        success: true,
        message: 'Nếu email tồn tại, bạn sẽ nhận được email reset'
      });
    }

    // 2. Check if there's already an active reset token for this email
    const existingToken = await queryOne<{ id: string }>(
      `SELECT id FROM password_reset_tokens
       WHERE email = LOWER($1) AND used = FALSE AND expires_at > NOW()
       LIMIT 1`,
      [email]
    );

    if (existingToken) {
      return NextResponse.json({
        success: true,
        message: 'Email reset password đã được gửi'
      });
    }

    // 3. Generate secure random token
    const token = crypto.randomBytes(32).toString('hex');
    const { getSecurityConfig } = await import('@/lib/services/systemSettingsService');
    const sec = await getSecurityConfig();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + sec.resetTokenHours); // hạn theo cấu hình (mặc định 24h)

    // 4. Store token in database
    try {
      await execute(
        `INSERT INTO password_reset_tokens (user_id, email, token, expires_at, used)
         VALUES ($1, LOWER($2), $3, $4, FALSE)`,
        [user.id, email, token, expiresAt.toISOString()]
      );
    } catch (insertErr) {
      console.error('Token insert error:', insertErr);
      return NextResponse.json(
        { error: 'Không thể tạo token reset' },
        { status: 500 }
      );
    }

    // 5. Send email with reset link
    const resetLink = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`;

    try {
      await sendPasswordResetEmail(email, resetLink);
    } catch (emailError) {
      console.error('Email send error:', emailError);
      // Clean up the token if email sending fails
      await execute(
        'DELETE FROM password_reset_tokens WHERE token = $1',
        [token]
      ).catch(() => {});

      return NextResponse.json(
        { error: 'Không thể gửi email. Vui lòng thử lại sau' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Email reset password đã được gửi'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server' },
      { status: 500 }
    );
  }
}
