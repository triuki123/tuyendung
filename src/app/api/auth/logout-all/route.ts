import { NextRequest, NextResponse } from 'next/server';
import { logoutAllOtherSessions } from '@/lib/services/sessionService';

/**
 * POST /api/auth/logout-all
 * Logout all sessions except the current one
 * Requires x-user-id and x-session-id headers
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    const currentSessionId = request.headers.get('x-session-id');

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

    if (!currentSessionId) {
      return NextResponse.json({ error: 'Current session ID required' }, { status: 400 });
    }

    console.log('[Sessions API] Logging out all other sessions for user:', userId);

    await logoutAllOtherSessions(userId, currentSessionId);

    return NextResponse.json({
      success: true,
      message: 'All other sessions logged out successfully',
    });
  } catch (error) {
    console.error('Logout all error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to logout all sessions' },
      { status: 500 }
    );
  }
}
