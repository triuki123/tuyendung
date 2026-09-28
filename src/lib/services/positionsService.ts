import { query, queryOne, execute, buildInsert, buildUpdateById } from '@/lib/db';

export interface Position {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  salary_range_min?: number;
  salary_range_max?: number;
  /** Cấp bậc 1-5 (1=Ban lãnh đạo … 5=Thực tập) — khai báo qua UI, không suy đoán theo tên */
  rank?: number;
  /** true khi HR đã chủ động xếp cấp (kể cả chọn 4) — phân biệt với default 4 chưa xếp */
  rank_confirmed?: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PositionInput {
  company_id: string;
  name: string;
  description?: string;
  salary_range_min?: number;
  salary_range_max?: number;
  rank?: number;
}

export const positionsService = {
  /**
   * Get all active positions
   */
  async getAllPositions(): Promise<Position[]> {
    return query<Position>(
      'SELECT * FROM positions WHERE is_active = $1 ORDER BY name ASC',
      [true]
    );
  },

  /**
   * Get positions by company ID
   */
  async getPositionsByCompany(companyId: string): Promise<Position[]> {
    return query<Position>(
      'SELECT * FROM positions WHERE company_id = $1 AND is_active = $2 ORDER BY name ASC',
      [companyId, true]
    );
  },

  /**
   * Get single position by ID
   */
  async getPositionById(id: string): Promise<Position> {
    const row = await queryOne<Position>(
      'SELECT * FROM positions WHERE id = $1',
      [id]
    );
    if (!row) throw new Error(`Position not found: ${id}`);
    return row;
  },

  /**
   * Search positions by name or description
   */
  async searchPositions(searchQuery: string): Promise<Position[]> {
    const pattern = `%${searchQuery}%`;
    return query<Position>(
      `SELECT * FROM positions
       WHERE is_active = $1 AND (name ILIKE $2 OR description ILIKE $3)
       ORDER BY name ASC`,
      [true, pattern, pattern]
    );
  },

  /**
   * Create a new position
   */
  async createPosition(input: PositionInput & { created_by?: string }): Promise<Position> {
    const { created_by, ...positionData } = input;

    const { text, params } = buildInsert('positions', {
      ...positionData,
      // HR chủ động chọn cấp bậc khi tạo (kể cả 4) → tính là đã xác nhận
      ...(positionData.rank !== undefined ? { rank_confirmed: true } : {}),
      is_active: true,
    });

    const row = await queryOne<Position>(text, params);
    if (!row) throw new Error('Failed to create position');

    if (created_by) {
      await this.addAuditLog({
        action: 'create',
        table: 'positions',
        record_id: row.id,
        changes: { created: positionData },
        created_by,
      });
    }

    return row;
  },

  /**
   * Update a position
   */
  async updatePosition(id: string, updates: Partial<PositionInput> & { updated_by?: string }): Promise<Position> {
    const { updated_by, ...updateData } = updates;

    const oldData = await this.getPositionById(id);

    // HR lưu form có chọn cấp bậc (kể cả giữ 4) → đã xác nhận, hết cảnh báo "chưa xếp"
    const finalData: Record<string, any> =
      (updateData as any).rank !== undefined ? { ...updateData, rank_confirmed: true } : updateData;

    const { text, params } = buildUpdateById('positions', id, finalData);
    const row = await queryOne<Position>(text, params);
    if (!row) throw new Error(`Position not found: ${id}`);

    if (updated_by) {
      await this.addAuditLog({
        action: 'update',
        table: 'positions',
        record_id: id,
        changes: { before: oldData, after: updateData },
        created_by: updated_by,
      });
    }

    return row;
  },

  /**
   * Deactivate a position
   */
  async deactivatePosition(id: string, deactivated_by?: string): Promise<Position> {
    const { text, params } = buildUpdateById('positions', id, { is_active: false });
    const row = await queryOne<Position>(text, params);
    if (!row) throw new Error(`Position not found: ${id}`);

    if (deactivated_by) {
      await this.addAuditLog({
        action: 'deactivate',
        table: 'positions',
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
