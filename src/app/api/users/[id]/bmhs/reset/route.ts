import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { canManageBmhs, enableBmhs } from '@/lib/services/bmhsService';
import { checkOtp, consumeOtp } from '@/lib/services/otpChallengeService';
import { deliverOtp } from '@/lib/otp/deliver';

export const dynamic = 'force-dynamic';

const PURPOSE = 'bmhs_reset';

/**
 * POST — gửi magic-link "Xác minh & Đăng nhập" về email super_admin đang đăng nhập.
 * Bấm link → trang /otp lộ mã OTP để nhập lại. Chỉ super_admin + BMHS gọi được (403).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageBmhs(userId))) return NextResponse.json({ error: 'Không có quyền BMHS' }, { status: 403 });

    const meRow = await queryOne<{ email: string | null; telegram_id: string | null }>(`SELECT email, telegram_id FROM users WHERE id::text = $1`, [userId.toLowerCase()]);
    if (!meRow?.email) return NextResponse.json({ error: 'Tài khoản của bạn chưa có email để nhận mã' }, { status: 400 });

    const r = await deliverOtp({
      purpose: PURPOSE, subjectId: params.id, requestedBy: userId, email: meRow.email,
      telegramChatId: meRow.telegram_id, appBaseUrl: process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin,
    });
    return NextResponse.json({ success: true, channel: r.channel, emailMasked: r.emailMasked });
  } catch (err) {
    console.error('POST bmhs reset link error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi gửi mã' }, { status: 500 });
  }
}

/** PATCH — bước 1: chỉ kiểm OTP đúng hay không (chưa đổi mật khẩu). */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageBmhs(userId))) return NextResponse.json({ error: 'Không có quyền BMHS' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const otp = String(body.otp || '').trim();
    if (!/^\d{6}$/.test(otp)) return NextResponse.json({ error: 'Mã OTP gồm 6 chữ số' }, { status: 400 });

    const res = await checkOtp(PURPOSE, params.id, otp);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH bmhs reset check-otp error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT — bước 2: xác minh + tiêu thụ OTP, rồi đặt mật khẩu mới (super_admin + BMHS). */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageBmhs(userId))) return NextResponse.json({ error: 'Không có quyền BMHS' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const otp = String(body.otp || '').trim();
    const password = String(body.password || '');
    const confirm = String(body.confirm || '');
    if (!/^\d{6}$/.test(otp)) return NextResponse.json({ error: 'Mã OTP gồm 6 chữ số' }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ error: 'Mật khẩu tối thiểu 6 ký tự' }, { status: 400 });
    if (password !== confirm) return NextResponse.json({ error: 'Mật khẩu nhập lại không khớp' }, { status: 400 });

    const res = await consumeOtp(PURPOSE, params.id, otp);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    await enableBmhs(params.id, password, userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT bmhs reset confirm error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
