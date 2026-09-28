import { query, queryOne, execute, buildInsert, buildUpdateById } from '@/lib/db';

export interface SubDepartment {
  id: string;
  department_id: string;
  name: string;
  code?: string;
  description?: string;
  manager_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubDepartmentInput {
  department_id: string;
  name: string;
  code?: string;
  description?: string;
  manager_id?: string;
}

export const subDepartmentsService = {
  /**
   * Get all active sub_departments
   */
  async getAllSubDepartments(includeInactive: boolean = false): Promise<SubDepartment[]> {
    if (includeInactive) {
      return query<SubDepartment>('SELECT * FROM sub_departments ORDER BY name ASC');
    }
    return query<SubDepartment>(
      'SELECT * FROM sub_departments WHERE is_active = $1 ORDER BY name ASC',
      [true]
    );
  },

  /**
   * Get sub_departments by department ID
   */
  async getSubDepartmentsByDepartment(departmentId: string): Promise<SubDepartment[]> {
    return query<SubDepartment>(
      'SELECT * FROM sub_departments WHERE department_id = $1 AND is_active = $2 ORDER BY name ASC',
      [departmentId, true]
    );
  },

  /**
   * Get single sub_department by ID
   */
  async getSubDepartmentById(id: string): Promise<SubDepartment> {
    const row = await queryOne<SubDepartment>(
      'SELECT * FROM sub_departments WHERE id = $1',
      [id]
    );
    if (!row) throw new Error(`SubDepartment not found: ${id}`);
    return row;
  },

  /**
   * Search sub_departments
   */
  async searchSubDepartments(searchQuery: string): Promise<SubDepartment[]> {
    const pattern = `%${searchQuery}%`;
    return query<SubDepartment>(
      `SELECT * FROM sub_departments
       WHERE is_active = $1 AND (name ILIKE $2 OR code ILIKE $3)
       ORDER BY name ASC`,
      [true, pattern, pattern]
    );
  },

  /**
   * Create a new sub_department
   */
  async createSubDepartment(input: SubDepartmentInput & { created_by?: string }): Promise<SubDepartment> {
    const { created_by, ...subDepartmentData } = input;

    const { text, params } = buildInsert('sub_departments', {
      ...subDepartmentData,
      is_active: true,
    });

    const row = await queryOne<SubDepartment>(text, params);
    if (!row) throw new Error('Failed to create sub_department');

    if (created_by) {
      await this.addAuditLog({
        action: 'create',
        table: 'sub_departments',
        record_id: row.id,
        changes: { created: subDepartmentData },
        created_by,
      });
    }

    return row;
  },

  /**
   * Update a sub_department
   */
  async updateSubDepartment(id: string, updates: Partial<SubDepartmentInput> & { updated_by?: string }): Promise<SubDepartment> {
    const { updated_by, ...updateData } = updates;

    const oldData = await this.getSubDepartmentById(id);

    const { text, params } = buildUpdateById('sub_departments', id, updateData);
    const row = await queryOne<SubDepartment>(text, params);
    if (!row) throw new Error(`SubDepartment not found: ${id}`);

    if (updated_by) {
      await this.addAuditLog({
        action: 'update',
        table: 'sub_departments',
        record_id: id,
        changes: { before: oldData, after: updateData },
        created_by: updated_by,
      });
    }

    return row;
  },

  /**
   * Deactivate a sub_department
   */
  async deactivateSubDepartment(id: string, deactivated_by?: string): Promise<SubDepartment> {
    const { text, params } = buildUpdateById('sub_departments', id, { is_active: false });
    const row = await queryOne<SubDepartment>(text, params);
    if (!row) throw new Error(`SubDepartment not found: ${id}`);

    if (deactivated_by) {
      await this.addAuditLog({
        action: 'deactivate',
        table: 'sub_departments',
        record_id: id,
        changes: { is_active: false },
        created_by: deactivated_by,
      });
    }

    return row;
  },

  /**
   * Add audit log entry
   */
  async addAuditLog(log: {
    action: string;
    table: string;
    record_id: string;
    changes: any;
    created_by: string;
  }): Promise<void> {
    try {
      await execute(
        `INSERT INTO audit_logs (action, details, admin_id) VALUES ($1, $2, $3)`,
        [
          `${log.action}_${log.table}`,
          JSON.stringify({ table: log.table, record_id: log.record_id, changes: log.changes }),
          log.created_by,
        ]
      );
    } catch (err: any) {
      console.error('Audit log error:', err.message);
    }
  },
};
