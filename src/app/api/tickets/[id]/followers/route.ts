import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';

/**
 * PATCH /api/tickets/[id]/followers
 *
 * Thêm hoặc xóa user từ followers array.
 * Body: { action: 'follow' | 'unfollow', userId: string }
 *
 * Response: Updated ticket with new followers array
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    if (!currentUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { action, userId } = body;

    if (!action || !userId || !['follow', 'unfollow'].includes(action)) {
      return NextResponse.json(
        { error: 'action (follow/unfollow) và userId là bắt buộc' },
        { status: 400 }
      );
    }

    // Get current ticket
    const ticket = await queryOne('SELECT followers FROM tickets WHERE id = $1', [params.id]);

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket không tồn tại' },
        { status: 404 }
      );
    }

    // Parse followers array (default to empty if null)
    let followers: string[] = [];
    if (ticket.followers && Array.isArray(ticket.followers)) {
      followers = ticket.followers;
    }

    // Update followers array
    if (action === 'follow') {
      // Add user if not already following
      if (!followers.includes(userId)) {
        followers.push(userId);
      }
    } else if (action === 'unfollow') {
      // Remove user from followers
      followers = followers.filter(id => id !== userId);
    }

    // Update database
    await execute(
      'UPDATE tickets SET followers = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(followers), params.id]
    );

    // Return updated ticket
    const updatedTicket = await queryOne('SELECT * FROM tickets WHERE id = $1', [params.id]);

    return NextResponse.json({
      success: true,
      action,
      ticket: updatedTicket,
      followers: updatedTicket.followers,
      followerCount: Array.isArray(updatedTicket.followers) ? updatedTicket.followers.length : 0,
    });
  } catch (error) {
    console.error(`[PATCH] /api/tickets/[id]/followers error:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tickets/[id]/followers
 *
 * Get list of followers for a ticket
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    if (!currentUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ticket = await queryOne(
      `SELECT id, followers FROM tickets WHERE id = $1`,
      [params.id]
    );

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket không tồn tại' },
        { status: 404 }
      );
    }

    const followers = Array.isArray(ticket.followers) ? ticket.followers : [];

    return NextResponse.json({
      success: true,
      ticketId: params.id,
      followers,
      followerCount: followers.length,
    });
  } catch (error) {
    console.error(`[GET] /api/tickets/[id]/followers error:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server' },
      { status: 500 }
    );
  }
}
