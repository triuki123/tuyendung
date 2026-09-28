import { query, queryOne, execute, buildInsert, buildUpdateById } from '@/lib/db';

export interface JobTitle {
  id: string;
  company_id: string;
  title: string;
  description?: string;
  /** Cấp bậc 1-5 (1=Ban lãnh đạo … 5=Thực tập) — khai báo qua UI, KHÔNG đoán theo tên */
  rank?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Get all job titles for a company
 */
export async function getJobTitlesByCompany(companyId: string, includeInactive = false): Promise<JobTitle[]> {
  if (includeInactive) {
    return query<JobTitle>(
      'SELECT id, company_id, title, description, "rank", is_active, created_at, updated_at FROM job_titles WHERE company_id = $1 ORDER BY title ASC',
      [companyId]
    );
  }
  return query<JobTitle>(
    'SELECT id, company_id, title, description, "rank", is_active, created_at, updated_at FROM job_titles WHERE company_id = $1 AND is_active = $2 ORDER BY title ASC',
    [companyId, true]
  );
}

/**
 * Get every active job title across all companies (no company filter).
 */
export async function getAllJobTitles(): Promise<JobTitle[]> {
  return query<JobTitle>(
    'SELECT id, company_id, title, description, "rank", is_active, created_at, updated_at FROM job_titles WHERE is_active = $1 ORDER BY title ASC',
    [true]
  );
}

/**
 * Get job titles for a company with optional filtering and pagination
 */
export async function getJobTitles(
  companyId: string,
  filters?: { department_id?: string; position_id?: string },
  pagination?: { page: number; limit: number; search?: string }
): Promise<{ data: JobTitle[]; count: number; page: number; limit: number }> {
  const page = pagination?.page || 1;
  const limit = pagination?.limit || 20;
  const offset = (page - 1) * limit;

  let baseWhere = 'WHERE company_id = $1 AND is_active = $2';
  const baseParams: any[] = [companyId, true];

  if (pagination?.search) {
    baseParams.push(`%${pagination.search}%`);
    baseWhere += ` AND title ILIKE $${baseParams.length}`;
  }

  const countRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM job_titles ${baseWhere}`,
    baseParams
  );

  const dataParams = [...baseParams, limit, offset];
  const rows = await query<JobTitle>(
    `SELECT id, company_id, title, description, is_active, created_at, updated_at
     FROM job_titles ${baseWhere}
     ORDER BY title ASC
     LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams
  );

  return {
    data: rows,
    count: countRow?.count ? Number(countRow.count) : 0,
    page,
    limit,
  };
}

/**
 * Get job titles grouped by first letter (replaces salary-band grouping)
 */
export async function getJobTitlesBySalaryBand(companyId: string): Promise<Record<string, JobTitle[]>> {
  const rows = await query<JobTitle>(
    'SELECT id, company_id, title, description, is_active FROM job_titles WHERE company_id = $1 AND is_active = $2 ORDER BY title ASC',
    [companyId, true]
  );

  const grouped: Record<string, JobTitle[]> = {};
  rows.forEach(job => {
    const band = job.title.charAt(0).toUpperCase();
    if (!grouped[band]) grouped[band] = [];
    grouped[band].push(job);
  });

  return grouped;
}

/**
 * Get a single job title by ID
 */
export async function getJobTitleById(id: string): Promise<JobTitle | null> {
  return queryOne<JobTitle>(
    'SELECT * FROM job_titles WHERE id = $1',
    [id]
  );
}

/**
 * Create a new job title
 */
export async function createJobTitle(
  companyId: string,
  data: { title: string; description?: string; rank?: number },
  createdBy?: string
): Promise<JobTitle> {
  const now = new Date().toISOString();
  const insertData: Record<string, any> = {
    company_id: companyId,
    title: data.title,
    description: data.description || '',
    is_active: true,
    created_at: now,
    updated_at: now,
  };
  // Cấp bậc khai báo tường minh (1-5); không truyền → DB default 4
  if (data.rank !== undefined && Number.isInteger(Number(data.rank)) && Number(data.rank) >= 1) {
    insertData.rank = Number(data.rank);
  }

  if (createdBy && isValidUUID(createdBy)) {
    insertData.created_by = createdBy;
    insertData.updated_by = createdBy;
  }

  const { text, params } = buildInsert('job_titles', insertData);
  const row = await queryOne<JobTitle>(text, params);
  if (!row) throw new Error('Failed to create job title');

  if (row.id && createdBy && isValidUUID(createdBy)) {
    await addAuditLog('CREATE', row.id, `Created job title: ${data.title}`, createdBy, 'job_titles');
  }

  return row;
}

