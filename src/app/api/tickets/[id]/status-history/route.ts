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

    if (!id) {
      return NextResponse.json({ error: 'Ticket ID required' }, { status: 400 });
    }

    // Verify ticket exists and user can access it
    const ticket = await queryOne<any>('SELECT id FROM tickets WHERE id = $1', [id]);
    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

    const data = await query(
      'SELECT * FROM ticket_status_history WHERE ticket_id = $1 ORDER BY created_at ASC',
      [id]
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error('Status history fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch status history' },
      { status: 500 }
    );
  }
}
