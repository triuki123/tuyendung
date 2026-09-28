import { NextRequest, NextResponse } from 'next/server';
import { logoutSessionForUser } from '@/lib/services/sessionService';

/**
 * POST /api/auth/sessions/[id]/logout
 * Logout a specific session (mark as expired)
 * Requires x-user-id header for authorization
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const userId = request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }

    console.log('[Sessions API] Logging out session:', sessionId, 'for user:', userId);

    const loggedOut = await logoutSessionForUser(sessionId, userId);
    if (!loggedOut) {
      return NextResponse.json(
        { error: 'Không tìm thấy phiên đăng nhập thuộc tài khoản này' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Session logged out successfully',
    });
  } catch (error) {
    console.error('Session logout error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to logout session' },
      { status: 500 }
    );
  }
}
