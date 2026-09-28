import bcrypt from 'bcryptjs';
import { query, queryOne, execute, buildInsert, buildUpdateById } from '@/lib/db';

/**
 * Service module Warehouse — kho/xưởng, ca, công nhân, bảng tin, đơn nghỉ, ứng lương.
 * Công nhân tách biệt hoàn toàn với bảng users của app chính.
 */

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ===== Kho =====

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  radius_m: number;
  photo_retention_days: number;
  report_emails: string[];
  advance_enabled: boolean;
  company_id: string | null;
  company_name?: string | null;
  active: boolean;
}

/**
 * Danh sách kho user này thấy được (RBAC 'warehouse' đã được guard kiểm trước):
 * - super_admin: mọi kho.
 * - user thường: kho thuộc CÔNG TY CHỦ QUẢN mà user là thành viên (công ty chính
 *   hoặc kiêm nhiệm), HOẶC kho được gán đích danh qua warehouse_managers
 *   (cho trường hợp quản lý chéo công ty / kho chưa gán công ty).
 */
/**
 * Kho user được quản trị. Phạm vi = ĐÍCH DANH danh sách "Quản lý kho" (warehouse_managers):
 *  - super_admin → mọi kho.
 *  - còn lại → CHỈ các kho mình được thêm vào ô Quản lý kho (kèm tick RBAC ở guard).
 *
 * Đã BỎ vế "thuộc công ty chủ quản" (2026-07-15, theo yêu cầu): trước đây bất kỳ nhân
 * viên nào của công ty chủ quản có tick Sửa đều đụng được mọi kho của công ty — quá rộng.
 * Nay muốn ai quản trị kho nào thì thêm đích danh họ vào ô Quản lý kho của kho đó.
 */
export async function getManagedWarehouses(userId: string, role: string): Promise<Warehouse[]> {
  if (role === 'super_admin') {
    return query<Warehouse>(
      `SELECT w.*, c.name AS company_name FROM warehouses w
       LEFT JOIN companies c ON c.id = w.company_id
       WHERE w.active = TRUE ORDER BY w.name`
    );
  }
  return query<Warehouse>(
    `SELECT DISTINCT w.*, c.name AS company_name FROM warehouses w
     LEFT JOIN companies c ON c.id = w.company_id
     WHERE w.active = TRUE
       AND EXISTS (SELECT 1 FROM warehouse_managers m WHERE m.warehouse_id = w.id AND m.user_id = $1::uuid)
     ORDER BY w.name`,
    [userId]
  );
}

/** Kiểm tra user có phạm vi truy cập kho này không (cùng logic getManagedWarehouses). */
export async function canManageWarehouse(userId: string, role: string, warehouseId: string): Promise<boolean> {
  if (role === 'super_admin') return true;
  const row = await queryOne(
    `SELECT 1 FROM warehouses w
     WHERE w.id = $1
       AND EXISTS (SELECT 1 FROM warehouse_managers m WHERE m.warehouse_id = w.id AND m.user_id = $2::uuid)`,
    [warehouseId, userId]
  );
  return !!row;
}

export async function getWarehouse(id: string): Promise<Warehouse | null> {
  return queryOne<Warehouse>(`SELECT * FROM warehouses WHERE id = $1`, [id]);
}

export async function getWarehouseByCode(code: string): Promise<Warehouse | null> {
  return queryOne<Warehouse>(`SELECT * FROM warehouses WHERE code = $1 AND active = TRUE`, [code]);
}

export async function createWarehouse(data: Partial<Warehouse>): Promise<Warehouse> {
  const { text, params } = buildInsert('warehouses', {
    id: newId('wh'),
    name: data.name,
    code: data.code,
    address: data.address ?? null,
    lat: data.lat ?? null,
    lng: data.lng ?? null,
    radius_m: data.radius_m ?? 200,
    photo_retention_days: data.photo_retention_days ?? 40,
    report_emails: data.report_emails ?? [],
    company_id: data.company_id ?? null,
  });
  const rows = await query<Warehouse>(text, params);
  return rows[0];
}

export async function updateWarehouse(id: string, data: Record<string, any>): Promise<Warehouse | null> {
  const allowed: Record<string, any> = {};
  for (const k of ['name', 'code', 'address', 'lat', 'lng', 'radius_m', 'photo_retention_days', 'report_emails', 'advance_enabled', 'company_id', 'active', 'attendance_mode']) {
    if (k in data) allowed[k] = data[k];
  }
  allowed.updated_at = new Date();
  const { text, params } = buildUpdateById('warehouses', id, allowed);
  const rows = await query<Warehouse>(text, params);
  return rows[0] ?? null;
}

