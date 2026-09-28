import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

/**
 * PUT /api/tickets/[id]/comments/[commentId]
 * Update a comment
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; commentId: string } }
) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    const body = await request.json();

    if (!currentUserId) {
      return NextResponse.json(
        { error: 'Phải xác thực trước' },
        { status: 401 }
      );
    }

    const comment = await queryOne<any>(
      'SELECT user_id FROM ticket_comments WHERE id = $1',
      [params.commentId]
    );

    if (!comment) {
      return NextResponse.json(
        { error: 'Bình luận không tìm thấy' },
        { status: 404 }
      );
    }

    if (comment.user_id !== currentUserId) {
      return NextResponse.json(
        { error: 'Chỉ có thể sửa bình luận của bạn' },
        { status: 403 }
      );
    }

    // Update comment content
    await execute(
      'UPDATE ticket_comments SET content = $1, updated_at = $2 WHERE id = $3',
      [body.content, new Date().toISOString(), params.commentId]
    );

    // Update mentions
    if (body.mentions && body.mentions.length > 0) {
      await execute(
        'DELETE FROM ticket_comment_mentions WHERE comment_id = $1',
        [params.commentId]
      );

      for (const mentionedUserId of body.mentions) {
        await execute(
          'INSERT INTO ticket_comment_mentions (comment_id, mentioned_user_id) VALUES ($1, $2)',
          [params.commentId, mentionedUserId]
        );
      }
    }

    const updated = await queryOne<any>(
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
      [params.commentId]
    );

    return NextResponse.json({
      success: true,
      data: updated,
      message: 'Bình luận đã được cập nhật',
    });
  } catch (error) {
    console.error(`PUT /api/tickets/[id]/comments/[commentId] error:`, error);
    return NextResponse.json(
      { error: 'Lỗi khi cập nhật bình luận' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tickets/[id]/comments/[commentId]
 * Soft delete a comment
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; commentId: string } }
) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');

    if (!currentUserId) {
      return NextResponse.json(
        { error: 'Phải xác thực trước' },
        { status: 401 }
      );
    }

    const activeCompany = request.headers.get('x-current-user-company');
    const ctx = await getEffectiveContext(currentUserId, activeCompany);
    const currentUserRole = ctx?.role ?? 'user';

    const comment = await queryOne<any>(
      'SELECT user_id FROM ticket_comments WHERE id = $1',
      [params.commentId]
    );

    if (!comment) {
      return NextResponse.json(
        { error: 'Bình luận không tìm thấy' },
        { status: 404 }
      );
    }

    // Only comment author or admin can delete
    const canDelete = comment.user_id === currentUserId ||
      currentUserRole === 'admin' ||
      currentUserRole === 'super_admin';

    if (!canDelete) {
      return NextResponse.json(
        { error: 'Chỉ có thể xóa bình luận của bạn' },
        { status: 403 }
      );
    }

    // Soft delete
    await execute(
      'UPDATE ticket_comments SET deleted_at = $1 WHERE id = $2',
      [new Date().toISOString(), params.commentId]
    );

    return NextResponse.json({
      success: true,
      message: 'Bình luận đã được xóa',
    });
  } catch (error) {
    console.error(`DELETE /api/tickets/[id]/comments/[commentId] error:`, error);
    return NextResponse.json(
      { error: 'Lỗi khi xóa bình luận' },
      { status: 500 }
    );
  }
}
