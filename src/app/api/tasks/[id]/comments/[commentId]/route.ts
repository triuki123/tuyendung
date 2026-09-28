import { NextRequest, NextResponse } from 'next/server';
import {
  updateComment,
  deleteComment,
  permanentlyDeleteComment,
  getComment,
} from '@/lib/services/taskCommentsService';
import { queryOne } from '@/lib/db';

/**
 * PUT /api/tasks/[id]/comments/[commentId]
 *
 * Update an existing comment's content or visibility
 *
 * Only comment author or managers can edit comments.
 * Updated comment will show "(sửa lần cuối: ...)" indicator for audit trail.
 *
 * Required Headers:
 * - x-current-user-id: Comment author or manager
 * - x-current-user-role: User's role
 *
 * Request Body:
 * {
 *   content: string (required, non-empty)
 *   is_internal?: boolean (optional, change visibility)
 * }
 *
 * Permissions:
 * - Comment author: Can edit own comment
 * - Managers/admins: Can edit any comment
 * - Others: Forbidden (403)
 *
 * Response:
 * {
 *   success: true,
 *   data: Comment (updated),
 *   message: "Bình luận đã được cập nhật"
 * }
 *
 * Status Codes:
 * - 200 OK: Successfully updated
 * - 400 Bad Request: Invalid content
 * - 401 Unauthorized: No authentication
 * - 403 Forbidden: Insufficient permissions
 * - 404 Not Found: Comment not found
 * - 500 Server Error: Database error
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; commentId: string } }
) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    const currentUserRole = request.headers.get('x-current-user-role');

    if (!currentUserId) {
      return NextResponse.json(
        { error: 'Phải xác thực trước' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Validate
    if (!body.content || typeof body.content !== 'string') {
      return NextResponse.json(
        { error: 'Nội dung không hợp lệ' },
        { status: 400 }
      );
    }

    // Get existing comment to check permission
    const comment = await getComment(params.commentId);
    if (!comment) {
      return NextResponse.json(
        { error: 'Bình luận không tìm thấy' },
        { status: 404 }
      );
    }

    // Only comment author or manager can edit
    const isAuthor = comment.user_id === currentUserId;
    const isManager = currentUserRole === 'manager' || currentUserRole === 'admin';

    if (!isAuthor && !isManager) {
      return NextResponse.json(
        { error: 'Không có quyền sửa bình luận này' },
        { status: 403 }
      );
    }

    // Update comment
    const updated = await updateComment(params.commentId, {
      content: body.content,
      is_internal: body.is_internal || false,
    });

    console.log(
      `Comment ${params.commentId} updated by ${currentUserId}`
    );

    return NextResponse.json({
      success: true,
      data: updated,
      message: 'Bình luận đã được cập nhật',
    });
  } catch (error) {
    console.error(`PUT /api/tasks/[id]/comments/[commentId] error:`, error);
    return NextResponse.json(
      { error: 'Lỗi khi cập nhật bình luận' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tasks/[id]/comments/[commentId]
 *
 * Delete a comment (soft delete by default, permanent delete for managers only)
 *
 * Soft Delete Behavior:
 * - Comment marked with deleted_at timestamp
 * - Still counts in reply threads, shows as "[Bình luận đã bị xóa]"
 * - Author always has permission
 *
 * Permanent Delete:
 * - Removes comment from all tables
 * - Removes associated mentions
 * - Managers/admins only
 *
 * Required Headers:
 * - x-current-user-id: User performing deletion
 * - x-current-user-role: User's role
 *
 * Query Parameters:
 * - permanent?: 'true' | 'false' - Permanent delete (managers only)
 *
 * Permissions:
 * - Comment author: Can soft-delete own comment
 * - Managers: Can soft or permanently delete any comment
 * - Others: Forbidden (403)
 *
 * Response:
 * {
 *   success: true,
 *   message: "Bình luận đã được xóa" | "Bình luận đã được xóa vĩnh viễn",
 *   commentId: string
 * }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; commentId: string } }
) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    const currentUserRole = request.headers.get('x-current-user-role');
    const { searchParams } = new URL(request.url);
    const isPermanent = searchParams.get('permanent') === 'true';

    if (!currentUserId) {
      return NextResponse.json(
        { error: 'Phải xác thực trước' },
        { status: 401 }
      );
    }

    // Get existing comment to check permission
    const comment = await getComment(params.commentId);
    if (!comment) {
      return NextResponse.json(
        { error: 'Bình luận không tìm thấy' },
        { status: 404 }
      );
    }

    // Only comment author or manager can delete
    const isAuthor = comment.user_id === currentUserId;
    const isManager = currentUserRole === 'manager' || currentUserRole === 'admin';

    if (!isAuthor && !isManager) {
      return NextResponse.json(
        { error: 'Không có quyền xóa bình luận này' },
        { status: 403 }
      );
    }

    // Permanent delete only for managers
    if (isPermanent && !isManager) {
      return NextResponse.json(
        { error: 'Chỉ quản lý mới có thể xóa vĩnh viễn' },
        { status: 403 }
      );
    }

    // Delete comment
    let rowCount = 0;
    if (isPermanent) {
      rowCount = await permanentlyDeleteComment(params.commentId);
    } else {
      rowCount = await deleteComment(params.commentId);
    }

    if (rowCount === 0) {
      return NextResponse.json(
        { error: 'Bình luận không tìm thấy hoặc đã bị xóa' },
        { status: 404 }
      );
    }

    const deleteType = isPermanent ? 'xóa vĩnh viễn' : 'xóa';
    console.log(
      `Comment ${params.commentId} ${deleteType} by ${currentUserId}`
    );

    return NextResponse.json({
      success: true,
      message: `Bình luận đã được ${deleteType}`,
      commentId: params.commentId,
    });
  } catch (error) {
    console.error(
      `DELETE /api/tasks/[id]/comments/[commentId] error:`,
      error
    );
    return NextResponse.json(
      { error: 'Lỗi khi xóa bình luận' },
      { status: 500 }
    );
  }
}
