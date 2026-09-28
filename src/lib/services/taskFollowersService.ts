/**
 * Task Followers Service Layer
 * Manages task followers for real-time notifications and visibility
 */

import { query, queryOne, execute, withTransaction, buildInsert } from '@/lib/db';

export interface Follower {
  task_id: string;
  user_id: string;
  created_at: string;
}

export interface FollowerInfo {
  user_id: string;
  user_name: string;
  avatar?: string;
  created_at: string;
}

/**
 * Add a follower to a task
 * @param taskId Task ID
 * @param userId User ID to follow the task
 * @returns Follower object
 */
export async function addFollower(
  taskId: string,
  userId: string
): Promise<Follower> {
  try {
    console.log(`[addFollower] taskId=${JSON.stringify(taskId)}, userId=${JSON.stringify(userId)}`);
    const existing = await queryOne<Follower>(
      'SELECT * FROM task_followers WHERE task_id = $1::uuid AND user_id = $2',
      [taskId, userId]
    );

    if (existing) {
      return existing;
    }

    const result = await execute(
      'INSERT INTO task_followers (task_id, user_id) VALUES ($1::uuid, $2)',
      [taskId, userId]
    );

    // Emit realtime event để client update UI
    await execute(
      `SELECT pg_notify('entity_changed', json_build_object('type', 'insert', 'entity', 'task_follower', 'entityId', $1::text, 'userId', $2::text)::text)`,
      [taskId, userId]
    );

    return {
      task_id: taskId,
      user_id: userId,
      created_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error adding follower:', error);
    throw error;
  }
}

/**
 * Remove a follower from a task
 * @param taskId Task ID
 * @param userId User ID to unfollow
 * @returns Number of rows deleted
 */
export async function removeFollower(
  taskId: string,
  userId: string
): Promise<number> {
  try {
    const result = await execute(
      'DELETE FROM task_followers WHERE task_id = $1 AND user_id = $2',
      [taskId, userId]
    );
    return result;
  } catch (error) {
    console.error('Error removing follower:', error);
    throw error;
  }
}

/**
 * Get all followers of a task with user info
 * @param taskId Task ID
 * @returns Array of follower info
 */
export async function getFollowers(taskId: string): Promise<FollowerInfo[]> {
  try {
    const followers = await query<FollowerInfo>(
      `SELECT
        tf.user_id,
        u."name" as user_name,
        u."avatar",
        tf.created_at
      FROM task_followers tf
      LEFT JOIN users u ON tf.user_id = u.id
      WHERE tf.task_id = $1
      ORDER BY tf.created_at DESC`,
      [taskId]
    );

    return followers || [];
  } catch (error) {
    console.error('Error fetching followers:', error);
    throw error;
  }
}

/**
 * Check if a user is following a task
 * @param taskId Task ID
 * @param userId User ID
 * @returns Boolean indicating if user follows task
 */
export async function isFollowing(
  taskId: string,
  userId: string
): Promise<boolean> {
  try {
    const follower = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM task_followers WHERE task_id = $1 AND user_id = $2',
      [taskId, userId]
    );

    return follower ? parseInt(follower.count, 10) > 0 : false;
  } catch (error) {
    console.error('Error checking follower status:', error);
    throw error;
  }
}

/**
 * Get follower count for a task
 * @param taskId Task ID
 * @returns Number of followers
 */
export async function getFollowerCount(taskId: string): Promise<number> {
  try {
    const result = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM task_followers WHERE task_id = $1',
      [taskId]
    );

    return result ? parseInt(result.count, 10) : 0;
  } catch (error) {
    console.error('Error getting follower count:', error);
    throw error;
  }
}

/**
 * Auto-follow task creator and assignee
 * Called when task is created
 * @param taskId Task ID
 * @param createdBy Creator user ID
 * @param assignedTo Assignee user ID (optional)
 */
export async function autoFollowTaskCreators(
  taskId: string,
  createdBy: string,
  assignedTo?: string
): Promise<void> {
  try {
    await withTransaction(async () => {
      // Add creator as follower
      await addFollower(taskId, createdBy);

      // Add assignee as follower if provided and different from creator
      if (assignedTo && assignedTo !== createdBy) {
        await addFollower(taskId, assignedTo);
      }
    });
  } catch (error) {
    console.error('Error auto-following task:', error);
    throw error;
  }
}

/**
 * Get tasks followed by a user
 * @param userId User ID
 * @param limit Optional limit
 * @returns Array of task IDs
 */
export async function getFollowedTasks(
  userId: string,
  limit?: number
): Promise<string[]> {
  try {
    let sql = `
      SELECT task_id FROM task_followers
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;
    const params: (string | number)[] = [userId];

    if (limit) {
      sql += ` LIMIT $2`;
      params.push(limit);
    }

    const results = await query<{ task_id: string }>(sql, params);
    return results ? results.map((r) => r.task_id) : [];
  } catch (error) {
    console.error('Error getting followed tasks:', error);
    throw error;
  }
}

/**
 * Unfollow all tasks by a user (when user is deleted)
 * @param userId User ID
 * @returns Number of rows deleted
 */
export async function unfollowAllTasks(userId: string): Promise<number> {
  try {
    const result = await execute(
      'DELETE FROM task_followers WHERE user_id = $1',
      [userId]
    );
    return result;
  } catch (error) {
    console.error('Error unfollowing all tasks:', error);
    throw error;
  }
}
