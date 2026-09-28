import { query, queryOne, execute, buildInsert, buildUpdateById } from '@/lib/db';

export interface Department {
  id: string;
  company_id: string;
  name: string;
  code?: string;
  description?: string;
  manager_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DepartmentInput {
  company_id: string;
  name: string;
  code?: string;
  description?: string;
  manager_id?: string;
}

// Helper function to generate department code from name
function generateDepartmentCode(name: string): string {
  // Remove diacritics and special characters, convert to uppercase
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // Remove diacritics
    .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .toUpperCase()
    .substring(0, 20); // Limit to 20 characters
}

export const departmentsService = {
  // Generate department code from name (public method)
  generateDepartmentCode,

  /**
   * Get all active departments
   */
  async getAllDepartments(includeInactive: boolean = false): Promise<Department[]> {
    if (includeInactive) {
      return query<Department>('SELECT * FROM departments ORDER BY name ASC');
    }
    return query<Department>(
      'SELECT * FROM departments WHERE is_active = $1 ORDER BY name ASC',
      [true]
    );
  },

  /**
   * Get departments by company ID
   */
  async getDepartmentsByCompany(companyId: string): Promise<Department[]> {
    return query<Department>(
      'SELECT * FROM departments WHERE company_id = $1 AND is_active = $2 ORDER BY name ASC',
      [companyId, true]
    );
  },

  /**
   * Get single department by ID
   */
  async getDepartmentById(id: string): Promise<Department> {
    const row = await queryOne<Department>(
      'SELECT * FROM departments WHERE id = $1',
      [id]
    );
    if (!row) throw new Error(`Department not found: ${id}`);
    return row;
  },

  /**
   * Search departments
   */
  async searchDepartments(searchQuery: string): Promise<Department[]> {
    const pattern = `%${searchQuery}%`;
    return query<Department>(
      `SELECT * FROM departments
       WHERE is_active = $1 AND (name ILIKE $2 OR code ILIKE $3)
       ORDER BY name ASC`,
      [true, pattern, pattern]
    );
  },

  /**
   * Create a new department
   */
  async createDepartment(input: DepartmentInput & { created_by?: string }): Promise<Department> {
    const { created_by, ...departmentData } = input;

    // Generate code if not provided
    const code = departmentData.code || this.generateDepartmentCode(departmentData.name);

    const { text, params } = buildInsert('departments', {
      ...departmentData,
      code,
      is_active: true,
    });

    const row = await queryOne<Department>(text, params);
    if (!row) throw new Error('Failed to create department');

    if (created_by) {
      await this.addAuditLog({
        action: 'create',
        table: 'departments',
        record_id: row.id,
        changes: { created: departmentData },
        created_by,
      });
    }

    return row;
  },

  /**
   * Update a department
   */
  async updateDepartment(id: string, updates: Partial<DepartmentInput> & { updated_by?: string }): Promise<Department> {
    const { updated_by, ...updateData } = updates;

    const oldData = await this.getDepartmentById(id);

    const { text, params } = buildUpdateById('departments', id, updateData);
    const row = await queryOne<Department>(text, params);
    if (!row) throw new Error(`Department not found: ${id}`);

    if (updated_by) {
      await this.addAuditLog({
        action: 'update',
        table: 'departments',
        record_id: id,
        changes: { before: oldData, after: updateData },
        created_by: updated_by,
      });
    }

    return row;
  },

  /**
   * Deactivate a department
   */
  async deactivateDepartment(id: string, deactivated_by?: string): Promise<Department> {
    const { text, params } = buildUpdateById('departments', id, { is_active: false });
    const row = await queryOne<Department>(text, params);
    if (!row) throw new Error(`Department not found: ${id}`);

    if (deactivated_by) {
      await this.addAuditLog({
        action: 'deactivate',
        table: 'departments',
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
