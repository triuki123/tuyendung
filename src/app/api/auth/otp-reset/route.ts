import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import { checkOtp, consumeOtp } from '@/lib/services/otpChallengeService';
import { deliverOtp } from '@/lib/otp/deliver';

export const dynamic = 'force-dynamic';

const PURPOSE = 'pwd_reset';

function norm(email: string): string {
  return String(email || '').trim().toLowerCase();
}

async function findUser(email: string) {
  return queryOne<{ id: string; email: string; status: string; telegram_id: string | null }>(
    `SELECT id::text AS id, email, status, telegram_id FROM users WHERE lower(email) = $1`,
    [norm(email)]
  );
}

/**
 * POST — yêu cầu đặt lại mật khẩu: gửi magic-link "Xác minh & Đăng nhập" về email.
 * KHÔNG tiết lộ email có tồn tại hay không (chống dò tài khoản) — luôn trả success.
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json().catch(() => ({}));
    const e = norm(email);
    if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
      return NextResponse.json({ error: 'Email không hợp lệ' }, { status: 400 });
    }
    const user = await findUser(e);
    // Chỉ thực sự gửi khi tài khoản tồn tại & đang hoạt động; luôn trả success (chống dò tài khoản).
    // KHÔNG trả channel để không lộ email có tồn tại hay không.
    if (user && user.status === 'active' && user.email) {
      try {
        await deliverOtp({
          purpose: PURPOSE, subjectId: e, email: user.email,
          telegramChatId: user.telegram_id, appBaseUrl: process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin,
        });
      } catch (err) { console.error('otp-reset deliver error:', err); }
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/auth/otp-reset error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PATCH — bước xác minh OTP (chưa đổi mật khẩu). */
export async function PATCH(request: NextRequest) {
  try {
    const { email, otp } = await request.json().catch(() => ({}));
    const e = norm(email);
    const code = String(otp || '').trim();
    if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: 'Mã OTP gồm 6 chữ số' }, { status: 400 });

    const res = await checkOtp(PURPOSE, e, code);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/auth/otp-reset error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT — xác minh + tiêu thụ OTP, đặt mật khẩu mới cho tài khoản. */
export async function PUT(request: NextRequest) {
  try {
    const { email, otp, password, confirm } = await request.json().catch(() => ({}));
    const e = norm(email);
    const code = String(otp || '').trim();
    const pwd = String(password || '');
    if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: 'Mã OTP gồm 6 chữ số' }, { status: 400 });
    if (pwd.length < 6) return NextResponse.json({ error: 'Mật khẩu tối thiểu 6 ký tự' }, { status: 400 });
    if (pwd !== String(confirm || '')) return NextResponse.json({ error: 'Mật khẩu nhập lại không khớp' }, { status: 400 });

    const user = await findUser(e);
    if (!user) return NextResponse.json({ error: 'Mã OTP không đúng' }, { status: 400 });

    const res = await consumeOtp(PURPOSE, e, code);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });

    const hashed = await bcrypt.hash(pwd, 10);
    await execute('UPDATE users SET password = $1, updated_at = NOW() WHERE id::text = $2', [hashed, user.id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/auth/otp-reset error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
