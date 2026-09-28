/**
 * Task Comments Service Layer
 * Manages task comments, @mentions, and collaboration features
 */

import { query, queryOne, execute, withTransaction, buildInsert, buildUpdateById } from '@/lib/db';
import { addFollower } from './taskFollowersService';

export interface Comment {
  id: string;
  task_id: string;
  user_id: string;
  user_name: string;
  user_avatar?: string;
  content: string;
  is_internal: boolean;
  parent_id?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface CommentWithMentions extends Comment {
  mentions: string[]; // Array of mentioned user IDs
}

export interface CommentCreateInput {
  content: string;
  is_internal?: boolean;
  mentions?: string[]; // User IDs to mention
  parent_id?: string | null; // Parent comment ID for threaded replies (NULL = root)
}

/** Comment with its nested replies (for threaded display) */
export interface CommentThread extends CommentWithMentions {
  replies: CommentWithMentions[];
}

export interface CommentUpdateInput {
  content: string;
  is_internal?: boolean;
}

/**
 * Create a new comment on a task
 * @param taskId Task ID
 * @param userId User ID creating the comment
 * @param userName User name
 * @param data Comment data
 * @returns Created comment with mentions
 */
export async function createComment(
  taskId: string,
  userId: string,
  userName: string,
  data: CommentCreateInput
): Promise<CommentWithMentions> {
  const commentId = `cmt_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  return withTransaction(async () => {
    // Insert comment
    await execute(
      `INSERT INTO task_comments (id, task_id, user_id, user_name, content, is_internal, parent_id, created_at)
       VALUES ($1, $2::uuid, $3, $4, $5, $6, $7::text, NOW())`,
      [
        commentId,
        taskId,
        userId,
        userName,
        data.content,
        data.is_internal || false,
        data.parent_id || null,
      ]
    );

    // Emit realtime event để client update UI
    await execute(
      `SELECT pg_notify('entity_changed', json_build_object('type', 'insert', 'entity', 'task_comment', 'entityId', $1::text, 'userId', $2::text)::text)`,
      [commentId, userId]
    );

    // Add mentions if provided
    const mentions: string[] = [];
    if (data.mentions && data.mentions.length > 0) {
      for (const mentionedUserId of data.mentions) {
        await execute(
          `INSERT INTO task_comment_mentions (comment_id, mentioned_user_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [commentId, mentionedUserId]
        );

        // Auto-follow mentioned users
        await addFollower(taskId, mentionedUserId);
        mentions.push(mentionedUserId);
      }
    }

    return {
      id: commentId,
      task_id: taskId,
      user_id: userId,
      user_name: userName,
      content: data.content,
      is_internal: data.is_internal || false,
      parent_id: data.parent_id || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      mentions,
    };
  });
}

/**
 * Get all comments for a task, structured as threads (root comments + nested replies).
 * Replies are sorted oldest-first within each thread; root comments newest-first.
 * @param taskId Task ID
 * @param includeDeleted Whether to include soft-deleted comments
 * @returns Array of comment threads
 */
export async function getTaskCommentThreads(
  taskId: string,
  includeDeleted: boolean = false
): Promise<CommentThread[]> {
  const all = await getTaskComments(taskId, includeDeleted);

  const roots = all.filter((c) => !c.parent_id);
  const repliesByParent = new Map<string, CommentWithMentions[]>();
  for (const c of all) {
    if (c.parent_id) {
      const list = repliesByParent.get(c.parent_id) || [];
      list.push(c);
      repliesByParent.set(c.parent_id, list);
    }
  }

  return roots.map((root) => ({
    ...root,
    replies: (repliesByParent.get(root.id) || []).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ),
  }));
}

/**
 * Update an existing comment
 * @param commentId Comment ID
 * @param data Update data
 * @returns Updated comment with mentions
 */
export async function updateComment(
  commentId: string,
  data: CommentUpdateInput
): Promise<Comment> {
  try {
    await execute(
      `UPDATE task_comments
       SET content = $1, is_internal = $2, updated_at = NOW()
       WHERE id = $3`,
      [data.content, data.is_internal || false, commentId]
    );

    const comment = await queryOne<Comment>(
      'SELECT * FROM task_comments WHERE id = $1',
      [commentId]
    );

    if (!comment) {
      throw new Error('Comment not found after update');
    }

    return comment;
  } catch (error) {
    console.error('Error updating comment:', error);
    throw error;
  }
}

/**
 * Delete a comment (soft delete)
 * @param commentId Comment ID
 * @returns Number of rows updated
 */
