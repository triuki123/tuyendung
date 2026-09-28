import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { valid: false, error: 'Token không được cung cấp' },
        { status: 400 }
      );
    }

    // Query token from database
    const resetToken = await queryOne<{
      id: string;
      email: string;
      expires_at: string;
    }>(
      `SELECT id, email, expires_at
       FROM password_reset_tokens
       WHERE token = $1 AND used = FALSE`,
      [token]
    );

    if (!resetToken) {
      return NextResponse.json({
        valid: false,
        error: 'Token không hợp lệ'
      });
    }

    // Check if token has expired
    const tokenExpiresAt = new Date(resetToken.expires_at);
    if (tokenExpiresAt < new Date()) {
      return NextResponse.json({
        valid: false,
        error: 'Token đã hết hạn'
      });
    }

    return NextResponse.json({
      valid: true,
      email: resetToken.email,
      expiresAt: resetToken.expires_at
    });

  } catch (error) {
    console.error('Verify token error:', error);
    return NextResponse.json(
      { valid: false, error: 'Lỗi server' },
      { status: 500 }
    );
  }
}
