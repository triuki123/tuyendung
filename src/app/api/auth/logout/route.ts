import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/authCookie';
import { logoutSessionForUser } from '@/lib/services/sessionService';

/**
 * POST /api/auth/logout
 * Xoá cookie phiên (httpOnly) — client không tự xoá được cookie này.
 * Client vẫn tự dọn localStorage qua authStore.logout().
 */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-current-user-id');
  const sessionId = request.headers.get('x-session-id');
  if (userId && sessionId) {
    await logoutSessionForUser(sessionId, userId).catch((error) => {
      console.error('Logout session revoke error:', error);
    });
  }
  const res = NextResponse.json({ success: true });
  return clearSessionCookie(res);
}
