import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

import {
  resetLockPassword, getLockStatus, canManageLegalLock, type LegalLockEntity,
} from '@/lib/legal/legalLockService';
import { checkOtp, consumeOtp } from '@/lib/services/otpChallengeService';
import { deliverOtp } from '@/lib/otp/deliver';
import { logLegalRecord } from '@/lib/services/legalAuditService';

export const dynamic = 'force-dynamic';

/**
 * Reset mật khẩu khóa Pháp Chế qua OTP magic-link — copy khuôn bmhs/reset (3 bước):
 * POST gửi link về email super_admin đang đăng nhập → PATCH kiểm OTP → PUT tiêu thụ + đặt mới.
 * subjectId của OTP = "legal:<type>:<id>" (phân biệt với reset BMHS nhân sự qua purpose riêng).
 */
const PURPOSE = 'legal_bmhs_reset';

function parseBody(body: any): { entityType: LegalLockEntity; entityId: string } | null {
  if (!['document', 'contract'].includes(body?.entityType) || !body?.entityId) return null;
  return { entityType: body.entityType, entityId: String(body.entityId) };
}

const subjectOf = (e: { entityType: string; entityId: string }) => `legal:${e.entityType}:${e.entityId}`;

/** POST — gửi magic-link. Body { entityType, entityId }. */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageLegalLock(userId))) return NextResponse.json({ error: 'Cần quyền "Đặt khóa" của Pháp Chế (hoặc quản trị BMHS)' }, { status: 403 });

    const e = parseBody(await request.json().catch(() => ({})));
    if (!e) return NextResponse.json({ error: 'Thiếu entityType/entityId' }, { status: 400 });
    const status = await getLockStatus(e.entityType, e.entityId);
    if (!status.locked) return NextResponse.json({ error: 'Bản ghi này không có khóa để reset' }, { status: 400 });

    const meRow = await queryOne<{ email: string | null; telegram_id: string | null }>(
      `SELECT email, telegram_id FROM users WHERE id::text = $1`, [userId.toLowerCase()]
    );
    if (!meRow?.email) return NextResponse.json({ error: 'Tài khoản của bạn chưa có email để nhận mã' }, { status: 400 });

    const r = await deliverOtp({
      purpose: PURPOSE, subjectId: subjectOf(e), requestedBy: userId, email: meRow.email,
      telegramChatId: meRow.telegram_id, appBaseUrl: process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin,
    });
    return NextResponse.json({ success: true, channel: r.channel, emailMasked: r.emailMasked });
  } catch (err) {
    console.error('POST legal lock reset link error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi gửi mã' }, { status: 500 });
  }
}

/** PATCH — kiểm OTP đúng/sai (chưa đổi). Body { entityType, entityId, otp }. */
export async function PATCH(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageLegalLock(userId))) return NextResponse.json({ error: 'Cần quyền "Đặt khóa" của Pháp Chế (hoặc quản trị BMHS)' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const e = parseBody(body);
    if (!e) return NextResponse.json({ error: 'Thiếu entityType/entityId' }, { status: 400 });
    const otp = String(body.otp || '').trim();
    if (!/^\d{6}$/.test(otp)) return NextResponse.json({ error: 'Mã OTP gồm 6 chữ số' }, { status: 400 });

    const res = await checkOtp(PURPOSE, subjectOf(e), otp);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH legal lock reset check-otp error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT — tiêu thụ OTP + đặt mật khẩu mới. Body { entityType, entityId, otp, password, confirm }. */
export async function PUT(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageLegalLock(userId))) return NextResponse.json({ error: 'Cần quyền "Đặt khóa" của Pháp Chế (hoặc quản trị BMHS)' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const e = parseBody(body);
    if (!e) return NextResponse.json({ error: 'Thiếu entityType/entityId' }, { status: 400 });
    const otp = String(body.otp || '').trim();
    const password = String(body.password || '');
    const confirm = String(body.confirm || '');
    if (!/^\d{6}$/.test(otp)) return NextResponse.json({ error: 'Mã OTP gồm 6 chữ số' }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ error: 'Mật khẩu tối thiểu 6 ký tự' }, { status: 400 });
    if (password !== confirm) return NextResponse.json({ error: 'Mật khẩu nhập lại không khớp' }, { status: 400 });

    const res = await consumeOtp(PURPOSE, subjectOf(e), otp);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });

    await resetLockPassword(e.entityType, e.entityId, password, userId);
    await logLegalRecord({
      entityType: e.entityType, entityId: e.entityId, action: 'lock',
      details: 'Reset mật khẩu khóa BMHS qua OTP', performedBy: userId,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT legal lock reset confirm error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
