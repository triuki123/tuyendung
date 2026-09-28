import { NextRequest, NextResponse } from 'next/server';
import { decodeIdentityHeader } from '@/lib/authCookie';
import { queryOne, execute, query } from '@/lib/db';
import { notifyTicketWatchers } from '@/lib/services/notificationsService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';


/**
 * GET /api/tickets/[id]/comments
 * Get all comments for a ticket
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    const activeCompany = request.headers.get('x-current-user-company');
    const ctx = currentUserId ? await getEffectiveContext(currentUserId, activeCompany) : null;
    const currentUserRole = ctx?.role ?? request.headers.get('x-current-user-role') ?? 'user';

    // Verify ticket exists
    const ticket = await queryOne<any>(
      'SELECT id, created_by, assigned_to FROM tickets WHERE id = $1',
      [params.id]
    );

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket không tìm thấy' },
        { status: 404 }
      );
    }

    // Get all comments with mentions — JOIN users để luôn lấy tên thật (không phụ thuộc dữ liệu cũ)
    const comments = await query<any>(
      `SELECT
        c.id, c.ticket_id, c.user_id,
        COALESCE(u.name, c.user_name) AS user_name,
        COALESCE(u.avatar, c.user_avatar) AS user_avatar,
        c.content, c.is_internal, c.created_at, c.updated_at, c.deleted_at,
        (SELECT array_agg(mentioned_user_id) FROM ticket_comment_mentions
         WHERE comment_id = c.id) AS mentions
      FROM ticket_comments c
      LEFT JOIN users u ON c.user_id::text = u.id::text
      WHERE c.ticket_id = $1
      ORDER BY c.created_at DESC`,
      [params.id]
    );

    // Filter by visibility
    const visibleComments = comments.filter((comment) => {
      if (comment.deleted_at) return false;
      if (!comment.is_internal) return true;
      return (
        currentUserId === comment.user_id ||
        currentUserId === ticket.created_by ||
        currentUserId === ticket.assigned_to ||
        currentUserRole === 'admin' ||
        currentUserRole === 'super_admin'
      );
    });

    return NextResponse.json({
      success: true,
      data: visibleComments,
      count: visibleComments.length,
    });
  } catch (error) {
    console.error(`GET /api/tickets/[id]/comments error:`, error);
    return NextResponse.json(
      { error: 'Lỗi khi tải bình luận' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tickets/[id]/comments
 * Create a new comment with @mention support
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    const currentUserName = decodeIdentityHeader(request.headers.get('x-current-user-name'));

    if (!currentUserId) {
      return NextResponse.json(
        { error: 'Phải xác thực trước' },
        { status: 401 }
      );
    }

    const body = await request.json();

    if (!body.content || typeof body.content !== 'string') {
      return NextResponse.json(
        { error: 'Nội dung bình luận là bắt buộc' },
        { status: 400 }
      );
    }

    if (body.content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Nội dung không thể trống' },
        { status: 400 }
      );
    }

    const ticket = await queryOne<any>(
      'SELECT id FROM tickets WHERE id = $1',
      [params.id]
    );

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket không tìm thấy' },
        { status: 404 }
      );
    }

    const user = await queryOne<any>(
      'SELECT name, avatar FROM users WHERE id = $1',
      [currentUserId]
    );

    // Ưu tiên header, fallback về DB, cuối cùng mới dùng ID
    const resolvedUserName = currentUserName || user?.name || currentUserId;

    const commentId = crypto.randomUUID();
    const now = new Date().toISOString();

    await execute(
      `INSERT INTO ticket_comments (id, ticket_id, user_id, user_name, user_avatar, content, is_internal, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        commentId,
        params.id,
        currentUserId,
        resolvedUserName,
        user?.avatar || null,
        body.content,
        body.is_internal || false,
        now,
        now,
      ]
    );

    const mentions = body.mentions || [];
    if (mentions && mentions.length > 0) {
      for (const mentionedUserId of mentions) {
        // Lưu mention vào bảng mentions
        await execute(
          `INSERT INTO ticket_comment_mentions (comment_id, mentioned_user_id)
           VALUES ($1, $2)`,
          [commentId, mentionedUserId]
        );

        // Tự động thêm người được mention vào danh sách Người Theo Dõi
        await execute(
          `INSERT INTO ticket_watchers (ticket_id, user_id, watch_type, muted, created_at)
           VALUES ($1, $2, 'all', false, NOW())
           ON CONFLICT (ticket_id, user_id) DO NOTHING`,
          [params.id, mentionedUserId]
        ).catch((err) => console.warn(`Could not add watcher for user ${mentionedUserId}:`, err));
      }
    }

    const comment = await queryOne<any>(
      `SELECT
        c.id, c.ticket_id, c.user_id,
        COALESCE(u.name, c.user_name) AS user_name,
        COALESCE(u.avatar, c.user_avatar) AS user_avatar,
        c.content, c.is_internal, c.created_at, c.updated_at, c.deleted_at,
        (SELECT array_agg(mentioned_user_id) FROM ticket_comment_mentions
         WHERE comment_id = c.id) AS mentions
      FROM ticket_comments c
      LEFT JOIN users u ON c.user_id::text = u.id::text
      WHERE c.id = $1`,
      [commentId]
    );

    console.log(`Comment created on ticket ${params.id} by ${currentUserId}: ${commentId}`);

    if (comment.mentions && comment.mentions.length > 0) {
      try {
        const ticketData = await queryOne<any>('SELECT id, code, title FROM tickets WHERE id = $1', [params.id]);
        if (ticketData) {
          const excerpt = body.content.length > 100 ? body.content.substring(0, 100) : body.content;

          const { notify } = await import('@/lib/notifications/engine');
          const excerptShort = excerpt.substring(0, 80) + (excerpt.length > 80 ? '...' : '');
          await notify('ticket.mention', {
            authorName: resolvedUserName, code: ticketData.code, title: ticketData.title,
            excerptShort, excerptLong: excerpt,
          }, { recipients: comment.mentions, relatedId: ticketData.id });
        }
      } catch (err) {
        console.error('Error in mention notification:', err);
      }
    }

    // Notify watchers về comment mới (bỏ qua người vừa comment + người được mention đã nhận riêng)
    if (!body.is_internal) {
      try {
        const ticketForWatcher = await queryOne<any>(
          'SELECT id, code, title, assigned_to, created_by FROM tickets WHERE id = $1',
          [params.id]
        );
        if (ticketForWatcher) {
          const excerpt = body.content.length > 100 ? body.content.substring(0, 100) : body.content;
          const mentionedIds = comment.mentions || [];

          await notifyTicketWatchers({
            ticket: ticketForWatcher,
            eventType: 'comment',
            actorId: currentUserId,
            actorName: resolvedUserName,
            commentExcerpt: excerpt,
            // Bỏ qua: người vừa comment + người được mention (đã nhận thông báo riêng)
            excludeUserIds: [currentUserId, ...mentionedIds].filter(Boolean),
          });
        }
      } catch (err) {
        console.error('[Watcher comment notify] error:', err);
      }
    }

    return NextResponse.json(
      { success: true, data: comment, message: 'Bình luận đã được thêm' },
      { status: 201 }
    );
  } catch (error) {
    console.error(`POST /api/tickets/[id]/comments error:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi khi tạo bình luận' },
      { status: 500 }
    );
  }
}
