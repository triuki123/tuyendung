import { query, queryOne, execute, buildInsert, buildUpdateById } from '@/lib/db';

/** Sản lượng công nhân kho: sản phẩm/công đoạn, nhập theo ngày, thống kê xếp hạng. */

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ===== Sản phẩm / công đoạn =====

export interface WarehouseProduct {
  id: string;
  warehouse_id: string;
  name: string;
  unit: string;
  active: boolean;
}

export async function listProducts(warehouseId: string, includeInactive = false): Promise<WarehouseProduct[]> {
  return query<WarehouseProduct>(
    `SELECT * FROM warehouse_products WHERE warehouse_id = $1 ${includeInactive ? '' : 'AND active = TRUE'} ORDER BY name`,
    [warehouseId]
  );
}

export async function createProduct(warehouseId: string, name: string, unit: string): Promise<WarehouseProduct> {
  const { text, params } = buildInsert('warehouse_products', {
    id: newId('wpr'), warehouse_id: warehouseId, name, unit,
  });
  const rows = await query<WarehouseProduct>(text, params);
  return rows[0];
}

export async function updateProduct(id: string, data: Record<string, any>): Promise<void> {
  const allowed: Record<string, any> = {};
  for (const k of ['name', 'unit', 'active']) if (k in data) allowed[k] = data[k];
  if (!Object.keys(allowed).length) return;
  const { text, params } = buildUpdateById('warehouse_products', id, allowed);
  await execute(text, params);
}

// ===== Nhập sản lượng theo ngày =====

/**
 * Upsert 1 lô sản lượng MỨC NGÀY (bảng nhập nhanh của quản lý: 1 hàng/công nhân).
 * Chỉ đụng bản ghi attendance_id NULL — sản lượng theo ĐỢT (công nhân tự khai) quản lý
 * duyệt/sửa riêng qua reviewOutput, không bị bảng nhập nhanh ghi đè.
 */
export async function saveOutputBatch(input: {
  warehouseId: string; productId: string; workDate: string; enteredBy: string;
  rows: { workerId: string; quantity: number }[];
  /** Gắn sản lượng vào LÔ SẢN XUẤT (mig 296) — để đối chiếu "người khai vs kho nhận". Optional, caller cũ không đổi. */
  productionOrderId?: string | null;
}): Promise<number> {
  let saved = 0;
  const poId = input.productionOrderId || null;
  for (const r of input.rows) {
    if (r.quantity == null || Number.isNaN(r.quantity)) continue;
    if (r.quantity <= 0) {
      await execute(
        `DELETE FROM warehouse_output
         WHERE worker_id = $1 AND product_id = $2 AND work_date = $3 AND attendance_id IS NULL`,
        [r.workerId, input.productId, input.workDate]
      );
      continue;
    }
    await execute(
      `INSERT INTO warehouse_output (id, warehouse_id, worker_id, product_id, work_date, quantity, entered_by, source, status, production_order_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7::uuid, 'manager', 'approved', $8)
       ON CONFLICT (worker_id, product_id, work_date, COALESCE(attendance_id, ''))
       DO UPDATE SET quantity = $6, entered_by = $7::uuid, source = 'manager', status = 'approved',
                     production_order_id = COALESCE($8, warehouse_output.production_order_id), updated_at = NOW()`,
      [newId('wo'), input.warehouseId, r.workerId, input.productId, input.workDate, r.quantity, input.enteredBy, poId]
    );
    saved++;
  }
  return saved;
}

/** Tổng sản lượng công nhân KHAI cho 1 lô SX — ProductionTab đối chiếu với actual_qty kho nhận. */
export async function getOutputByProductionOrder(productionOrderId: string): Promise<{ total: number; workers: number }> {
  const row = await queryOne<{ total: string; workers: string }>(
    `SELECT COALESCE(SUM(quantity), 0) AS total, COUNT(DISTINCT worker_id) AS workers
       FROM warehouse_output
      WHERE production_order_id = $1 AND status = 'approved'`,
    [productionOrderId]
  );
  return { total: Number(row?.total ?? 0), workers: Number(row?.workers ?? 0) };
}

/** Sản lượng MỨC NGÀY của kho theo sản phẩm (để load lại bảng nhập nhanh) */
export async function getOutputDay(warehouseId: string, productId: string, workDate: string): Promise<any[]> {
  return query(
    `SELECT worker_id, quantity FROM warehouse_output
     WHERE warehouse_id = $1 AND product_id = $2 AND work_date = $3 AND attendance_id IS NULL`,
    [warehouseId, productId, workDate]
  );
}

/** Sản lượng của 1 công nhân trong tháng (app worker) — kèm đợt + trạng thái duyệt */
export async function getWorkerOutput(workerId: string, month: string): Promise<any[]> {
  return query(
    `SELECT o.work_date, o.quantity, o.status, o.source, o.attendance_id,
            a.session_no, p.name AS product_name, p.unit
     FROM warehouse_output o
     JOIN warehouse_products p ON p.id = o.product_id
     LEFT JOIN warehouse_attendance a ON a.id = o.attendance_id
     WHERE o.worker_id = $1 AND to_char(o.work_date, 'YYYY-MM') = $2
     ORDER BY o.work_date DESC, a.session_no NULLS FIRST, p.name`,
    [workerId, month]
  );
}

