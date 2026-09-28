import { NextRequest, NextResponse } from 'next/server';
import { getActiveSessions } from '@/lib/services/sessionService';

/**
 * GET /api/auth/sessions
 * Returns all active sessions for the current user
 * Requires x-user-id header identifying the user
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

    console.log('[Sessions API] Fetching sessions for user:', userId);

    const sessions = await getActiveSessions(userId);

    const formattedSessions = sessions.map(session => ({
      id: session.id,
      device_name: session.device_name,
      browser: session.browser || 'Unknown',
      os: session.os || 'Unknown',
      ip_address: session.ip_address,
      created_at: session.created_at,
      last_activity: session.last_activity,
      is_current: false, // Will be determined client-side based on current session token
    }));

    return NextResponse.json({
      success: true,
      data: formattedSessions,
    });
  } catch (error) {
    console.error('Sessions fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch sessions' },
      { status: 500 }
    );
  }
}
