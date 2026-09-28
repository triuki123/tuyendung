import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import { consumeOtp } from '@/lib/services/otpChallengeService';
import { deliverOtp } from '@/lib/otp/deliver';

export const dynamic = 'force-dynamic';

const PURPOSE = '2fa_enable';

async function me(userId: string) {
  return queryOne<{ id: string; email: string | null; twofa_enabled: boolean; telegram_id: string | null }>(
    `SELECT id::text AS id, email, twofa_enabled, telegram_id FROM users WHERE id::text = $1`,
    [userId.toLowerCase()]
  );
}

/** GET — trạng thái 2FA của người dùng hiện tại. */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-current-user-id');
  if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  const u = await me(userId);
  return NextResponse.json({ success: true, data: { enabled: !!u?.twofa_enabled, hasEmail: !!u?.email } });
}

/** POST — gửi OTP magic-link để BẬT 2FA (xác nhận sở hữu email). */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const u = await me(userId);
    if (!u?.email) return NextResponse.json({ error: 'Tài khoản chưa có email để nhận mã' }, { status: 400 });

    const r = await deliverOtp({
      purpose: PURPOSE, subjectId: u.id, requestedBy: u.id, email: u.email,
      telegramChatId: u.telegram_id, appBaseUrl: process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin,
    });
    return NextResponse.json({ success: true, channel: r.channel, emailMasked: r.emailMasked });
  } catch (err) {
    console.error('POST /api/auth/2fa error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi gửi mã' }, { status: 500 });
  }
}

/** PATCH — xác nhận OTP để BẬT 2FA. */
export async function PATCH(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const otp = String(body.otp || '').trim();
    if (!/^\d{6}$/.test(otp)) return NextResponse.json({ error: 'Mã OTP gồm 6 chữ số' }, { status: 400 });

    const res = await consumeOtp(PURPOSE, userId.toLowerCase(), otp);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    await execute('UPDATE users SET twofa_enabled = true, updated_at = NOW() WHERE id::text = $1', [userId.toLowerCase()]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/auth/2fa error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE — TẮT 2FA (người dùng đang đăng nhập). */
export async function DELETE(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    await execute('UPDATE users SET twofa_enabled = false, updated_at = NOW() WHERE id::text = $1', [userId.toLowerCase()]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/auth/2fa error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
