import { NextRequest, NextResponse } from 'next/server';
import {
  verifyTelegramAuth,
  findUserByTelegramId,
  type TelegramAuthData,
} from '@/lib/services/telegramAuthService';
import { createSession, recordLoginHistory } from '@/lib/services/sessionService';
import { updateLastLogin } from '@/lib/services/usersService';
import { setSessionCookie } from '@/lib/authCookie';
import { getEffectiveRolePermissions, type UserModulePermissions } from '@/lib/modules';
import { normalizeRole } from '@/lib/rolePolicy';

/**
 * POST /api/auth/telegram
 * Nhận dữ liệu Telegram Login Widget → xác thực chữ ký → tìm user theo telegram_id.
 *
 * - Tìm thấy & active  → tạo session (như đăng nhập email) → trả về user + session_id.
 * - Không tìm thấy     → 403 TỪ CHỐI. Theo chính sách: chỉ Quản trị viên tối cao
 *                        (super_admin) mới gắn telegram_id cho người dùng; KHÔNG có
 *                        tự liên kết. Telegram chưa được cấp quyền thì không đăng nhập được.
 * - Tìm thấy & inactive → 403.
 */
export async function POST(request: NextRequest) {
  try {
    const data = (await request.json()) as TelegramAuthData;
    const userAgent = request.headers.get('user-agent') || '';
    const ipAddress =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      '::1';

    // 1) Xác thực chữ ký Telegram (ném lỗi nếu giả mạo/hết hạn)
    let profile;
    try {
      profile = verifyTelegramAuth(data);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Xác thực Telegram thất bại' },
        { status: 401 }
      );
    }

    // 2) Tìm user theo telegram_id
    const user = await findUserByTelegramId(profile.telegram_id);

    if (!user) {
      // Chưa được cấp quyền → TỪ CHỐI (không có tự liên kết).
      return NextResponse.json(
        {
          error:
            'Tài khoản Telegram này chưa được cấp quyền đăng nhập. Vui lòng liên hệ Quản trị viên tối cao để được gắn quyền.',
        },
        { status: 403 }
      );
    }

    if (user.status === 'inactive') {
      await recordLoginHistory(user.id, null, { userAgent, ipAddress }, false, 'Account is inactive');
      return NextResponse.json({ error: 'Tài khoản này đã bị khóa' }, { status: 403 });
    }

    // 3) Đăng nhập thành công — tạo session như luồng email/password
    const session = await createSession(user.id, { userAgent, ipAddress });
    await recordLoginHistory(user.id, session.id, { userAgent, ipAddress }, true);
    await updateLastLogin(user.id);

    const u = user as Record<string, unknown>;
    const role = normalizeRole(String(u.role ?? 'user'));
    const effectivePermissions = getEffectiveRolePermissions(
      role,
      (u.module_permissions as UserModulePermissions) ?? null
    );
    const { password: _pw, ...safeUser } = u;
    const res = NextResponse.json({
      ...safeUser,
      role,
      module_permissions: effectivePermissions,
      session_id: session.id,
    }, { status: 200 });
    const { getSecurityConfig } = await import('@/lib/services/systemSettingsService');
    const sec = await getSecurityConfig();
    return setSessionCookie(res, {
      uid: String(u.id),
      role,
      sid: String(session.id),
      name: u.name as string | undefined,
      dept: u.department_id as string | undefined,
      // KHÔNG nhúng perms — cookie >4096 bytes bị trình duyệt vứt bỏ (xem finishLogin.ts).
    }, sec.sessionDays * 86400);
  } catch (error) {
    console.error('POST /api/auth/telegram error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Đăng nhập Telegram thất bại' },
      { status: 500 }
    );
  }
}
