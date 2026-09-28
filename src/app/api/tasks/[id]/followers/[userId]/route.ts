import { NextRequest, NextResponse } from 'next/server';
import { removeFollower } from '@/lib/services/taskFollowersService';

/**
 * DELETE /api/tasks/[id]/followers/[userId]
 *
 * Remove a user from following a task
 *
 * Permission Model:
 * - User can always remove themselves (userId = currentUserId)
 * - Managers/admins can remove any follower from any task
 * - Others cannot remove other users (403 Forbidden)
 *
 * After removal:
 * - User no longer receives notifications for this task
 * - User no longer appears in follower list
 * - Operation is idempotent (removing non-follower returns 404)
 *
 * Required Headers:
 * - x-current-user-id: Current user performing removal
 * - x-current-user-role: User's role (manager/admin for override)
 *
 * Path Parameters:
 * - id: Task ID
 * - userId: User ID to remove as follower
 *
 * Response:
 * {
 *   success: true,
 *   message: "Đã bỏ theo dõi task",
 *   userId: string
 * }
 *
 * Status Codes:
 * - 200 OK: Successfully removed
 * - 401 Unauthorized: No authentication
 * - 403 Forbidden: Insufficient permissions
 * - 404 Not Found: User is not following this task
 * - 500 Server Error: Database error
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    if (!currentUserId) {
      return NextResponse.json(
        { error: 'Phải xác thực trước' },
        { status: 401 }
      );
    }

    // User can only remove themselves, or manager can remove anyone
    const userRole = request.headers.get('x-current-user-role');
    const isManager = userRole === 'manager' || userRole === 'admin';

    if (params.userId !== currentUserId && !isManager) {
      return NextResponse.json(
        { error: 'Không có quyền bỏ theo dõi người khác' },
        { status: 403 }
      );
    }

    // Remove follower
    const rowCount = await removeFollower(params.id, params.userId);

    if (rowCount === 0) {
      return NextResponse.json(
        { error: 'Không tìm thấy người theo dõi' },
        { status: 404 }
      );
    }

    console.log(
      `User ${params.userId} unfollowed task ${params.id} (by ${currentUserId})`
    );

    return NextResponse.json({
      success: true,
      message: 'Đã bỏ theo dõi task',
      userId: params.userId,
    });
  } catch (error) {
    console.error(`DELETE /api/tasks/[id]/followers/[userId] error:`, error);
    return NextResponse.json(
      { error: 'Lỗi khi bỏ theo dõi' },
      { status: 500 }
    );
  }
}
