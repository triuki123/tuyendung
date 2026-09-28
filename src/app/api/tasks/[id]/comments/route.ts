import { NextRequest, NextResponse } from 'next/server';
import { decodeIdentityHeader } from '@/lib/authCookie';
import {
  getTaskComments,
  createComment,
  canViewComment,
} from '@/lib/services/taskCommentsService';
import { queryOne } from '@/lib/db';
import { notifyTaskCommented } from '@/lib/services/taskNotifications';

/**
 * GET /api/tasks/[id]/comments
 *
 * Get all comments for a task with visibility filtering
 *
 * Internal comments are only visible to:
 * - Comment author
 * - Task creator
 * - Task assignee
 * - Managers/admins
 *
 * Required Headers:
 * - x-current-user-id: Current user ID
 * - x-current-user-role: User's role (for visibility checks)
 *
 * Query Parameters:
 * - include_deleted?: 'true' | 'false' - Include soft-deleted comments
 *
 * Response:
 * {
 *   success: true,
 *   data: Comment[],
 *   count: number
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    const currentUserRole = request.headers.get('x-current-user-role') || 'employee';
    const { searchParams } = new URL(request.url);
    const includeDeleted = searchParams.get('include_deleted') === 'true';

    // Get task info for permission checks
    const task = await queryOne<any>(
      'SELECT id, created_by, assigned_to FROM tasks WHERE id = $1',
      [params.id]
    );

    if (!task) {
      return NextResponse.json(
        { error: 'Task không tìm thấy' },
        { status: 404 }
      );
    }

    // Get comments
    const allComments = await getTaskComments(params.id, includeDeleted);

    // Filter by visibility (internal comments)
    const visibleComments = allComments.filter((comment) =>
      canViewComment(
        comment,
        currentUserId || '',
        task.created_by,
        task.assigned_to,
        currentUserRole
      )
    );

    return NextResponse.json({
      success: true,
      data: visibleComments,
      count: visibleComments.length,
    });
  } catch (error) {
    console.error(`GET /api/tasks/[id]/comments error:`, error);
    return NextResponse.json(
      { error: 'Lỗi khi tải bình luận' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tasks/[id]/comments
 *
 * Create a new comment on a task with @mention support
 *
 * Mentioned users are automatically added as followers if not already following.
 * The comment will be visible based on its is_internal flag:
 * - Public (is_internal=false): Visible to all followers
 * - Internal (is_internal=true): Visible only to creator/assignee/author/managers
 *
 * Required Headers:
 * - x-current-user-id: Comment author's user ID
 * - x-current-user-name: Comment author's display name
 *
 * Request Body:
 * {
 *   content: string (required, non-empty)
 *   is_internal?: boolean (default: false)
 *   mentions?: string[] (array of user IDs to mention)
 * }
 *
 * Response:
 * {
 *   success: true,
 *   data: Comment,
 *   message: "Bình luận đã được thêm"
 * }
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

    // Tên hiển thị: ưu tiên header; nếu thiếu thì tra DB (tránh lưu UUID làm tên).
    let resolvedName = currentUserName || '';
    if (!resolvedName) {
      const u = await queryOne<{ name: string }>(
        'SELECT name FROM users WHERE id::text = $1',
        [currentUserId]
      );
      resolvedName = u?.name || currentUserId;
    }

    const body = await request.json();

    // Validate
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

    // Create comment
    const comment = await createComment(
      params.id,
      currentUserId,
      resolvedName,
      {
        content: body.content,
        is_internal: body.is_internal || false,
        mentions: body.mentions || [],
        parent_id: body.parent_id || null,
      }
    );

    console.log(
      `Comment created on task ${params.id} by ${currentUserId}: ${comment.id}`
    );

    // Thông báo TẤT CẢ assignees (primary + co-assignees + creator) — in-app + Telegram.
    // Trừ chính người vừa comment.
    {
      const task = await queryOne<any>(
        'SELECT id, code, task_code, title, assigned_to, created_by FROM tasks WHERE id = $1',
        [params.id]
      );
      if (task) {
        await notifyTaskCommented(
          task,
          body.content || '',
          currentUserId,
          resolvedName
        ).catch((err) => console.error('[notifyTaskCommented] error:', err));
      }
    }

    // Send Telegram notification for mentions (if any) — giữ logic mention riêng
    if (comment.mentions && comment.mentions.length > 0) {
      try {
        const { sendTaskMentionTelegram } = await import('@/lib/services/notificationsService');

        // Lấy task info để gửi notification
        const task = await queryOne<any>(
          'SELECT id, task_code, code, title FROM tasks WHERE id = $1',
          [params.id]
        );

        if (task) {
          const excerpt = body.content.length > 100
            ? body.content.substring(0, 100)
            : body.content;

          await sendTaskMentionTelegram(
            task,
            resolvedName,
            comment.mentions,
            excerpt
          ).catch((err) =>
            console.error('Error sending mention Telegram:', err)
          );
        }
      } catch (err) {
        console.error('Error in mention notification:', err);
      }
    }

    return NextResponse.json({
      success: true,
      data: comment,
      message: 'Bình luận đã được thêm',
    });
  } catch (error) {
    console.error(`POST /api/tasks/[id]/comments error:`, error);
    return NextResponse.json(
      { error: 'Lỗi khi thêm bình luận' },
      { status: 500 }
    );
  }
}
