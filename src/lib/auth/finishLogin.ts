import { NextResponse } from 'next/server';
import { createSession, recordLoginHistory } from '@/lib/services/sessionService';
import { updateLastLogin } from '@/lib/services/usersService';
import { setSessionCookie } from '@/lib/authCookie';
import { getEffectiveRolePermissions } from '@/lib/modules';
import { normalizeRole } from '@/lib/rolePolicy';

interface LoginCtx { userAgent: string; ipAddress: string }

/** Phần dùng chung: tạo session DB + ghi lịch sử + last_login + hạn cookie theo cấu hình. */
async function establishSession(user: Record<string, any>, ctx: LoginCtx) {
  const session = await createSession(user.id, ctx);
  await recordLoginHistory(user.id, session.id, ctx, true);
  await updateLastLogin(user.id);
  const role = normalizeRole(user.role);
  const { getSecurityConfig } = await import('@/lib/services/systemSettingsService');
  const sec = await getSecurityConfig();
  return { session, role, maxAgeSeconds: sec.sessionDays * 86400 };
}

/**
 * Hoàn tất đăng nhập: tạo session, ghi lịch sử, set cookie phiên đã ký.
 * Dùng chung cho /api/auth/login (không 2FA) và /api/auth/login-2fa (sau khi qua OTP).
 */
export async function buildLoginResponse(
  user: Record<string, any>,
  ctx: LoginCtx
): Promise<NextResponse> {
  const { session, role, maxAgeSeconds } = await establishSession(user, ctx);
  const effectivePermissions = getEffectiveRolePermissions(role, user.module_permissions);
  const { password: _pw, ...safeUser } = user;
  const res = NextResponse.json(
    { ...safeUser, role, module_permissions: effectivePermissions, session_id: session.id },
    { status: 200 }
  );
  return setSessionCookie(res, {
    uid: String(user.id),
    role,
    sid: String(session.id),
    name: user.name as string | undefined,
    dept: user.department_id as string | undefined,
    // KHÔNG nhúng perms vào cookie: 63 module làm cookie vượt 4096 bytes → trình duyệt
    // âm thầm vứt bỏ, toàn bộ đăng nhập sập. Middleware luôn lấy quyền tươi từ DB
    // qua /api/internal/session/validate rồi ghi đè, nên perms trong cookie là thừa.
  }, maxAgeSeconds);
}

/**
 * Biến thể cho SSO callback: cùng logic dựng session nhưng trả 302 redirect
 * (browser đang ở giữa vòng OIDC redirect, không nhận JSON).
 */
export async function finishLoginRedirect(
  user: Record<string, any>,
  ctx: LoginCtx,
  redirectUrl: URL
): Promise<NextResponse> {
  const { session, role, maxAgeSeconds } = await establishSession(user, ctx);
  const res = NextResponse.redirect(redirectUrl, { status: 302 });
  return setSessionCookie(res, {
    uid: String(user.id),
    role,
    sid: String(session.id),
    name: user.name as string | undefined,
    dept: user.department_id as string | undefined,
  }, maxAgeSeconds);
}