/**
 * Update a job title
 */
export async function updateJobTitle(
  id: string,
  data: Partial<{ title: string; description: string; is_active: boolean; rank: number }>,
  updatedBy?: string
): Promise<JobTitle | null> {
  const jobTitle = await getJobTitleById(id);
  if (!jobTitle) return null;

  const now = new Date().toISOString();
  const changes: string[] = [];

  if (data.title && data.title !== jobTitle.title) {
    changes.push(`title: ${jobTitle.title} → ${data.title}`);
  }
  if (data.description !== undefined && data.description !== jobTitle.description) {
    changes.push(`description: updated`);
  }
  if (data.is_active !== undefined && data.is_active !== jobTitle.is_active) {
    changes.push(`is_active: ${jobTitle.is_active} → ${data.is_active}`);
  }

  const updateData: Record<string, any> = { updated_at: now };

  if (data.title) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;
  if (data.rank !== undefined && Number.isInteger(Number(data.rank)) && Number(data.rank) >= 1) {
    updateData.rank = Number(data.rank);
    if (Number(data.rank) !== (jobTitle as any).rank) {
      changes.push(`rank: ${(jobTitle as any).rank ?? '—'} → ${data.rank}`);
    }
  }

  if (updatedBy && isValidUUID(updatedBy)) {
    updateData.updated_by = updatedBy;
  }

  const { text, params } = buildUpdateById('job_titles', id, updateData);
  const row = await queryOne<JobTitle>(text, params);
  if (!row) throw new Error(`Job title not found: ${id}`);

  if (changes.length > 0 && updatedBy && isValidUUID(updatedBy)) {
    await addAuditLog('UPDATE', id, `Updated: ${changes.join(', ')}`, updatedBy, 'job_titles');
  }

  return row;
}

/**
 * Deactivate a job title (soft delete)
 */
export async function deactivateJobTitle(id: string, deactivatedBy?: string): Promise<JobTitle | null> {
  const now = new Date().toISOString();
  const updateData: Record<string, any> = { is_active: false, updated_at: now };

  if (deactivatedBy && isValidUUID(deactivatedBy)) {
    updateData.updated_by = deactivatedBy;
  }

  const { text, params } = buildUpdateById('job_titles', id, updateData);
  const row = await queryOne<JobTitle>(text, params);
  if (!row) throw new Error(`Job title not found: ${id}`);

  if (deactivatedBy && isValidUUID(deactivatedBy)) {
    await addAuditLog('DEACTIVATE', id, `Deactivated job title`, deactivatedBy, 'job_titles');
  }

  return row;
}

/**
 * Delete job title (alias for deactivateJobTitle)
 */
export async function deleteJobTitle(id: string, deletedBy?: string): Promise<JobTitle | null> {
  return deactivateJobTitle(id, deletedBy);
}

/**
 * Get job titles for cascading dropdown
 */
export async function getJobTitlesForCascading(companyId: string): Promise<Pick<JobTitle, 'id' | 'title' | 'description' | 'is_active'>[]> {
  return query(
    'SELECT id, title, description, is_active FROM job_titles WHERE company_id = $1 AND is_active = $2 ORDER BY title ASC',
    [companyId, true]
  );
}

/**
 * Add audit log
 */
export async function addAuditLog(
  action: string,
  jobTitleId: string,
  details: string,
  performedBy: string,
  table: string = 'job_titles'
): Promise<void> {
  try {
    await execute(
      `INSERT INTO audit_logs (action, details, admin_id) VALUES ($1, $2, $3)`,
      [action, details, performedBy]
    );
  } catch (err: any) {
    console.error('Audit log error:', err.message);
  }
}

function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}
