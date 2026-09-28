/**
 * Task Time Tracking Service
 * Handles time entry logging, aggregation, and utilization calculations
 */

import { query, queryOne, buildInsert, execute } from '@/lib/db';

export interface TimeEntry {
  id: string;
  task_id: string;
  subtask_id?: string | null;
  user_id?: string;
  user_name?: string;
  duration_minutes: number;
  date_worked: string;
  description?: string;
  is_billable: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface TimeEntryCreateInput {
  duration_minutes: number;
  date_worked: string;
  description?: string;
  is_billable?: boolean;
  subtask_id?: string;
}

export interface TimeEntryUpdateInput {
  duration_minutes?: number;
  date_worked?: string;
  description?: string;
  is_billable?: boolean;
}

export interface TimeAggregate {
  total_duration_minutes: number;
  total_duration_hours: number;
  billable_minutes: number;
  billable_hours: number;
  entry_count: number;
  last_entry_date: string | null;
}

export interface TimeUtilization {
  estimated_hours: number | null;
  actual_hours: number;
  remaining_hours: number;
  utilization_percentage: number;
  is_overbudget: boolean;
}

/**
 * Log time on a task
 * @param taskId - Task ID
 * @param userId - User logging time
 * @param userName - User name for audit
 * @param data - Time entry data
 * @returns Created time entry
 */
export async function logTime(
  taskId: string,
  userId: string,
  userName: string,
  data: TimeEntryCreateInput
): Promise<TimeEntry> {
  const entryId = `te_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  const { text, params } = buildInsert('task_time_entries', {
    id: entryId,
    task_id: taskId,
    subtask_id: data.subtask_id,
    user_id: userId,
    user_name: userName,
    duration_minutes: data.duration_minutes,
    date_worked: data.date_worked,
    description: data.description,
    is_billable: data.is_billable ?? true,
  });

  const entry = await queryOne<TimeEntry>(text, params);
  if (!entry) {
    throw new Error('Failed to create time entry');
  }

  // Update task actual_hours
  await updateTaskActualHours(taskId);

  return entry;
}

/**
 * Update a time entry
 * @param entryId - Time entry ID
 * @param data - Data to update
 * @returns Updated time entry
 */
export async function updateTimeEntry(
  entryId: string,
  data: TimeEntryUpdateInput
): Promise<TimeEntry> {
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };

  if (data.duration_minutes !== undefined) updates.duration_minutes = data.duration_minutes;
  if (data.date_worked !== undefined) updates.date_worked = data.date_worked;
  if (data.description !== undefined) updates.description = data.description;
  if (data.is_billable !== undefined) updates.is_billable = data.is_billable;

  const cols = Object.keys(updates);
  const vals = Object.values(updates);
  const assignments = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
  const sql = `UPDATE task_time_entries SET ${assignments} WHERE id = $${cols.length + 1} RETURNING *`;

  const entry = await queryOne<TimeEntry>(sql, [...vals, entryId]);
  if (!entry) {
    throw new Error('Time entry not found');
  }

  // Update task actual_hours
  await updateTaskActualHours(entry.task_id);

  return entry;
}

/**
 * Delete a time entry (soft delete)
 * @param entryId - Time entry ID
 * @returns Number of rows updated
 */
export async function deleteTimeEntry(entryId: string): Promise<number> {
  const entry = await queryOne<TimeEntry>(
    'SELECT task_id FROM task_time_entries WHERE id = $1',
    [entryId]
  );

  const rowCount = await execute(
    'UPDATE task_time_entries SET deleted_at = NOW() WHERE id = $1',
    [entryId]
  );

  if (entry) {
    await updateTaskActualHours(entry.task_id);
  }

  return rowCount;
}

/**
 * Hard delete a time entry (admin only)
 * @param entryId - Time entry ID
 * @returns Number of rows deleted
 */
export async function permanentlyDeleteTimeEntry(entryId: string): Promise<number> {
  const entry = await queryOne<TimeEntry>(
    'SELECT task_id FROM task_time_entries WHERE id = $1',
    [entryId]
  );

  const rowCount = await execute(
    'DELETE FROM task_time_entries WHERE id = $1',
    [entryId]
  );

  if (entry) {
    await updateTaskActualHours(entry.task_id);
  }

  return rowCount;
}

/**
 * Get all time entries for a task
 * @param taskId - Task ID
 * @param options - Filter options
 * @returns Array of time entries
 */
export async function getTimeEntries(
  taskId: string,
  options?: {
    userId?: string;
    dateFrom?: string;
    dateTo?: string;
    includeBillableOnly?: boolean;
    includeDeleted?: boolean;
  }
): Promise<TimeEntry[]> {
  let sql = 'SELECT * FROM task_time_entries WHERE task_id = $1';
  const params: any[] = [taskId];

  if (options?.userId) {
    params.push(options.userId);
    sql += ` AND user_id = $${params.length}`;
  }

  if (options?.dateFrom) {
    params.push(options.dateFrom);
    sql += ` AND date_worked >= $${params.length}`;
  }

  if (options?.dateTo) {
    params.push(options.dateTo);
    sql += ` AND date_worked <= $${params.length}`;
  }

  if (options?.includeBillableOnly) {
    sql += ` AND is_billable = true`;
  }

  if (!options?.includeDeleted) {
    sql += ` AND deleted_at IS NULL`;
  }

  sql += ' ORDER BY date_worked DESC, created_at DESC';

  const entries = await query<TimeEntry>(sql, params);
  return entries || [];
}

/**
 * Get time aggregate (total, billable, count) for a task
 * @param taskId - Task ID
 * @param includeBillableOnly - Only count billable entries
 * @returns Aggregated time data
 */
export async function getTimeAggregate(
  taskId: string,
  includeBillableOnly: boolean = false
): Promise<TimeAggregate> {
  let sql = `
    SELECT
      COALESCE(SUM(duration_minutes), 0) as total_duration_minutes,
      COALESCE(SUM(CASE WHEN is_billable THEN duration_minutes ELSE 0 END), 0) as billable_minutes,
      COUNT(*) as entry_count,
      MAX(date_worked) as last_entry_date
    FROM task_time_entries
    WHERE task_id = $1 AND deleted_at IS NULL
  `;

  if (includeBillableOnly) {
    sql += ' AND is_billable = true';
  }

  const result = await queryOne<{
    total_duration_minutes: number;
    billable_minutes: number;
    entry_count: number;
    last_entry_date: string | null;
  }>(sql, [taskId]);

  if (!result) {
    return {
      total_duration_minutes: 0,
      total_duration_hours: 0,
      billable_minutes: 0,
      billable_hours: 0,
      entry_count: 0,
      last_entry_date: null,
    };
  }

  return {
    total_duration_minutes: result.total_duration_minutes,
    total_duration_hours: Math.round((result.total_duration_minutes / 60) * 100) / 100,
    billable_minutes: result.billable_minutes,
    billable_hours: Math.round((result.billable_minutes / 60) * 100) / 100,
    entry_count: result.entry_count,
    last_entry_date: result.last_entry_date,
  };
}

/**
 * Calculate time utilization (estimated vs actual)
 * @param taskId - Task ID
 * @returns Utilization metrics
 */
export async function calculateUtilization(taskId: string): Promise<TimeUtilization> {
  const taskResult = await queryOne<{
    estimated_hours: number | null;
    actual_hours: number;
  }>(
    'SELECT estimated_hours, actual_hours FROM tasks WHERE id = $1',
    [taskId]
  );

  if (!taskResult) {
    throw new Error('Task not found');
  }

  const estimated = taskResult.estimated_hours ?? 0;
  const actual = taskResult.actual_hours ?? 0;
  const remaining = Math.max(0, estimated - actual);
  const utilization = estimated === 0 ? 0 : Math.round((actual / estimated) * 100);
  const isOverbudget = actual > estimated && estimated > 0;

  return {
    estimated_hours: taskResult.estimated_hours,
    actual_hours: actual,
    remaining_hours: remaining,
    utilization_percentage: utilization,
    is_overbudget: isOverbudget,
  };
}

/**
 * Update task actual_hours by summing all time entries
 * Internal function called after time entry changes
 * @param taskId - Task ID
 */
async function updateTaskActualHours(taskId: string): Promise<void> {
  const result = await queryOne<{ total_minutes: number }>(
    `
    SELECT COALESCE(SUM(duration_minutes), 0) as total_minutes
    FROM task_time_entries
    WHERE task_id = $1 AND deleted_at IS NULL
    `,
    [taskId]
  );

  const totalHours = (result?.total_minutes ?? 0) / 60;

  await execute(
    'UPDATE tasks SET actual_hours = $1, updated_at = NOW() WHERE id = $2',
    [totalHours, taskId]
  );
}

/**
 * Get time entry summary for display
 * @param taskId - Task ID
 * @returns Summary object with formatted data
 */
export async function getTimeSummary(
  taskId: string
): Promise<{
  total_hours: number;
  billable_hours: number;
  entry_count: number;
  utilization: TimeUtilization;
  last_entry: string | null;
}> {
  const aggregate = await getTimeAggregate(taskId);
  const utilization = await calculateUtilization(taskId);

  return {
    total_hours: aggregate.total_duration_hours,
    billable_hours: aggregate.billable_hours,
    entry_count: aggregate.entry_count,
    utilization,
    last_entry: aggregate.last_entry_date,
  };
}

/**
 * Get time entries for a specific user
 * @param userId - User ID
 * @param dateFrom - Start date (YYYY-MM-DD)
 * @param dateTo - End date (YYYY-MM-DD)
 * @returns Array of time entries
 */
export async function getUserTimeEntries(
  userId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<TimeEntry[]> {
  let sql = 'SELECT * FROM task_time_entries WHERE user_id = $1 AND deleted_at IS NULL';
  const params: any[] = [userId];

  if (dateFrom) {
    params.push(dateFrom);
    sql += ` AND date_worked >= $${params.length}`;
  }

  if (dateTo) {
    params.push(dateTo);
    sql += ` AND date_worked <= $${params.length}`;
  }

  sql += ' ORDER BY date_worked DESC, created_at DESC';

  const entries = await query<TimeEntry>(sql, params);
  return entries || [];
}

/**
 * Get billable hours for invoicing
 * @param taskId - Task ID
 * @param startDate - Start date
 * @param endDate - End date
 * @returns Billable hours data
 */
export async function getBillableHours(
  taskId: string,
  startDate?: string,
  endDate?: string
): Promise<{
  billable_minutes: number;
  billable_hours: number;
  entry_count: number;
}> {
  let sql = `
    SELECT
      COALESCE(SUM(duration_minutes), 0) as billable_minutes,
      COUNT(*) as entry_count
    FROM task_time_entries
    WHERE task_id = $1 AND is_billable = true AND deleted_at IS NULL
  `;
  const params: any[] = [taskId];

  if (startDate) {
    params.push(startDate);
    sql += ` AND date_worked >= $${params.length}`;
  }

  if (endDate) {
    params.push(endDate);
    sql += ` AND date_worked <= $${params.length}`;
  }

  const result = await queryOne<{
    billable_minutes: number;
    entry_count: number;
  }>(sql, params);

  const billableMinutes = result?.billable_minutes ?? 0;

  return {
    billable_minutes: billableMinutes,
    billable_hours: Math.round((billableMinutes / 60) * 100) / 100,
    entry_count: result?.entry_count ?? 0,
  };
}
