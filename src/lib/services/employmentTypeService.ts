import { query, queryOne, buildUpdateById } from '@/lib/db';

export interface EmploymentType {
  id: string;
  name: string;
  description: string | null;
  default_duration_days: number | null;
  requires_evaluation: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export async function listEmploymentTypes(all = false): Promise<EmploymentType[]> {
  const where = all ? '' : `WHERE is_active = true`;
  return query<EmploymentType>(
    `SELECT * FROM employment_types ${where} ORDER BY sort_order ASC, name ASC`
  );
}

export async function getEmploymentType(id: string): Promise<EmploymentType | null> {
  return queryOne<EmploymentType>(`SELECT * FROM employment_types WHERE id = $1`, [id]);
}

export async function createEmploymentType(data: {
  name: string;
  description?: string | null;
  default_duration_days?: number | null;
  requires_evaluation?: boolean;
  sort_order?: number;
}): Promise<EmploymentType> {
  const id = `etype_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const row = await queryOne<EmploymentType>(
    `INSERT INTO employment_types (id, name, description, default_duration_days, requires_evaluation, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      id,
      data.name.trim(),
      data.description ?? null,
      data.default_duration_days ?? null,
      data.requires_evaluation ?? false,
      data.sort_order ?? 0,
    ]
  );
  return row as EmploymentType;
}

export async function updateEmploymentType(
  id: string,
  data: Partial<{
    name: string;
    description: string | null;
    default_duration_days: number | null;
    requires_evaluation: boolean;
    sort_order: number;
    is_active: boolean;
  }>
): Promise<EmploymentType | null> {
  const update: Record<string, any> = {};
  if (data.name !== undefined) update.name = data.name.trim();
  if (data.description !== undefined) update.description = data.description;
  if (data.default_duration_days !== undefined) update.default_duration_days = data.default_duration_days;
  if (data.requires_evaluation !== undefined) update.requires_evaluation = data.requires_evaluation;
  if (data.sort_order !== undefined) update.sort_order = data.sort_order;
  if (data.is_active !== undefined) update.is_active = data.is_active;
  if (!Object.keys(update).length) return getEmploymentType(id);
  const { text, params } = buildUpdateById('employment_types', id, update);
  return queryOne<EmploymentType>(text, params);
}

export async function deactivateEmploymentType(id: string): Promise<EmploymentType | null> {
  return queryOne<EmploymentType>(
    `UPDATE employment_types SET is_active = false WHERE id = $1 RETURNING *`,
    [id]
  );
}

/** Tính ngày kết thúc thử việc: dùng override của user, nếu không có thì dùng default của loại. */
export function calcProbationEndDate(
  hireDate: string,
  durationDays: number
): string {
  const d = new Date(hireDate);
  d.setDate(d.getDate() + durationDays);
  return d.toISOString().slice(0, 10);
}