export async function deleteComment(commentId: string): Promise<number> {
  try {
    const result = await execute(
      'UPDATE task_comments SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [commentId]
    );
    return result;
  } catch (error) {
    console.error('Error deleting comment:', error);
    throw error;
  }
}

/**
 * Permanently delete a comment (hard delete)
 * @param commentId Comment ID
 * @returns Number of rows deleted
 */
export async function permanentlyDeleteComment(commentId: string): Promise<number> {
  return withTransaction(async () => {
    // Delete mentions first
    await execute(
      'DELETE FROM task_comment_mentions WHERE comment_id = $1',
      [commentId]
    );

    // Delete comment
    const result = await execute(
      'DELETE FROM task_comments WHERE id = $1',
      [commentId]
    );

    return result;
  });
}

/**
 * Get all comments for a task
 * @param taskId Task ID
 * @param includeDeleted Whether to include soft-deleted comments
 * @returns Array of comments with mentions
 */
export async function getTaskComments(
  taskId: string,
  includeDeleted: boolean = false
): Promise<CommentWithMentions[]> {
  try {
    // Lấy TÊN THẬT từ users (ghi đè user_name snapshot — vốn có thể là UUID nếu lúc
    // tạo bình luận client không gửi header tên). Cột user_name khai báo SAU c.* nên
    // node-postgres dùng giá trị này. Fallback c.user_name nếu user đã bị xóa.
    let sql = `
      SELECT c.*, COALESCE(u.name, c.user_name) AS user_name, u.avatar AS user_avatar
      FROM task_comments c
      LEFT JOIN users u ON u.id::text = c.user_id::text
      WHERE c.task_id = $1
    `;
    const params: (string | boolean)[] = [taskId];

    if (!includeDeleted) {
      sql += ` AND c.deleted_at IS NULL`;
    }

    sql += ` ORDER BY c.created_at DESC`;

    const comments = await query<Comment>(sql, params);

    if (!comments) {
      return [];
    }

    // Fetch mentions for each comment
    const commentsWithMentions: CommentWithMentions[] = await Promise.all(
      comments.map(async (comment) => {
        const mentions = await getMentions(comment.id);
        return {
          ...comment,
          mentions,
        };
      })
    );

    return commentsWithMentions;
  } catch (error) {
    console.error('Error fetching task comments:', error);
    throw error;
  }
}

/**
 * Get mentions for a comment
 * @param commentId Comment ID
 * @returns Array of mentioned user IDs
 */
export async function getMentions(commentId: string): Promise<string[]> {
  try {
    const mentions = await query<{ mentioned_user_id: string }>(
      'SELECT mentioned_user_id FROM task_comment_mentions WHERE comment_id = $1',
      [commentId]
    );

    return mentions ? mentions.map((m) => m.mentioned_user_id) : [];
  } catch (error) {
    console.error('Error fetching mentions:', error);
    throw error;
  }
}

/**
 * Get comments mentioning a user
 * @param userId User ID
 * @param limit Optional limit
 * @returns Array of comments with mentions
 */
export async function getCommentsMentioningUser(
  userId: string,
  limit?: number
): Promise<CommentWithMentions[]> {
  try {
    let sql = `
      SELECT DISTINCT c.* FROM task_comments c
      INNER JOIN task_comment_mentions m ON c.id = m.comment_id
      WHERE m.mentioned_user_id = $1
      AND c.deleted_at IS NULL
      ORDER BY c.created_at DESC
    `;
    const params: (string | number)[] = [userId];

    if (limit) {
      sql += ` LIMIT $2`;
      params.push(limit);
    }

    const comments = await query<Comment>(sql, params);

    if (!comments) {
      return [];
    }

    // Fetch mentions for each comment
    const commentsWithMentions: CommentWithMentions[] = await Promise.all(
      comments.map(async (comment) => {
        const mentions = await getMentions(comment.id);
        return {
          ...comment,
          mentions,
        };
      })
    );

    return commentsWithMentions;
  } catch (error) {
    console.error('Error fetching mentions:', error);
    throw error;
  }
}

/**
 * Get comment by ID
 * @param commentId Comment ID
 * @returns Comment with mentions
 */
export async function getComment(commentId: string): Promise<CommentWithMentions | null> {
  try {
    const comment = await queryOne<Comment>(
      'SELECT * FROM task_comments WHERE id = $1',
      [commentId]
    );

    if (!comment) {
      return null;
    }

    const mentions = await getMentions(commentId);

    return {
      ...comment,
      mentions,
    };
  } catch (error) {
    console.error('Error fetching comment:', error);
    throw error;
  }
}