export async function listManagers(warehouseId: string): Promise<{ user_id: string; name: string; email: string }[]> {
  return query(
    `SELECT m.user_id, u.name, u.email FROM warehouse_managers m
     JOIN users u ON u.id = m.user_id WHERE m.warehouse_id = $1 ORDER BY u.name`,
    [warehouseId]
  );
}

export async function addManager(warehouseId: string, userId: string): Promise<void> {
  await execute(
    `INSERT INTO warehouse_managers (warehouse_id, user_id) VALUES ($1, $2::uuid) ON CONFLICT DO NOTHING`,
    [warehouseId, userId]
  );
}

export async function removeManager(warehouseId: string, userId: string): Promise<void> {
  await execute(`DELETE FROM warehouse_managers WHERE warehouse_id = $1 AND user_id = $2::uuid`, [warehouseId, userId]);
}

// ===== Ca làm việc =====

export interface WarehouseShift {
  id: string;
  warehouse_id: string;
  name: string;
  start_time: string;
  end_time: string;
  active: boolean;
}

export async function listShifts(warehouseId: string, includeInactive = false): Promise<WarehouseShift[]> {
  return query<WarehouseShift>(
    `SELECT * FROM warehouse_shifts WHERE warehouse_id = $1 ${includeInactive ? '' : 'AND active = TRUE'} ORDER BY start_time`,
    [warehouseId]
  );
}

export async function createShift(warehouseId: string, name: string, startTime: string, endTime: string): Promise<WarehouseShift> {
  const { text, params } = buildInsert('warehouse_shifts', {
    id: newId('ws'), warehouse_id: warehouseId, name, start_time: startTime, end_time: endTime,
  });
  const rows = await query<WarehouseShift>(text, params);
  return rows[0];
}

export async function updateShift(id: string, data: Record<string, any>): Promise<void> {
  const allowed: Record<string, any> = {};
  for (const k of ['name', 'start_time', 'end_time', 'active']) if (k in data) allowed[k] = data[k];
  if (!Object.keys(allowed).length) return;
  const { text, params } = buildUpdateById('warehouse_shifts', id, allowed);
  await execute(text, params);
}

// ===== Công nhân =====

export interface WarehouseWorker {
  id: string;
  warehouse_id: string;
  full_name: string;
  dob: string | null;
  contact: string | null;
  cccd: string;
  shift_id: string | null;
  status: string;
  created_at: string;
  deactivated_at: string | null;
  note: string | null;
  shift_name?: string;
}

export async function listWorkers(warehouseId: string, status?: string): Promise<WarehouseWorker[]> {
  const cond = status ? `AND w.status = $2` : '';
  return query<WarehouseWorker>(
    `SELECT w.id, w.warehouse_id, w.full_name, w.dob, w.contact, w.cccd, w.shift_id, w.status,
            w.created_at, w.deactivated_at, w.note, s.name AS shift_name
     FROM warehouse_workers w
     LEFT JOIN warehouse_shifts s ON s.id = w.shift_id
     WHERE w.warehouse_id = $1 ${cond}
     ORDER BY w.status, w.full_name`,
    status ? [warehouseId, status] : [warehouseId]
  );
}

export async function getWorker(id: string): Promise<WarehouseWorker | null> {
  return queryOne<WarehouseWorker>(
    `SELECT w.*, s.name AS shift_name FROM warehouse_workers w
     LEFT JOIN warehouse_shifts s ON s.id = w.shift_id WHERE w.id = $1`,
    [id]
  );
}

/**
 * Tạo công nhân. CCCD duy nhất THEO KHO (1 người có thể làm nhiều kho, mỗi kho
 * 1 hồ sơ + PIN riêng) → chỉ chặn khi trùng CCCD trong CÙNG kho.
 */
