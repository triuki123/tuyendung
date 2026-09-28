import bcrypt from 'bcryptjs';
import { getUserByEmail } from '@/lib/services/usersService';
import { recordLoginHistory } from '@/lib/services/sessionService';
import { NextRequest, NextResponse } from 'next/server';
import { buildLoginResponse } from '@/lib/auth/finishLogin';
import { deliverOtp } from '@/lib/otp/deliver';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    const user = await getUserByEmail(email);
    const userAgent = request.headers.get('user-agent') || '';
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '::1';

    // Chỉ SSO: user thường có password local = NULL. bcrypt.compare(x, null) sẽ THROW
    // → short-circuit trước để tài khoản không mật khẩu local rơi vào nhánh 401 sạch
    // (không crash 500). super_admin vẫn giữ hash nên qua được để dùng break-glass.
    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
      console.log(`[Login] Failed login attempt for ${email}`);
      if (user?.id) {
        await recordLoginHistory(user.id, null, { userAgent, ipAddress }, false, 'Invalid email or password');
      }
      return NextResponse.json(
        { error: 'Email hoặc mật khẩu không đúng' },
        { status: 401 }
      );
    }

    if (user.status === 'inactive') {
      console.log(`[Login] Login attempt for inactive user: ${email}`);
      await recordLoginHistory(
        user.id,
        null,
        { userAgent, ipAddress },
        false,
        'Account is inactive'
      );
      return NextResponse.json(
        { error: 'Tài khoản này đã bị khóa' },
        { status: 401 }
      );
    }

    // Chỉ SSO: đăng nhập mật khẩu chỉ còn là đường break-glass cho super_admin.
    if (user.role !== 'super_admin') {
      await recordLoginHistory(user.id, null, { userAgent, ipAddress }, false, 'Password login disabled (SSO only)');
      return NextResponse.json(
        { error: 'Đăng nhập bằng mật khẩu đã tắt — vui lòng dùng nút "Đăng nhập với FADO SSO".' },
        { status: 403 }
      );
    }

    // Xác thực hai yếu tố (2FA): mật khẩu đúng nhưng CHƯA tạo session — gửi OTP magic-link,
    // client sẽ gọi /api/auth/login-2fa với OTP để hoàn tất.
    if ((user as Record<string, unknown>).twofa_enabled) {
      const emailNorm = String(user.email).toLowerCase();
      try {
        const r = await deliverOtp({
          purpose: '2fa_login', subjectId: emailNorm, email: user.email,
          telegramChatId: (user as Record<string, unknown>).telegram_id as string | null,
          appBaseUrl: process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin,
        });
        return NextResponse.json({ twofa_required: true, channel: r.channel, emailMasked: r.emailMasked }, { status: 200 });
      } catch (e) {
        console.error('[Login] 2FA deliver error:', e);
        return NextResponse.json({ error: 'Không gửi được mã 2FA (email lỗi và chưa liên kết Telegram). Liên hệ quản trị.' }, { status: 500 });
      }
    }

    return buildLoginResponse(user as Record<string, any>, { userAgent, ipAddress });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Đăng nhập thất bại' },
      { status: 500 }
    );
  }
}
