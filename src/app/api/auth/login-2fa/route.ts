import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail } from '@/lib/services/usersService';
import { recordLoginHistory } from '@/lib/services/sessionService';
import { buildLoginResponse } from '@/lib/auth/finishLogin';
import { consumeOtp } from '@/lib/services/otpChallengeService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/login-2fa — hoàn tất đăng nhập 2FA.
 * Xác minh lại mật khẩu + OTP (2fa_login) rồi mới tạo session. Public (chưa có phiên).
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password, otp } = await request.json().catch(() => ({}));
    const code = String(otp || '').trim();
    const userAgent = request.headers.get('user-agent') || '';
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '::1';

    if (!email || !password || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Thiếu thông tin hoặc mã OTP không hợp lệ' }, { status: 400 });
    }

    const user = await getUserByEmail(email);
    // Chỉ SSO: user thường có password local = NULL → bcrypt.compare(x, null) THROW.
    // Short-circuit để không crash 500 (tài khoản không mật khẩu local → 401 sạch).
    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
      return NextResponse.json({ error: 'Email hoặc mật khẩu không đúng' }, { status: 401 });
    }
    if (user.status === 'inactive') {
      return NextResponse.json({ error: 'Tài khoản này đã bị khóa' }, { status: 401 });
    }

    const res = await consumeOtp('2fa_login', String(user.email).toLowerCase(), code);
    if (!res.ok) {
      await recordLoginHistory(user.id, null, { userAgent, ipAddress }, false, '2FA OTP invalid');
      return NextResponse.json({ error: res.error || 'Mã OTP không đúng' }, { status: 400 });
    }

    return buildLoginResponse(user as Record<string, any>, { userAgent, ipAddress });
  } catch (err) {
    console.error('POST /api/auth/login-2fa error:', err);
    return NextResponse.json({ error: 'Đăng nhập thất bại' }, { status: 500 });
  }
}