export async function createWorker(input: {
  warehouseId: string; fullName: string; dob?: string | null; contact?: string | null;
  cccd: string; pin: string; shiftId?: string | null; createdBy: string;
}): Promise<WarehouseWorker> {
  const existing = await queryOne<WarehouseWorker>(
    `SELECT * FROM warehouse_workers WHERE cccd = $1 AND warehouse_id = $2`,
    [input.cccd, input.warehouseId]
  );
  if (existing) {
    throw new Error(
      existing.status === 'inactive'
        ? `CCCD này thuộc về "${existing.full_name}" đã ngưng làm việc tại kho này — hãy dùng nút Tái kích hoạt.`
        : 'CCCD này đã có tài khoản đang hoạt động tại kho này.'
    );
  }
  const { text, params } = buildInsert('warehouse_workers', {
    id: newId('wk'),
    warehouse_id: input.warehouseId,
    full_name: input.fullName,
    dob: input.dob ?? null,
    contact: input.contact ?? null,
    cccd: input.cccd,
    pin_hash: await bcrypt.hash(input.pin, 10),
    shift_id: input.shiftId ?? null,
    created_by: input.createdBy,
  });
  const rows = await query<WarehouseWorker>(text, params);
  return rows[0];
}

export async function updateWorker(id: string, data: Record<string, any>): Promise<void> {
  const allowed: Record<string, any> = {};
  for (const k of ['full_name', 'dob', 'contact', 'shift_id', 'note']) if (k in data) allowed[k] = data[k];
  if (!Object.keys(allowed).length) return;
  const { text, params } = buildUpdateById('warehouse_workers', id, allowed);
  await execute(text, params);
}

/** Quản lý đặt lại PIN (PIN tạm) — buộc công nhân đổi ở lần đăng nhập kế */
export async function resetWorkerPin(id: string, pin: string): Promise<void> {
  await execute(
    `UPDATE warehouse_workers SET pin_hash = $2, must_change_pin = TRUE WHERE id = $1`,
    [id, await bcrypt.hash(pin, 10)]
  );
}

/** Công nhân tự đổi PIN (xác nhận PIN hiện tại) — gỡ cờ must_change_pin */
export async function changeWorkerPin(id: string, currentPin: string, newPin: string): Promise<{ ok: boolean; error?: string }> {
  const row = await queryOne<{ pin_hash: string }>(`SELECT pin_hash FROM warehouse_workers WHERE id = $1 AND status = 'active'`, [id]);
  if (!row) return { ok: false, error: 'Không tìm thấy tài khoản' };
  const match = await bcrypt.compare(currentPin, row.pin_hash);
  if (!match) return { ok: false, error: 'PIN hiện tại không đúng' };
  await execute(
    `UPDATE warehouse_workers SET pin_hash = $2, must_change_pin = FALSE WHERE id = $1`,
    [id, await bcrypt.hash(newPin, 10)]
  );
  return { ok: true };
}

/** Ngưng làm việc (soft) / tái kích hoạt — giữ nguyên lịch sử */
export async function setWorkerStatus(id: string, active: boolean): Promise<void> {
  await execute(
    `UPDATE warehouse_workers SET status = $2, deactivated_at = $3 WHERE id = $1`,
    [id, active ? 'active' : 'inactive', active ? null : new Date()]
  );
}

/**
 * Xóa CỨNG công nhân: xóa hẳn hồ sơ + toàn bộ chấm công, ảnh, sản lượng, đơn
 * nghỉ/ứng lương (FK ON DELETE CASCADE). Không khôi phục được — dọn dữ liệu test.
 */
export async function hardDeleteWorker(id: string): Promise<boolean> {
  const n = await execute(`DELETE FROM warehouse_workers WHERE id = $1`, [id]);
  return n > 0;
}

/**
 * Đăng nhập công nhân: CCCD + PIN (+ warehouseId nếu người này làm nhiều kho).
 * PIN được xác minh trên MỌI hồ sơ đang hoạt động của CCCD đó; chỉ trả về/để lộ
 * các kho mà PIN thực sự khớp (không lộ danh sách kho khi PIN sai).
 * - Khớp đúng 1 kho → { worker }.
 * - Khớp nhiều kho, chưa chọn → { choices } (app hỏi chọn kho).
 * - Không khớp → {}.
 */