/** Sản lượng công nhân TỰ KHAI đang chờ duyệt của kho (kèm giờ đợt để đối chiếu). */
export async function listPendingOutputs(warehouseId: string): Promise<any[]> {
  return query(
    `SELECT o.id, o.worker_id, o.product_id, o.quantity, to_char(o.work_date, 'YYYY-MM-DD') AS work_date,
            w.full_name, p.name AS product_name, p.unit,
            a.session_no, a.check_in_at, a.check_out_at
     FROM warehouse_output o
     JOIN warehouse_workers w ON w.id = o.worker_id
     JOIN warehouse_products p ON p.id = o.product_id
     LEFT JOIN warehouse_attendance a ON a.id = o.attendance_id
     WHERE o.warehouse_id = $1 AND o.status = 'pending'
     ORDER BY o.work_date DESC, w.full_name, p.name`,
    [warehouseId]
  );
}

/**
 * Quản lý duyệt sản lượng tự khai: approve (giữ/sửa số lượng) hoặc delete (loại bỏ).
 * quantity truyền vào = quản lý cập nhật lại con số đúng.
 */
export async function reviewOutput(input: {
  outputId: string; action: 'approved' | 'deleted'; quantity?: number | null; reviewedBy: string;
}): Promise<void> {
  if (input.action === 'deleted') {
    await execute(`DELETE FROM warehouse_output WHERE id = $1 AND status = 'pending'`, [input.outputId]);
    return;
  }
  const qty = input.quantity != null && Number.isFinite(Number(input.quantity)) ? Number(input.quantity) : null;
  await execute(
    `UPDATE warehouse_output SET status = 'approved',
            quantity = COALESCE($2, quantity), entered_by = $3::uuid, updated_at = NOW()
     WHERE id = $1 AND status = 'pending'`,
    [input.outputId, qty, input.reviewedBy]
  );
}

// ===== Thống kê / Xếp hạng =====

/**
 * Xếp hạng công nhân trong khoảng ngày [from, to]:
 * tổng sản lượng theo từng sản phẩm + ngày công + tỉ lệ đúng chuẩn.
 */
export async function getRanking(warehouseId: string, from: string, to: string): Promise<any[]> {
  return query(
    `WITH att AS (
       SELECT worker_id,
              COUNT(DISTINCT work_date) FILTER (WHERE check_in_at IS NOT NULL) AS days_worked,
              ROUND(SUM(
                CASE WHEN check_out_at IS NOT NULL
                      AND (declared_status IS NULL OR declared_status = 'approved')
                     THEN EXTRACT(EPOCH FROM (check_out_at - check_in_at)) / 3600.0
                     ELSE 0 END
              )::numeric, 1) AS total_hours
       FROM warehouse_attendance
       WHERE warehouse_id = $1 AND work_date BETWEEN $2 AND $3
       GROUP BY worker_id
     ), per_product AS (
       SELECT o.worker_id, p.name AS product, p.unit, SUM(o.quantity) AS qty
       FROM warehouse_output o JOIN warehouse_products p ON p.id = o.product_id
       WHERE o.warehouse_id = $1 AND o.work_date BETWEEN $2 AND $3
         AND o.status = 'approved'
       GROUP BY o.worker_id, p.name, p.unit
     ), outp_d AS (
       SELECT worker_id, SUM(qty) AS total_qty,
              json_agg(json_build_object('product', product, 'unit', unit, 'qty', qty) ORDER BY product) AS by_product
       FROM per_product GROUP BY worker_id
     )
     SELECT w.id AS worker_id, w.full_name, w.status,
            COALESCE(a.days_worked, 0) AS days_worked,
            COALESCE(a.total_hours, 0) AS total_hours,
            COALESCE(d.total_qty, 0) AS total_qty,
            d.by_product
     FROM warehouse_workers w
     LEFT JOIN att a ON a.worker_id = w.id
     LEFT JOIN outp_d d ON d.worker_id = w.id
     WHERE w.warehouse_id = $1 AND (a.worker_id IS NOT NULL OR d.worker_id IS NOT NULL)
     ORDER BY COALESCE(d.total_qty, 0) DESC, COALESCE(a.days_worked, 0) DESC`,
    [warehouseId, from, to]
  );
}

/** Chi tiết sản lượng từng ngày trong khoảng [from, to] (báo cáo ma trận ngày) */
export async function getRangeOutputDetail(warehouseId: string, from: string, to: string): Promise<any[]> {
  return query(
    `SELECT o.worker_id, o.product_id, p.name AS product_name, p.unit,
            to_char(o.work_date, 'YYYY-MM-DD') AS day, SUM(o.quantity) AS quantity
     FROM warehouse_output o JOIN warehouse_products p ON p.id = o.product_id
     WHERE o.warehouse_id = $1 AND o.work_date BETWEEN $2 AND $3
       AND o.status = 'approved'
     GROUP BY o.worker_id, o.product_id, p.name, p.unit, o.work_date
     ORDER BY p.name, o.work_date`,
    [warehouseId, from, to]
  );
}

/** Tổng sản lượng tháng theo công nhân + sản phẩm (cho báo cáo email) */
export async function getMonthlyOutputSummary(warehouseId: string, month: string): Promise<any[]> {
  return query(
    `SELECT w.full_name, p.name AS product_name, p.unit, SUM(o.quantity) AS total_qty
     FROM warehouse_output o
     JOIN warehouse_workers w ON w.id = o.worker_id
     JOIN warehouse_products p ON p.id = o.product_id
     WHERE o.warehouse_id = $1 AND to_char(o.work_date, 'YYYY-MM') = $2
       AND o.status = 'approved'
     GROUP BY w.full_name, p.name, p.unit
     ORDER BY w.full_name, p.name`,
    [warehouseId, month]
  );
}
