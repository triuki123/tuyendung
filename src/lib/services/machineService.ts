/**
 * Machine Service — Quản lý máy chấm công
 */

import { query, queryOne, execute } from '@/lib/db';

export type ConnectionMode = 'pull' | 'push';

export interface AttendanceMachine {
  id: string;
  company_id: string | null;
  name: string;
  host: string;
  port: number;
  machine_type: string;
  location: string | null;
  status: string;
  last_sync: string | null;
  last_error: string | null;
  polling_enabled: boolean;
  connection_mode: ConnectionMode;
  comm_key: string | null;
  poll_interval_seconds: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Lấy tất cả máy chấm công
 */
export async function getAllMachines(companyId?: string | null): Promise<AttendanceMachine[]> {
  return query<AttendanceMachine>(
    `SELECT * FROM attendance_machines
     ${companyId ? 'WHERE company_id::text = $1' : ''}
     ORDER BY created_at DESC`,
    companyId ? [companyId] : []
  );
}

/**
 * Lấy máy theo ID
 */
export async function getMachineById(id: string, companyId?: string | null): Promise<AttendanceMachine | null> {
  return queryOne<AttendanceMachine>(
    `SELECT * FROM attendance_machines
      WHERE id = $1 ${companyId ? 'AND company_id::text = $2' : ''}`,
    companyId ? [id, companyId] : [id]
  );
}

/**
 * Tạo máy mới
 */
export async function createMachine(data: {
  id: string;
  company_id?: string | null;
  name: string;
  host: string;
  port: number;
  machine_type?: string;
  location?: string;
  notes?: string;
  connection_mode?: ConnectionMode;
  comm_key?: string;
  poll_interval_seconds?: number;
  created_by?: string;
}): Promise<AttendanceMachine> {
  return queryOne<AttendanceMachine>(
    `INSERT INTO attendance_machines
       (id, company_id, name, host, port, machine_type, location, notes, connection_mode, comm_key, poll_interval_seconds, created_by)
     VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      data.id,
      data.company_id ?? null,
      data.name,
      data.host,
      data.port,
      data.machine_type ?? 'zkteco',
      data.location ?? null,
      data.notes ?? null,
      data.connection_mode ?? 'pull',
      data.comm_key ?? null,
      data.poll_interval_seconds ?? 30,
      data.created_by ?? null,
    ]
  ) as Promise<AttendanceMachine>;
}

/**
 * Cập nhật máy
 */
export async function updateMachine(
  id: string,
  data: Partial<AttendanceMachine>,
  companyId?: string | null
): Promise<AttendanceMachine | null> {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${paramCount++}`);
    values.push(data.name);
  }
  if (data.host !== undefined) {
    updates.push(`host = $${paramCount++}`);
    values.push(data.host);
  }
  if (data.port !== undefined) {
    updates.push(`port = $${paramCount++}`);
    values.push(data.port);
  }
  if (data.machine_type !== undefined) {
    updates.push(`machine_type = $${paramCount++}`);
    values.push(data.machine_type);
  }
  if (data.connection_mode !== undefined) {
    updates.push(`connection_mode = $${paramCount++}`);
    values.push(data.connection_mode);
  }
  if (data.comm_key !== undefined) {
    updates.push(`comm_key = $${paramCount++}`);
    values.push(data.comm_key);
  }
  if (data.poll_interval_seconds !== undefined) {
    updates.push(`poll_interval_seconds = $${paramCount++}`);
    values.push(data.poll_interval_seconds);
  }
  if (data.location !== undefined) {
    updates.push(`location = $${paramCount++}`);
    values.push(data.location);
  }
  if (data.status !== undefined) {
    updates.push(`status = $${paramCount++}`);
    values.push(data.status);
  }
  if (data.polling_enabled !== undefined) {
    updates.push(`polling_enabled = $${paramCount++}`);
    values.push(data.polling_enabled);
  }
  if (data.notes !== undefined) {
    updates.push(`notes = $${paramCount++}`);
    values.push(data.notes);
  }

  updates.push(`updated_at = NOW()`);
  values.push(id);
  if (companyId) values.push(companyId);

  return queryOne<AttendanceMachine>(
    `UPDATE attendance_machines SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      ${companyId ? `AND company_id::text = $${paramCount + 1}` : ''}
      RETURNING *`,
    values
  );
}

/**
 * Update last_sync + clear error
 */
export async function updateLastSync(machineId: string): Promise<void> {
  await execute(
    `UPDATE attendance_machines
     SET last_sync = NOW(), last_error = NULL, status = 'active'
     WHERE id = $1`,
    [machineId]
  );
}

/**
 * Update last_error + set status inactive
 */
export async function updateLastError(machineId: string, error: string): Promise<void> {
  await execute(
    `UPDATE attendance_machines
     SET last_error = $2, status = 'error', updated_at = NOW()
     WHERE id = $1`,
    [machineId, error]
  );
}

/**
 * Xóa máy
 */
export async function deleteMachine(id: string, companyId?: string | null): Promise<boolean> {
  const affected = await execute(
    `DELETE FROM attendance_machines
      WHERE id = $1 ${companyId ? 'AND company_id::text = $2' : ''}`,
    companyId ? [id, companyId] : [id]
  );
  return affected > 0;
}

/**
 * Lấy máy theo host:port (để tìm máy khi có dữ liệu incoming)
 */
export async function getMachineByHostPort(host: string, port: number): Promise<AttendanceMachine | null> {
  return queryOne<AttendanceMachine>(
    `SELECT * FROM attendance_machines WHERE host = $1 AND port = $2 LIMIT 1`,
    [host, port]
  );
}