/**
 * Get comment count for a task
 * @param taskId Task ID
 * @returns Number of non-deleted comments
 */
export async function getCommentCount(taskId: string): Promise<number> {
  try {
    const result = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM task_comments WHERE task_id = $1 AND deleted_at IS NULL',
      [taskId]
    );

    return result ? parseInt(result.count, 10) : 0;
  } catch (error) {
    console.error('Error getting comment count:', error);
    throw error;
  }
}

/**
 * Delete all comments by a user (when user is deleted)
 * @param userId User ID
 * @returns Number of rows updated
 */
export async function softDeleteUserComments(userId: string): Promise<number> {
  try {
    const result = await execute(
      'UPDATE task_comments SET deleted_at = NOW() WHERE user_id = $1 AND deleted_at IS NULL',
      [userId]
    );
    return result;
  } catch (error) {
    console.error('Error soft-deleting user comments:', error);
    throw error;
  }
}

/**
 * Get paginated comments for a task
 * @param taskId Task ID
 * @param page Page number (1-indexed)
 * @param pageSize Items per page (default 10, max 50)
 * @param includeDeleted Whether to include soft-deleted comments
 * @returns Paginated comments with mentions
 */
export async function getTaskCommentsPaginated(
  taskId: string,
  page: number = 1,
  pageSize: number = 10,
  includeDeleted: boolean = false
): Promise<{ data: CommentWithMentions[]; total: number; page: number; pageSize: number }> {
  try {
    // Validate pagination params
    const validPageSize = Math.min(Math.max(pageSize, 1), 50); // Clamp between 1 and 50
    const validPage = Math.max(page, 1);
    const offset = (validPage - 1) * validPageSize;

    // Get total count
    let countSql = 'SELECT COUNT(*) as total FROM task_comments WHERE task_id = $1';
    const countParams: (string | undefined)[] = [taskId];

    if (!includeDeleted) {
      countSql += ' AND deleted_at IS NULL';
    }

    const countResult = await queryOne<{ total: number }>(countSql, countParams);
    const total = countResult?.total || 0;

    // Get paginated comments
    // Lấy TÊN THẬT từ users (ghi đè user_name snapshot — vốn có thể là UUID nếu lúc
    // tạo bình luận client không gửi header tên). Cột user_name khai báo SAU c.* nên
    // node-postgres dùng giá trị này. Fallback c.user_name nếu user đã bị xóa.
    let sql = `
      SELECT c.*, COALESCE(u.name, c.user_name) AS user_name, u.avatar AS user_avatar
      FROM task_comments c
      LEFT JOIN users u ON u.id::text = c.user_id::text
      WHERE c.task_id = $1
    `;
    const params: (string | number)[] = [taskId];

    if (!includeDeleted) {
      sql += ' AND c.deleted_at IS NULL';
    }

    sql += ' ORDER BY c.created_at DESC LIMIT $2 OFFSET $3';
    params.push(validPageSize, offset);

    const comments = await query<Comment>(sql, params);

    if (!comments) {
      return { data: [], total, page: validPage, pageSize: validPageSize };
    }

    // Fetch mentions for each comment
    const commentsWithMentions: CommentWithMentions[] = await Promise.all(
      comments.map(async (comment) => {
        const mentions = await getMentions(comment.id);
        return {
          ...comment,
          mentions,
        };
      })
    );

    return {
      data: commentsWithMentions,
      total,
      page: validPage,
      pageSize: validPageSize,
    };
  } catch (error) {
    console.error('Error fetching paginated comments:', error);
    throw error;
  }
}

/**
 * Check if comment is visible to user
 * (handles internal comment permission logic)
 * @param comment Comment object
 * @param userId Viewer user ID
 * @param taskCreatedBy Task creator ID
 * @param taskAssignedTo Task assignee ID
 * @param userRole User role for manager check
 * @returns Boolean indicating if user can see comment
 */
export function canViewComment(
  comment: Comment,
  userId: string,
  taskCreatedBy: string,
  taskAssignedTo: string,
  userRole: string
): boolean {
  // Public comments visible to all
  if (!comment.is_internal) {
    return true;
  }

  // Internal comments only visible to:
  // - Comment author
  // - Task creator
  // - Task assignee
  // - Managers (role manager or admin)
  const isAuthor = comment.user_id === userId;
  const isCreator = taskCreatedBy === userId;
  const isAssignee = taskAssignedTo === userId;
  const isManager = userRole === 'manager' || userRole === 'admin';

  return isAuthor || isCreator || isAssignee || isManager;
}
