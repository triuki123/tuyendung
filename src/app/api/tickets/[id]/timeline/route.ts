import { query, queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params;
    const currentUserId = request.headers.get('x-current-user-id');
    if (!currentUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const limit = request.nextUrl.searchParams.get('limit') || '50';
    const offset = request.nextUrl.searchParams.get('offset') || '0';
    const eventType = request.nextUrl.searchParams.get('type'); // optional filter

    if (!id) {
      return NextResponse.json({ error: 'ticket ID required' }, { status: 400 });
    }

    // Verify ticket exists
    const ticket = await queryOne('SELECT id FROM tickets WHERE id::text = $1', [id]);
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Build unified timeline query
    // Tất cả id/ticket_id/user_id đều cast ::text để UNION ALL không lỗi kiểu UUID vs TEXT
    let timelineQuery = `
      (
        SELECT
          'comment'::text as event_type,
          c.id::text, c.ticket_id::text, c.user_id::text as user_id, c.user_name as actor_name,
          c.created_at, c.updated_at,
          'comment'::text as entity_type,
          c.id::text as entity_id,
          c.content,
          c.is_internal,
          c.deleted_at
        FROM ticket_comments c
        WHERE c.ticket_id::text = $1 AND c.deleted_at IS NULL
      )
      UNION ALL
      (
        SELECT
          'status_change'::text as event_type,
          a.id::text, a.ticket_id::text, a.actor_id::text as user_id, a.actor_name,
          a.created_at, a.created_at as updated_at,
          'status'::text as entity_type,
          a.id::text as entity_id,
          NULL::text as content,
          false as is_internal,
          NULL::timestamptz as deleted_at
        FROM ticket_audit_events a
        WHERE a.ticket_id::text = $1 AND a.event_type = 'status_changed'
      )
      UNION ALL
      (
        SELECT
          'attachment'::text as event_type,
          a.id::text, a.ticket_id::text, a.uploaded_by::text as user_id, u.name as actor_name,
          a.created_at, a.created_at as updated_at,
          'attachment'::text as entity_type,
          a.id::text as entity_id,
          a.file_name as content,
          a.is_internal,
          NULL::timestamptz as deleted_at
        FROM ticket_attachments a
        JOIN users u ON u.id::text = a.uploaded_by::text
        WHERE a.ticket_id::text = $1
      )
      UNION ALL
      (
        SELECT
          'watcher'::text as event_type,
          a.id::text, a.ticket_id::text, a.actor_id::text as user_id, a.actor_name,
          a.created_at, a.created_at as updated_at,
          'watcher'::text as entity_type,
          a.id::text as entity_id,
          NULL::text as content,
          false as is_internal,
          NULL::timestamptz as deleted_at
        FROM ticket_audit_events a
        WHERE a.ticket_id::text = $1 AND a.event_type IN ('watcher_added', 'watcher_removed')
      )
      UNION ALL
      (
        SELECT
          'audit_event'::text as event_type,
          a.id::text, a.ticket_id::text, a.actor_id::text as user_id, a.actor_name,
          a.created_at, a.created_at as updated_at,
          a.event_type::text as entity_type,
          a.id::text as entity_id,
          NULL::text as content,
          false as is_internal,
          NULL::timestamptz as deleted_at
        FROM ticket_audit_events a
        WHERE a.ticket_id::text = $1 AND a.event_type NOT IN ('status_changed', 'watcher_added', 'watcher_removed', 'comment_added', 'comment_edited', 'comment_deleted')
      )
    `;

    // Add event type filter if provided
    if (eventType && eventType !== 'all') {
      timelineQuery = `SELECT * FROM (${timelineQuery}) timeline WHERE event_type = $4 ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
    } else {
      timelineQuery = `SELECT * FROM (${timelineQuery}) timeline ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
    }

    const params_arr = [id, parseInt(limit), parseInt(offset)];
    if (eventType && eventType !== 'all') {
      params_arr.push(eventType);
    }

    const events = await query<any>(timelineQuery, params_arr);

    // Get total count for pagination
    const totalQuery = eventType && eventType !== 'all'
      ? `SELECT COUNT(*) as count FROM (${timelineQuery.split('ORDER BY')[0]}) total`
      : `SELECT COUNT(*) as count FROM (${timelineQuery.split('ORDER BY')[0]}) total WHERE event_type IS NOT NULL`;

    const totalResult = await queryOne<{ count: string }>(
      `SELECT
        COALESCE(SUM(cnt), 0) as count
      FROM (
        SELECT COUNT(*) as cnt FROM ticket_comments WHERE ticket_id::text = $1 AND deleted_at IS NULL
        UNION ALL
        SELECT COUNT(*) FROM ticket_audit_events WHERE ticket_id::text = $1 AND event_type = 'status_changed'
        UNION ALL
        SELECT COUNT(*) FROM ticket_attachments WHERE ticket_id::text = $1
        UNION ALL
        SELECT COUNT(*) FROM ticket_audit_events WHERE ticket_id::text = $1 AND event_type IN ('watcher_added', 'watcher_removed')
      ) counts`,
      [id]
    );

    // Enrich events with mentions for comments
    const enrichedEvents = await Promise.all(
      events.map(async (event) => {
        if (event.event_type === 'comment' && event.entity_id) {
          const mentions = await query<any>(
            'SELECT mentioned_user_id FROM ticket_comment_mentions WHERE comment_id = $1',
            [event.entity_id]
          );
          return {
            ...event,
            mentions: mentions.map((m) => m.mentioned_user_id),
          };
        }
        return event;
      })
    );

    return NextResponse.json({
      success: true,
      events: enrichedEvents,
      total: parseInt(totalResult?.count || '0'),
      has_more: parseInt(offset) + parseInt(limit) < parseInt(totalResult?.count || '0'),
    });
  } catch (error) {
    console.error('GET /api/tickets/[id]/timeline error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch timeline' },
      { status: 500 }
    );
  }
}
