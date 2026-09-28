import { NextRequest, NextResponse } from 'next/server';
import { setSessionCookie } from '@/lib/authCookie';
import { normalizeRole } from '@/lib/rolePolicy';

export const dynamic = 'force-dynamic';

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

/**
 * Local development shortcut for the seeded administrator. This route is
 * intentionally unreachable unless an explicit local-only environment flag is set.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (
    process.env.LOCAL_DEV_BYPASS_AUTH !== 'true' ||
    !isLoopback(request.nextUrl.hostname)
  ) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const user = {
      id: process.env.LOCAL_DEV_BYPASS_AUTH_USER_ID || '00000000-0000-4000-8000-000000000001',
      role: 'super_admin', name: 'Local Development Admin', department_id: null,
    };

    // Local bypass avoids user_sessions because a partially bootstrapped local
    // database may not have the complete session schema yet.
    // Keep a focused local workspace from compiling the full operations dashboard.
    const landingPath = process.env.NEXT_PUBLIC_RECRUITMENT_FOCUS === 'true'
      ? '/nguon-nhan-luc/tinh-hinh-tuyen-dung'
      : '/dashboard';
    const requestedPath = request.nextUrl.searchParams.get('redirect');
    const safePath = requestedPath?.startsWith('/nguon-nhan-luc/')
      ? requestedPath
      : landingPath;
    const localResponse = NextResponse.redirect(new URL(safePath, request.url), { status: 302 });
    return setSessionCookie(localResponse, {
      uid: String(user.id), role: normalizeRole(user.role), sid: `local_${Date.now()}`,
      name: user.name || undefined, dept: user.department_id || undefined,
    }, 7 * 86400);

  } catch (error) {
    console.error('GET /api/auth/dev-login error:', error);
    return NextResponse.json({ error: 'Không thể tạo phiên phát triển' }, { status: 500 });
  }
}
