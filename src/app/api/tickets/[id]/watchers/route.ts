import { queryOne, execute, query } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params;
    const currentUserId = request.headers.get('x-current-user-id');
    if (!currentUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!id) {
      return NextResponse.json({ error: 'ticket ID required' }, { status: 400 });
    }

    // Verify ticket exists
    const ticket = await queryOne('SELECT id FROM tickets WHERE id = $1', [id]);
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Get watchers with user details
    const watchers = await query<any>(
      `SELECT
        w.id, w.ticket_id, w.user_id, w.watch_type, w.muted, w.created_at,
        u.name as user_name, u.avatar
      FROM ticket_watchers w
      JOIN users u ON w.user_id::text = u.id::text
      WHERE w.ticket_id = $1
      ORDER BY w.created_at DESC`,
      [id]
    );

    return NextResponse.json({
      success: true,
      watchers,
      count: watchers.length,
    });
  } catch (error) {
    console.error('GET /api/tickets/[id]/watchers error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch watchers' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action, watch_type = 'all', userId } = body;

    if (!id || !action || !userId) {
      return NextResponse.json(
        { error: 'ticket ID, action (follow/unfollow), and userId required' },
        { status: 400 }
      );
    }

    // Verify ticket exists
    const ticket = await queryOne('SELECT id FROM tickets WHERE id = $1', [id]);
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    if (action === 'follow') {
      // Add watcher
      await execute(
        `INSERT INTO ticket_watchers (ticket_id, user_id, watch_type, muted, created_at)
         VALUES ($1, $2, $3, false, NOW())
         ON CONFLICT (ticket_id, user_id) DO UPDATE
         SET muted = false`,
        [id, userId, watch_type]
      );

      // Log audit event
      const user = await queryOne<{ name: string }>(
        'SELECT name FROM users WHERE id = $1',
        [userId]
      );
      await execute(
        `INSERT INTO ticket_audit_events
          (ticket_id, event_type, actor_id, actor_name, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [id, 'watcher_added', userId, user?.name || 'Unknown', JSON.stringify({ watch_type })]
      );
    } else if (action === 'unfollow') {
      // Remove watcher
      await execute(
        'DELETE FROM ticket_watchers WHERE ticket_id = $1 AND user_id = $2',
        [id, userId]
      );

      // Log audit event
      const user = await queryOne<{ name: string }>(
        'SELECT name FROM users WHERE id = $1',
        [userId]
      );
      await execute(
        `INSERT INTO ticket_audit_events
          (ticket_id, event_type, actor_id, actor_name, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [id, 'watcher_removed', userId, user?.name || 'Unknown']
      );
    } else {
      return NextResponse.json(
        { error: 'action must be follow or unfollow' },
        { status: 400 }
      );
    }

    // Return updated watchers list
    const watchers = await query<any>(
      `SELECT
        w.id, w.ticket_id, w.user_id, w.watch_type, w.muted, w.created_at,
        u.name as user_name, u.avatar
      FROM ticket_watchers w
      JOIN users u ON w.user_id::text = u.id::text
      WHERE w.ticket_id = $1
      ORDER BY w.created_at DESC`,
      [id]
    );

    return NextResponse.json({
      success: true,
      action,
      watchers,
      count: watchers.length,
    });
  } catch (error) {
    console.error('POST /api/tickets/[id]/watchers error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update watchers' },
      { status: 500 }
    );
  }
}
