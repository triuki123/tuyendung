/**
 * Milestone Service
 * Handles milestone CRUD operations tied to projects
 */

import { query, queryOne, buildInsert, execute } from '@/lib/db';

export interface Milestone {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  target_date: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface MilestoneCreateInput {
  project_id: string;
  name: string;
  description?: string;
  target_date: string;
}

/**
 * Create a new milestone
 * @param data - Milestone data
 * @returns Created milestone
 */
export async function createMilestone(data: MilestoneCreateInput): Promise<Milestone> {
  const milestoneId = `mile_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  const { text, params } = buildInsert('milestones', {
    id: milestoneId,
    project_id: data.project_id,
    name: data.name,
    description: data.description,
    target_date: data.target_date,
    status: 'pending',
  });

  const milestone = await queryOne<Milestone>(text, params);
  if (!milestone) {
    throw new Error('Failed to create milestone');
  }

  return milestone;
}

/**
 * Get all milestones for a project
 * @param projectId - Project ID
 * @param includeArchived - Include archived milestones
 * @returns Array of milestones
 */
export async function getMilestones(
  projectId: string,
  includeArchived: boolean = false
): Promise<Milestone[]> {
  let sql = 'SELECT * FROM milestones WHERE project_id = $1';
  const params: any[] = [projectId];

  if (!includeArchived) {
    sql += ' AND status != \'cancelled\'';
  }

  sql += ' ORDER BY target_date ASC, created_at ASC';

  const milestones = await query<Milestone>(sql, params);
  return milestones || [];
}

/**
 * Get a single milestone by ID
 * @param milestoneId - Milestone ID
 * @returns Milestone object or null
 */
export async function getMilestoneById(milestoneId: string): Promise<Milestone | null> {
  return await queryOne<Milestone>(
    'SELECT * FROM milestones WHERE id = $1',
    [milestoneId]
  );
}

/**
 * Update a milestone
 * @param milestoneId - Milestone ID
 * @param updates - Fields to update
 * @returns Updated milestone
 */
export async function updateMilestone(
  milestoneId: string,
  updates: Partial<Omit<MilestoneCreateInput, 'project_id'>> & { status?: string }
): Promise<Milestone> {
  const updateData: Record<string, any> = { updated_at: new Date().toISOString() };

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.target_date !== undefined) updateData.target_date = updates.target_date;
  if (updates.status !== undefined) updateData.status = updates.status;

  const cols = Object.keys(updateData);
  const vals = Object.values(updateData);
  const assignments = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
  const sql = `UPDATE milestones SET ${assignments} WHERE id = $${cols.length + 1} RETURNING *`;

  const milestone = await queryOne<Milestone>(sql, [...vals, milestoneId]);
  if (!milestone) {
    throw new Error('Milestone not found');
  }

  return milestone;
}

/**
 * Complete a milestone
 * @param milestoneId - Milestone ID
 * @returns Updated milestone
 */
export async function completeMilestone(milestoneId: string): Promise<Milestone> {
  return await updateMilestone(milestoneId, { status: 'completed' });
}

/**
 * Get milestone with task count
 * @param milestoneId - Milestone ID
 * @returns Milestone with task count
 */
export async function getMilestoneWithTaskCount(
  milestoneId: string
): Promise<(Milestone & { task_count: number }) | null> {
  const sql = `
    SELECT
      m.*,
      COUNT(t.id) as task_count
    FROM milestones m
    LEFT JOIN tasks t ON m.id = t.milestone_id AND t.archived_at IS NULL
    WHERE m.id = $1
    GROUP BY m.id
  `;

  return await queryOne<Milestone & { task_count: number }>(sql, [milestoneId]);
}

/**
 * Get milestones with task completion stats
 * @param projectId - Project ID
 * @returns Array of milestones with stats
 */
export async function getMilestonesWithStats(
  projectId: string
): Promise<(Milestone & { task_count: number; completed_count: number })[]> {
  const sql = `
    SELECT
      m.*,
      COUNT(t.id) as task_count,
      COUNT(CASE WHEN t.status = 'done' THEN 1 END) as completed_count
    FROM milestones m
    LEFT JOIN tasks t ON m.id = t.milestone_id AND t.archived_at IS NULL
    WHERE m.project_id = $1
    GROUP BY m.id
    ORDER BY m.target_date ASC, m.created_at ASC
  `;

  const milestones = await query<Milestone & { task_count: number; completed_count: number }>(
    sql,
    [projectId]
  );
  return milestones || [];
}
