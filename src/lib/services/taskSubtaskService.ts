/**
 * Task Subtask Service
 * Handles all subtask operations including CRUD, completion calculation, and reordering
 */

import { query, queryOne, buildInsert, execute } from '@/lib/db';

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  assigned_to?: string;
  assigned_to_name?: string;
  due_date?: string;
  completion_percentage: number;
  order_index: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
}

export interface SubtaskCreateInput {
  title: string;
  description?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  due_date?: string;
  order_index?: number;
}

export interface SubtaskUpdateInput {
  title?: string;
  description?: string;
  status?: 'todo' | 'in_progress' | 'done' | 'cancelled';
  assigned_to?: string;
  assigned_to_name?: string;
  due_date?: string;
  completion_percentage?: number;
}

/**
 * Create a new subtask
 * @param taskId - Parent task ID
 * @param userId - User creating the subtask
 * @param data - Subtask data
 * @returns Created subtask object
 */
export async function createSubtask(
  taskId: string,
  userId: string,
  data: SubtaskCreateInput
): Promise<Subtask> {
  const subtaskId = `st_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // order_index tự tăng: bảng có UNIQUE(task_id, order_index), nếu để mặc định 0
  // thì subtask thứ 2 trở đi sẽ vi phạm ràng buộc → 500. Lấy max hiện tại + 1.
  let orderIndex = data.order_index;
  if (orderIndex === undefined) {
    const maxRow = await queryOne<{ max_index: number | string | null }>(
      'SELECT MAX("order_index") AS max_index FROM task_subtasks WHERE task_id = $1',
      [taskId]
    );
    orderIndex = (maxRow?.max_index != null ? Number(maxRow.max_index) : -1) + 1;
  }

  const { text, params } = buildInsert('task_subtasks', {
    id: subtaskId,
    task_id: taskId,
    title: data.title,
    description: data.description,
    status: 'todo',
    assigned_to: data.assigned_to,
    assigned_to_name: data.assigned_to_name,
    due_date: data.due_date,
    completion_percentage: 0,
    order_index: orderIndex,
    created_by: userId,
  });

  const subtask = await queryOne<Subtask>(text, params);
  if (!subtask) {
    throw new Error('Failed to create subtask');
  }

  return subtask;
}

/**
 * Update a subtask
 * @param subtaskId - Subtask ID
 * @param data - Data to update
 * @returns Updated subtask object
 */
export async function updateSubtask(
  subtaskId: string,
  data: SubtaskUpdateInput
): Promise<Subtask> {
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };

  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.status !== undefined) updates.status = data.status;
  if (data.assigned_to !== undefined) updates.assigned_to = data.assigned_to;
  if (data.assigned_to_name !== undefined) updates.assigned_to_name = data.assigned_to_name;
  if (data.due_date !== undefined) updates.due_date = data.due_date;
  if (data.completion_percentage !== undefined) updates.completion_percentage = data.completion_percentage;

  const cols = Object.keys(updates);
  const vals = Object.values(updates);
  const assignments = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
  const sql = `UPDATE task_subtasks SET ${assignments} WHERE id = $${cols.length + 1} RETURNING *`;

  const subtask = await queryOne<Subtask>(sql, [...vals, subtaskId]);
  if (!subtask) {
    throw new Error('Subtask not found');
  }

  return subtask;
}

/**
 * Delete a subtask
 * @param subtaskId - Subtask ID
 * @returns Number of rows deleted
 */
export async function deleteSubtask(subtaskId: string): Promise<number> {
  const rowCount = await execute('DELETE FROM task_subtasks WHERE id = $1', [subtaskId]);
  return rowCount;
}

/**
 * Get all subtasks for a task
 * @param taskId - Parent task ID
 * @param includeArchived - Include archived subtasks
 * @returns Array of subtasks
 */
export async function getSubtasks(
  taskId: string,
  includeArchived: boolean = false
): Promise<Subtask[]> {
  let sql = 'SELECT * FROM task_subtasks WHERE task_id = $1';
  const params: any[] = [taskId];

  if (!includeArchived) {
    sql += ' AND archived_at IS NULL';
  }

  sql += ' ORDER BY "order_index" ASC, created_at ASC';

  const subtasks = await query<Subtask>(sql, params);
  return subtasks || [];
}

/**
 * Get a single subtask by ID
 * @param subtaskId - Subtask ID
 * @returns Subtask object
 */
export async function getSubtaskById(subtaskId: string): Promise<Subtask | null> {
  return await queryOne<Subtask>(
    'SELECT * FROM task_subtasks WHERE id = $1',
    [subtaskId]
  );
}

/**
 * Update subtask status
 * @param subtaskId - Subtask ID
 * @param newStatus - New status value
 * @returns Updated subtask
 */
export async function updateSubtaskStatus(
  subtaskId: string,
  newStatus: 'todo' | 'in_progress' | 'done' | 'cancelled'
): Promise<Subtask> {
  return updateSubtask(subtaskId, { status: newStatus });
}

/**
 * Reorder subtasks by updating their order_index
 * @param taskId - Parent task ID
 * @param subtaskIds - Array of subtask IDs in new order
 * @returns Array of updated subtasks
 */
export async function reorderSubtasks(
  taskId: string,
  subtaskIds: string[]
): Promise<Subtask[]> {
  const updates = subtaskIds.map((id, index) => ({
    id,
    order_index: index,
  }));

  const reorderedSubtasks: Subtask[] = [];

  for (const update of updates) {
    const subtask = await updateSubtask(update.id, {});
    // Update order_index directly
    const sql = `UPDATE task_subtasks SET "order_index" = $1, updated_at = NOW() WHERE id = $2 RETURNING *`;
    const updated = await queryOne<Subtask>(sql, [update.order_index, update.id]);
    if (updated) {
      reorderedSubtasks.push(updated);
    }
  }

  return reorderedSubtasks;
}

/**
 * Calculate task completion percentage from subtasks
 * @param taskId - Parent task ID
 * @returns Completion percentage (0-100)
 */
export async function calculateTaskCompletion(taskId: string): Promise<number> {
  const result = await queryOne<{ total: number; done: number }>(
    `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done
    FROM task_subtasks
    WHERE task_id = $1 AND archived_at IS NULL
    `,
    [taskId]
  );

  if (!result || result.total === 0) {
    return 0;
  }

  const percentage = Math.round((result.done / result.total) * 100);
  return Math.max(0, Math.min(100, percentage)); // Clamp 0-100
}

/**
 * Get subtask completion summary
 * @param taskId - Parent task ID
 * @returns Object with total, done, and percentage
 */
export async function getSubtaskCompletion(
  taskId: string
): Promise<{ total: number; done: number; percentage: number }> {
  const result = await queryOne<{ total: number; done: number }>(
    `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done
    FROM task_subtasks
    WHERE task_id = $1 AND archived_at IS NULL
    `,
    [taskId]
  );

  const total = result?.total ?? 0;
  const done = result?.done ?? 0;
  const percentage = total === 0 ? 0 : Math.round((done / total) * 100);

  return {
    total,
    done,
    percentage,
  };
}

/**
 * Archive a subtask
 * @param subtaskId - Subtask ID
 * @returns Updated subtask
 */
export async function archiveSubtask(subtaskId: string): Promise<Subtask> {
  const sql = `
    UPDATE task_subtasks
    SET archived_at = NOW(), updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;
  const subtask = await queryOne<Subtask>(sql, [subtaskId]);
  if (!subtask) {
    throw new Error('Subtask not found');
  }
  return subtask;
}

/**
 * Unarchive a subtask
 * @param subtaskId - Subtask ID
 * @returns Updated subtask
 */
export async function unarchiveSubtask(subtaskId: string): Promise<Subtask> {
  const sql = `
    UPDATE task_subtasks
    SET archived_at = NULL, updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;
  const subtask = await queryOne<Subtask>(sql, [subtaskId]);
  if (!subtask) {
    throw new Error('Subtask not found');
  }
  return subtask;
}

/**
 * Get total estimated vs actual hours for task from subtasks
 * @param taskId - Parent task ID
 * @returns Object with estimated and actual hours
 */
export async function getSubtaskHoursSummary(
  taskId: string
): Promise<{ estimated: number; actual: number; completed: number }> {
  const result = await queryOne<{ completed: number }>(
    `
    SELECT
      COUNT(CASE WHEN status = 'done' THEN 1 END) as completed
    FROM task_subtasks
    WHERE task_id = $1 AND archived_at IS NULL
    `,
    [taskId]
  );

  return {
    estimated: 0, // Would come from estimated_hours in tasks table
    actual: 0,    // Would come from actual_hours in tasks table
    completed: result?.completed ?? 0,
  };
}
