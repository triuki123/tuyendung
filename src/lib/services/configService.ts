import { query, queryOne, execute } from '@/lib/db';

export interface SystemConfig {
  id?: string;
  type: 'role' | 'department' | 'company';
  name: string;
  created_at?: string;
  created_by?: string;
}

export async function getSystemConfigs(type: 'role' | 'department' | 'company'): Promise<string[]> {
  const rows = await query<{ name: string }>(
    'SELECT name FROM system_configs WHERE type = $1 ORDER BY name ASC',
    [type]
  );
  return rows.map(r => r.name);
}

export async function addSystemConfig(
  type: 'role' | 'department' | 'company',
  name: string,
  createdBy: string = 'system'
): Promise<SystemConfig> {
  if (!name || name.trim() === '') {
    throw new Error('Name cannot be empty');
  }

  const now = new Date().toISOString();
  const trimmedName = name.trim();

  try {
    const row = await queryOne<SystemConfig>(
      `INSERT INTO system_configs (type, name, created_at, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [type, trimmedName, now, createdBy]
    );
    if (!row) throw new Error('Failed to create system config');
    return row;
  } catch (err: any) {
    if (err.message?.includes('duplicate') || err.code === '23505') {
      throw new Error(`${name} already exists`);
    }
    throw new Error(err.message);
  }
}

export async function getAllSystemConfigs(): Promise<{
  roles: string[];
  departments: string[];
  companies: string[];
}> {
  const [roles, departments, companies] = await Promise.all([
    getSystemConfigs('role'),
    getSystemConfigs('department'),
    getSystemConfigs('company'),
  ]);

  return { roles, departments, companies };
}
