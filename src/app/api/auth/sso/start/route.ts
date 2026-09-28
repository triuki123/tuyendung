import { NextRequest, NextResponse } from 'next/server';
import {
  SSO_STATE_COOKIE, getSsoEnv, randomToken, generatePkce,
  buildAuthorizeUrl, encodeStateCookie, safeInternalPath,
} from '@/lib/auth/ssoClient';


// Route xác thực: KHÔNG được prerender tĩnh. Nếu env SSO thiếu lúc build, handler ném lỗi
// trước khi chạm `request` → Next nướng cứng phản hồi lỗi vào build và phục vụ mãi mãi
// (đăng nhập SSO hỏng dù runtime đã có env). force-dynamic ép chạy mỗi request.
export const dynamic = 'force-dynamic';

/**
 * Khởi động đăng nhập SSO: sinh PKCE + state + nonce, lưu vào cookie ký HMAC (10'),
 * redirect sang trang đăng nhập của sso.fadoai.com.
 */
export async function GET(request: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  try {
    getSsoEnv(); // fail sớm với message rõ nếu env thiếu

    // Chỉ chấp nhận đường dẫn nội bộ (chống open-redirect).
    const redirect = safeInternalPath(request.nextUrl.searchParams.get('redirect'));

    const state = randomToken(16);
    const nonce = randomToken(16);
    const { verifier, challenge } = await generatePkce();
    const redirectUri = `${base}/api/auth/sso/callback`;

    const res = NextResponse.redirect(
      buildAuthorizeUrl({ redirectUri, state, nonce, challenge })
    );
    res.cookies.set(SSO_STATE_COOKIE, await encodeStateCookie({ state, nonce, verifier, redirect }), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 600,
    });
    return res;
  } catch (err) {
    console.error('GET /api/auth/sso/start error:', err);
    return NextResponse.redirect(new URL('/sign-up-login-screen?error=sso_failed', base));
  }
}
