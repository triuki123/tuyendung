import { NextRequest, NextResponse } from 'next/server';
import {
  getFollowers,
  addFollower,
  removeFollower,
  getFollowerCount,
} from '@/lib/services/taskFollowersService';
import { queryOne } from '@/lib/db';

/**
 * GET /api/tasks/[id]/followers
 *
 * Retrieve list of all followers for a task
 *
 * Followers are users who have subscribed to receive updates on this task.
 * Task creator and assignee are automatically followers.
 *
 * Response includes:
 * - followers: Array of follower objects with user info
 * - count: Total number of followers
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     followers: Array<{id, user_id, task_id, created_at}>,
 *     count: number
 *   }
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const followers = await getFollowers(params.id);
    const count = await getFollowerCount(params.id);

    return NextResponse.json({
      success: true,
      data: {
        followers,
        count,
      },
    });
  } catch (error) {
    console.error(`GET /api/tasks/[id]/followers error:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch followers' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tasks/[id]/followers
 *
 * Add current user as a follower of this task
 *
 * Followers receive notifications when:
 * - New comments are added
 * - Task status changes
 * - Subtasks are completed
 * - Time entries are logged
 *
 * If user is already following, operation is idempotent (no error).
 *
 * Required Headers:
 * - x-current-user-id: User ID to add as follower
 *
 * Response:
 * {
 *   success: true,
 *   data: {id, task_id, user_id, created_at},
 *   message: "Đã theo dõi task này"
 * }
 *
 * Status Codes:
 * - 201 Created: Successfully added as follower
 * - 400 Bad Request: Task not found
 * - 401 Unauthorized: Must authenticate
 * - 500 Server Error: Database error
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    if (!currentUserId) {
      return NextResponse.json(
        { error: 'Phải xác thực trước' },
        { status: 401 }
      );
    }

    // Verify task exists
    const task = await queryOne(
      'SELECT id FROM tasks WHERE id = $1',
      [params.id]
    );
    if (!task) {
      return NextResponse.json(
        { error: 'Task không tìm thấy' },
        { status: 404 }
      );
    }

    // Add as follower
    const follower = await addFollower(params.id, currentUserId);

    console.log(`User ${currentUserId} followed task ${params.id}`);

    return NextResponse.json({
      success: true,
      data: follower,
      message: 'Đã theo dõi task này',
    });
  } catch (error) {
    console.error(`POST /api/tasks/[id]/followers error:`, error);
    return NextResponse.json(
      { error: 'Lỗi khi theo dõi task' },
      { status: 500 }
    );
  }
}
