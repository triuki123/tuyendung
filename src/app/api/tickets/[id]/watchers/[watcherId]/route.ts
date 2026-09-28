import { queryOne, execute } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; watcherId: string } }
) {
  try {
    const { id, watcherId } = await params;
    const body = await request.json();
    const { muted, watch_type } = body;

    if (muted === undefined && !watch_type) {
      return NextResponse.json(
        { error: 'muted or watch_type required' },
        { status: 400 }
      );
    }

    // Get watcher
    const watcher = await queryOne<any>(
      'SELECT * FROM ticket_watchers WHERE id = $1 AND ticket_id = $2',
      [watcherId, id]
    );

    if (!watcher) {
      return NextResponse.json({ error: 'Watcher not found' }, { status: 404 });
    }

    // Update watcher
    const setClauses: string[] = [];
    const params_arr: any[] = [];
    let paramCount = 1;

    if (muted !== undefined) {
      setClauses.push(`muted = $${paramCount}`);
      params_arr.push(muted);
      paramCount++;
    }

    if (watch_type) {
      setClauses.push(`watch_type = $${paramCount}`);
      params_arr.push(watch_type);
      paramCount++;
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const updateQuery = `UPDATE ticket_watchers SET ${setClauses.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    params_arr.push(watcherId);
    params_arr.push(watcherId);

    const updated = await queryOne<any>(updateQuery, params_arr);

    // Log audit event if changed
    if (muted !== undefined && muted !== watcher.muted) {
      const user = await queryOne<{ name: string }>(
        'SELECT name FROM users WHERE id = $1',
        [watcher.user_id]
      );
      await execute(
        `INSERT INTO ticket_audit_events
          (ticket_id, event_type, actor_id, actor_name, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          id,
          muted ? 'watcher_muted' : 'watcher_unmuted',
          watcher.user_id,
          user?.name || 'Unknown',
          JSON.stringify({ reason: 'notification_preference' }),
        ]
      );
    }

    return NextResponse.json({
      success: true,
      watcher: updated,
    });
  } catch (error) {
    console.error('PATCH /api/tickets/[id]/watchers/[watcherId] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update watcher' },
      { status: 500 }
    );
  }
}