export async function verifyWorkerLogin(
  cccd: string,
  pin: string,
  warehouseId?: string | null
): Promise<{ worker?: WarehouseWorker; choices?: { id: string; name: string }[] }> {
  const rows = await query<WarehouseWorker & { pin_hash: string; wh_name: string }>(
    `SELECT w.*, wh.name AS wh_name FROM warehouse_workers w
     JOIN warehouses wh ON wh.id = w.warehouse_id
     WHERE w.cccd = $1 AND w.status = 'active'`,
    [cccd.trim()]
  );
  const matched: (WarehouseWorker & { pin_hash: string; wh_name: string })[] = [];
  for (const row of rows) {
    if (await bcrypt.compare(pin, row.pin_hash)) matched.push(row);
  }
  if (matched.length === 0) return {};
  const clean = (r: any): WarehouseWorker => { const { pin_hash, wh_name, ...rest } = r; return rest; };
  if (warehouseId) {
    const w = matched.find((m) => m.warehouse_id === warehouseId);
    return w ? { worker: clean(w) } : {};
  }
  if (matched.length === 1) return { worker: clean(matched[0]) };
  return { choices: matched.map((m) => ({ id: m.warehouse_id, name: m.wh_name })) };
}

// ===== Bảng tin =====

export async function listPosts(warehouseId: string, limit = 30): Promise<any[]> {
  return query(
    `SELECT p.*, u.name AS author_name FROM warehouse_posts p
     LEFT JOIN users u ON u.id = p.created_by
     WHERE p.warehouse_id = $1 ORDER BY p.pinned DESC, p.created_at DESC LIMIT $2`,
    [warehouseId, limit]
  );
}

export async function createPost(warehouseId: string, title: string, content: string, pinned: boolean, createdBy: string): Promise<any> {
  const { text, params } = buildInsert('warehouse_posts', {
    id: newId('wp'), warehouse_id: warehouseId, title, content, pinned, created_by: createdBy,
  });
  const rows = await query(text, params);
  return rows[0];
}

export async function deletePost(id: string): Promise<void> {
  await execute(`DELETE FROM warehouse_posts WHERE id = $1`, [id]);
}

// ===== Đơn nghỉ + Ứng lương =====

export async function createLeaveRequest(warehouseId: string, workerId: string, fromDate: string, toDate: string, reason: string): Promise<any> {
  const { text, params } = buildInsert('warehouse_leave_requests', {
    id: newId('wl'), warehouse_id: warehouseId, worker_id: workerId, from_date: fromDate, to_date: toDate, reason,
  });
  const rows = await query(text, params);
  return rows[0];
}

export async function createAdvanceRequest(warehouseId: string, workerId: string, amount: number, reason: string): Promise<any> {
  const { text, params } = buildInsert('warehouse_advances', {
    id: newId('wa'), warehouse_id: warehouseId, worker_id: workerId, amount: Math.round(amount), reason,
  });
  const rows = await query(text, params);
  return rows[0];
}

/** Danh sách yêu cầu của 1 công nhân (cho app worker) */
export async function listWorkerRequests(workerId: string): Promise<{ leaves: any[]; advances: any[] }> {
  const [leaves, advances] = await Promise.all([
    query(`SELECT * FROM warehouse_leave_requests WHERE worker_id = $1 ORDER BY created_at DESC LIMIT 20`, [workerId]),
    query(`SELECT * FROM warehouse_advances WHERE worker_id = $1 ORDER BY created_at DESC LIMIT 20`, [workerId]),
  ]);
  return { leaves, advances };
}

/** Danh sách yêu cầu chờ duyệt của kho (cho admin) */
export async function listPendingRequests(warehouseId: string): Promise<{ leaves: any[]; advances: any[] }> {
  const [leaves, advances] = await Promise.all([
    query(
      `SELECT r.*, w.full_name FROM warehouse_leave_requests r
       JOIN warehouse_workers w ON w.id = r.worker_id
       WHERE r.warehouse_id = $1 ORDER BY (r.status = 'pending') DESC, r.created_at DESC LIMIT 50`,
      [warehouseId]
    ),
    query(
      `SELECT r.*, w.full_name FROM warehouse_advances r
       JOIN warehouse_workers w ON w.id = r.worker_id
       WHERE r.warehouse_id = $1 ORDER BY (r.status = 'pending') DESC, r.created_at DESC LIMIT 50`,
      [warehouseId]
    ),
  ]);
  return { leaves, advances };
}

export async function decideRequest(kind: 'leave' | 'advance', id: string, approve: boolean, decidedBy: string): Promise<void> {
  const table = kind === 'leave' ? 'warehouse_leave_requests' : 'warehouse_advances';
  await execute(
    `UPDATE ${table} SET status = $2, decided_by = $3::uuid, decided_at = NOW() WHERE id = $1 AND status = 'pending'`,
    [id, approve ? 'approved' : 'rejected', decidedBy]
  );
}
