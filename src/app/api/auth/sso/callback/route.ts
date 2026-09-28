import { NextRequest, NextResponse } from 'next/server';
import {
  SSO_STATE_COOKIE, exchangeCode, resolveSsoIdentity, decodeStateCookie, safeInternalPath,
} from '@/lib/auth/ssoClient';
import { getUserByEmailInsensitive } from '@/lib/services/usersService';
import { recordLoginHistory } from '@/lib/services/sessionService';
import { finishLoginRedirect } from '@/lib/auth/finishLogin';


// Route xác thực: KHÔNG được prerender tĩnh. Nếu env SSO thiếu lúc build, handler ném lỗi
// trước khi chạm `request` → Next nướng cứng phản hồi lỗi vào build và phục vụ mãi mãi
// (đăng nhập SSO hỏng dù runtime đã có env). force-dynamic ép chạy mỗi request.
export const dynamic = 'force-dynamic';

/**
 * OIDC callback: check state → đổi code lấy token → verify id_token → map user local
 * theo email → dựng session AssetFlow như luồng login thường (AssetFlow là master,
 * KHÔNG auto-provision user mới từ SSO).
 */
export async function GET(request: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const fail = (code: string) => {
    const res = NextResponse.redirect(new URL(`/sign-up-login-screen?error=${code}`, base));
    res.cookies.set(SSO_STATE_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  };

  try {
    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    const st = await decodeStateCookie(request.cookies.get(SSO_STATE_COOKIE)?.value);
    if (!code || !state || !st || st.state !== state) return fail('sso_failed');

    const tokens = await exchangeCode({
      code,
      verifier: st.verifier,
      redirectUri: `${base}/api/auth/sso/callback`,
    });
    const ident = await resolveSsoIdentity(tokens, st.nonce);

    const user = await getUserByEmailInsensitive(ident.email);
    const userAgent = request.headers.get('user-agent') || '';
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '::1';

    if (!user) {
      console.log(`[SSO] Login từ SSO nhưng email chưa được cấp trên AssetFlow: ${ident.email}`);
      return fail('sso_no_account');
    }
    if (user.status === 'inactive') {
      await recordLoginHistory(user.id, null, { userAgent, ipAddress }, false, 'Account is inactive (SSO)');
      return fail('sso_inactive');
    }

    const res = await finishLoginRedirect(
      user as Record<string, any>,
      { userAgent, ipAddress },
      new URL(safeInternalPath(st.redirect), base)
    );
    res.cookies.set(SSO_STATE_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  } catch (err) {
    console.error('GET /api/auth/sso/callback error:', err);
    return fail('sso_failed');
  }
}
