/**
 * Project Service
 * Handles project CRUD operations with permission checks
 */

import { query, queryOne, buildInsert, execute } from '@/lib/db';
import { canCreateProject, getUserContext } from '@/lib/services/taskPermissionService';

export interface Project {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  owner_id?: string;
  owner_name?: string;
  start_date?: string;
  end_date?: string;
  budget_amount: number;
  status: 'active' | 'completed' | 'archived' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface ProjectCreateInput {
  name: string;
  description?: string;
  company_id: string;
  start_date?: string;
  end_date?: string;
  budget_amount?: number;
}

/**
 * Create a new project
 * @param userId - User creating the project
 * @param data - Project data
 * @returns Created project
 */
export async function createProject(
  userId: string,
  data: ProjectCreateInput
): Promise<Project> {
  const user = await getUserContext(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const canCreate = await canCreateProject(userId, data.company_id);
  if (!canCreate) {
    throw new Error('Permission denied: Only managers and above can create projects');
  }

  const projectId = `proj_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  const { text, params } = buildInsert('projects', {
    id: projectId,
    company_id: data.company_id,
    name: data.name,
    description: data.description,
    owner_id: userId,
    start_date: data.start_date,
    end_date: data.end_date,
    budget_amount: data.budget_amount ?? 0,
    status: 'active',
  });

  const project = await queryOne<Project>(text, params);
  if (!project) {
    throw new Error('Failed to create project');
  }

  return project;
}

/**
 * Get all projects for a user (permission-filtered: assignable projects)
 * @param userId - User ID
 * @param companyId - Optional company filter
 * @returns Array of assignable projects
 */
export async function getProjectsForUser(
  userId: string,
  companyId?: string
): Promise<Project[]> {
  const user = await getUserContext(userId);
  if (!user) {
    return [];
  }

  // Ưu tiên công ty ĐANG LÀM VIỆC (route truyền vào từ effective context) rồi mới
  // fallback công ty chính — để user kiêm nhiệm thấy đúng dự án công ty đang chọn.
  const userCompanyId = companyId || user.company_id;
  if (!userCompanyId) {
    return [];
  }

  let sql = `
    SELECT * FROM projects
    WHERE company_id = $1 AND status = 'active'
    ORDER BY created_at DESC
  `;
  const params: any[] = [userCompanyId];

  const projects = await query<Project>(sql, params);
  return projects || [];
}

/**
 * Get project by ID
 * @param projectId - Project ID
 * @returns Project object or null
 */
export async function getProjectById(projectId: string): Promise<Project | null> {
  return await queryOne<Project>(
    'SELECT * FROM projects WHERE id = $1',
    [projectId]
  );
}

/**
 * Validate if user can assign tasks to a project
 * @param userId - User ID
 * @param projectId - Project ID
 * @returns Boolean indicating permission
 */
export async function validateProjectAccess(
  userId: string,
  projectId: string
): Promise<boolean> {
  const user = await getUserContext(userId);
  if (!user) {
    return false;
  }

  const project = await getProjectById(projectId);
  if (!project) {
    return false;
  }

  // User must be in the same company
  if (user.company_id && user.company_id !== project.company_id) {
    return false;
  }

  return true;
}

/**
 * Update project
 * @param projectId - Project ID
 * @param updates - Fields to update
 * @returns Updated project
 */
export async function updateProject(
  projectId: string,
  updates: Partial<Omit<ProjectCreateInput, 'company_id'>>
): Promise<Project> {
  const updateData: Record<string, any> = { updated_at: new Date().toISOString() };

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.start_date !== undefined) updateData.start_date = updates.start_date;
  if (updates.end_date !== undefined) updateData.end_date = updates.end_date;
  if (updates.budget_amount !== undefined) updateData.budget_amount = updates.budget_amount;

  const cols = Object.keys(updateData);
  const vals = Object.values(updateData);
  const assignments = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
  const sql = `UPDATE projects SET ${assignments} WHERE id = $${cols.length + 1} RETURNING *`;

  const project = await queryOne<Project>(sql, [...vals, projectId]);
  if (!project) {
    throw new Error('Project not found');
  }

  return project;
}

/**
 * Archive a project
 * @param projectId - Project ID
 * @returns Updated project
 */
export async function archiveProject(projectId: string): Promise<Project> {
  return await updateProject(projectId, {});
  // Then update status
  const sql = `
    UPDATE projects
    SET status = 'archived', updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;
  const project = await queryOne<Project>(sql, [projectId]);
  if (!project) {
    throw new Error('Project not found');
  }
  return project!;
}

/**
 * Get total task count for a project
 * @param projectId - Project ID
 * @returns Task count
 */
export async function getProjectTaskCount(projectId: string): Promise<number> {
  const result = await queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM tasks WHERE project_id = $1 AND archived_at IS NULL',
    [projectId]
  );
  return result?.count ?? 0;
}
