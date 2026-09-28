/**
 * Task Assignee Service
 * Handles additional task assignees beyond primary assigned_to
 */

import { query, queryOne, buildInsert, execute } from '@/lib/db';
import { canCreateTaskFor } from '@/lib/services/taskPermissionService';

export interface TaskAssignee {
  id: string;
  task_id: string;
  user_id: string;
  user_name?: string;
  role: 'assignee' | 'reviewer' | 'approver';
  created_at: string;
}

export interface TaskAssigneeCreateInput {
  user_id: string;
  role?: 'assignee' | 'reviewer' | 'approver';
}

/**
 * Add an additional assignee to a task
 * @param taskId - Task ID
 * @param creatorId - User adding the assignee (for permission check)
 * @param data - Assignee data
 * @returns Created assignee
 */
export async function addAssignee(
  taskId: string,
  creatorId: string,
  data: TaskAssigneeCreateInput
): Promise<TaskAssignee> {
  // Verify task exists
  const task = await queryOne('SELECT id FROM tasks WHERE id = $1', [taskId]);
  if (!task) {
    throw new Error('Task not found');
  }

  // Permission check: creator must be able to assign to this user.
  // canCreateTaskFor trả về { allowed, reason } — không phải boolean.
  const canAssign = await canCreateTaskFor(creatorId, data.user_id);
  if (!canAssign.allowed) {
    throw new Error(`Permission denied: ${canAssign.reason || 'Cannot assign to this user'}`);
  }

  // Check if already assigned
  const existing = await queryOne(
    'SELECT id FROM task_assignees WHERE task_id = $1 AND user_id = $2',
    [taskId, data.user_id]
  );
  if (existing) {
    throw new Error('User is already assigned to this task');
  }

  // task_assignees.id là UUID — không dùng prefix kiểu "ta_xxx".
  const assigneeId = crypto.randomUUID();

  const { text, params } = buildInsert('task_assignees', {
    id: assigneeId,
    task_id: taskId,
    user_id: data.user_id,
    role: data.role ?? 'assignee',
  });

  const assignee = await queryOne<TaskAssignee>(text, params);
  if (!assignee) {
    throw new Error('Failed to add assignee');
  }

  return assignee;
}

/**
 * Get all additional assignees for a task
 * @param taskId - Task ID
 * @returns Array of assignees
 */
export async function getAssignees(taskId: string): Promise<TaskAssignee[]> {
  const sql = `
    SELECT
      ta.id,
      ta.task_id,
      ta.user_id,
      u.name as user_name,
      ta.role,
      ta.created_at
    FROM task_assignees ta
    LEFT JOIN users u ON ta.user_id = u.id
    WHERE ta.task_id = $1
    ORDER BY ta.created_at ASC
  `;

  const assignees = await query<TaskAssignee>(sql, [taskId]);
  return assignees || [];
}

/**
 * Get assignee by ID
 * @param assigneeId - Assignee ID
 * @returns Assignee object or null
 */
export async function getAssigneeById(assigneeId: string): Promise<TaskAssignee | null> {
  const sql = `
    SELECT
      ta.id,
      ta.task_id,
      ta.user_id,
      u.name as user_name,
      ta.role,
      ta.created_at
    FROM task_assignees ta
    LEFT JOIN users u ON ta.user_id = u.id
    WHERE ta.id = $1
  `;

  return await queryOne<TaskAssignee>(sql, [assigneeId]);
}

/**
 * Update an assignee's role
 * @param assigneeId - Assignee ID
 * @param newRole - New role
 * @returns Updated assignee
 */
export async function updateAssigneeRole(
  assigneeId: string,
  newRole: 'assignee' | 'reviewer' | 'approver'
): Promise<TaskAssignee> {
  const sql = `
    UPDATE task_assignees
    SET role = $1
    WHERE id = $2
    RETURNING id, task_id, user_id, role, created_at
  `;

  const updated = await queryOne<Omit<TaskAssignee, 'user_name'>>(sql, [newRole, assigneeId]);
  if (!updated) {
    throw new Error('Assignee not found');
  }

  return updated as TaskAssignee;
}

/**
 * Remove an assignee from a task
 * @param taskId - Task ID
 * @param userId - User ID to remove
 * @returns Number of rows deleted
 */
export async function removeAssignee(taskId: string, userId: string): Promise<number> {
  return await execute(
    'DELETE FROM task_assignees WHERE task_id = $1 AND user_id = $2',
    [taskId, userId]
  );
}

/**
 * Remove an assignee by ID
 * @param assigneeId - Assignee ID
 * @returns Number of rows deleted
 */
export async function removeAssigneeById(assigneeId: string): Promise<number> {
  return await execute('DELETE FROM task_assignees WHERE id = $1', [assigneeId]);
}

/**
 * Get all tasks assigned to a user (including additional assignees)
 * @param userId - User ID
 * @returns Array of task IDs
 */
export async function getTasksAssignedToUser(userId: string): Promise<string[]> {
  const result = await query<{ task_id: string }>(
    'SELECT DISTINCT task_id FROM task_assignees WHERE user_id = $1',
    [userId]
  );

  return result?.map(r => r.task_id) || [];
}

/**
 * Count additional assignees on a task
 * @param taskId - Task ID
 * @returns Count of additional assignees
 */
export async function countAssignees(taskId: string): Promise<number> {
  const result = await queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM task_assignees WHERE task_id = $1',
    [taskId]
  );

  return result?.count ?? 0;
}

/**
 * Get tasks with reviewer role (for review workflows)
 * @param userId - User ID
 * @returns Array of task IDs where user is a reviewer
 */
export async function getTasksAsReviewer(userId: string): Promise<string[]> {
  const result = await query<{ task_id: string }>(
    'SELECT DISTINCT task_id FROM task_assignees WHERE user_id = $1 AND role = \'reviewer\'',
    [userId]
  );

  return result?.map(r => r.task_id) || [];
}
