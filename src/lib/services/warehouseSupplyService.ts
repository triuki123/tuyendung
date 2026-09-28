import { query, queryOne, execute, buildInsert, buildUpdateById } from '@/lib/db';

/**
 * Vật tư kho/xưởng: nguyên vật liệu (material) + công cụ dụng cụ (tool).
 * Tách biệt với module Tài Sản — sổ nội bộ của từng kho, quản lý kho tự nhập.
 *
 * ⚠️ TỒN KHO KHÔNG LƯU THÀNH CỘT. Luôn tính từ sổ warehouse_supply_moves:
 *      tồn      = nhập − xuất − cấp phát + thu hồi
 *      đang cấp = cấp phát − thu hồi   (theo từng công nhân)
 *   Nhờ vậy con số tồn không bao giờ lệch khỏi lịch sử biến động.
 *
 * ⚠️ Cột quantity/min_quantity là NUMERIC → driver pg trả về CHUỖI, không phải số.
 *   Mọi giá trị trả ra ngoài đều phải qua num() bên dưới, nếu không cộng bằng `+`
 *   sẽ NỐI CHUỖI ("2"+"3" = "23") — đúng loại bug từng làm sai tổng giá trị tài sản.
 */

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** NUMERIC/BIGINT của pg về dạng chuỗi → ép số an toàn (null/rỗng/NaN → 0). */
function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

export type SupplyKind = 'material' | 'tool';
export type SupplyMoveType = 'in' | 'out' | 'assign' | 'return';

export interface WarehouseSupply {
  id: string;
  warehouse_id: string;
  name: string;
  kind: SupplyKind;
  unit: string;
  min_quantity: number | null;
  note: string | null;
  active: boolean;
  /** Tồn thực còn trong kho (đã trừ phần đang ở tay công nhân). */
  in_stock: number;
  /** Tổng đang cấp phát cho công nhân, chưa thu hồi. */
  assigned: number;
  /** true khi min_quantity có giá trị và in_stock <= min_quantity. */
  low: boolean;
}

export interface SupplyMove {
  id: string;
  supply_id: string;
  supply_name: string;
  unit: string;
  move_type: SupplyMoveType;
  quantity: number;
  worker_id: string | null;
  worker_name: string | null;
  note: string | null;
  performed_by_name: string | null;
  created_at: string;
}

export interface SupplyHolder {
  worker_id: string;
  worker_name: string;
  quantity: number;
}

// ===== Danh mục vật tư =====

/**
 * Danh sách vật tư của kho, kèm tồn kho + số đang cấp phát (tính từ sổ).
 *
 * Gộp toàn bộ vào 1 query có LATERAL thay vì N+1: mỗi vật tư chỉ quét sổ 1 lần.
 */
export async function listSupplies(
  warehouseId: string,
  opts: { kind?: SupplyKind; includeInactive?: boolean } = {}
): Promise<WarehouseSupply[]> {
  const params: any[] = [warehouseId];
  let where = `s.warehouse_id = $1`;
  if (!opts.includeInactive) where += ` AND s.active = TRUE`;
  if (opts.kind) {
    params.push(opts.kind);
    where += ` AND s.kind = $${params.length}`;
  }

  const rows = await query<any>(
    `SELECT s.*,
            COALESCE(m.in_stock, 0) AS in_stock,
            COALESCE(m.assigned, 0) AS assigned
       FROM warehouse_supplies s
       LEFT JOIN LATERAL (
         SELECT
           SUM(CASE mv.move_type WHEN 'in'     THEN mv.quantity
                                 WHEN 'out'    THEN -mv.quantity
                                 WHEN 'assign' THEN -mv.quantity
                                 WHEN 'return' THEN mv.quantity END) AS in_stock,
           SUM(CASE mv.move_type WHEN 'assign' THEN mv.quantity
                                 WHEN 'return' THEN -mv.quantity
                                 ELSE 0 END)                          AS assigned
         FROM warehouse_supply_moves mv
         WHERE mv.supply_id = s.id
       ) m ON TRUE
      WHERE ${where}
      ORDER BY s.kind, s.name`,
    params
  );

  return rows.map((r) => {
    const inStock = num(r.in_stock);
    const min = r.min_quantity == null ? null : num(r.min_quantity);
    return {
      id: r.id,
      warehouse_id: r.warehouse_id,
      name: r.name,
      kind: r.kind,
      unit: r.unit,
      min_quantity: min,
      note: r.note,
      active: r.active,
      in_stock: inStock,
      assigned: num(r.assigned),
      low: min != null && inStock <= min,
    };
  });
}

export async function getSupply(id: string): Promise<{ id: string; warehouse_id: string; name: string; unit: string } | null> {
  return queryOne(`SELECT id, warehouse_id, name, unit FROM warehouse_supplies WHERE id = $1`, [id]);
}

export async function createSupply(input: {
  warehouseId: string;
  name: string;
  kind: SupplyKind;
  unit: string;
  minQuantity?: number | null;
  note?: string | null;
  createdBy?: string | null;
}): Promise<{ id: string }> {
  const id = newId('wsup');
  const { text, params } = buildInsert('warehouse_supplies', {
    id,
    warehouse_id: input.warehouseId,
    name: input.name.trim(),
    kind: input.kind,
    unit: (input.unit || 'cái').trim(),
    min_quantity: input.minQuantity ?? null,
    note: input.note?.trim() || null,
    created_by: input.createdBy ?? null,
  });
  await execute(text, params);
  return { id };
}

export async function updateSupply(id: string, data: Record<string, any>): Promise<void> {
  const allowed: Record<string, any> = {};
  for (const k of ['name', 'unit', 'min_quantity', 'note', 'active']) {
    if (k in data) allowed[k] = data[k];
  }
  if (!Object.keys(allowed).length) return;
  const { text, params } = buildUpdateById('warehouse_supplies', id, allowed);
  await execute(text, params);
}

/** Xóa vật tư + toàn bộ sổ biến động của nó (ON DELETE CASCADE). Không khôi phục được. */
export async function deleteSupply(id: string): Promise<boolean> {
  const n = await execute(`DELETE FROM warehouse_supplies WHERE id = $1`, [id]);
  return n > 0;
}

// ===== Sổ biến động =====

/**
 * Ghi 1 phiếu biến động.
 *
 * CHẶN XUẤT/CẤP PHÁT QUÁ TỒN: tính lại tồn ngay trước khi ghi. Không có ràng buộc
 * này thì tồn kho âm — vô nghĩa về nghiệp vụ. Tương tự, thu hồi không được nhiều
 * hơn số công nhân đó đang thực giữ.
 */
export async function addMove(input: {
  warehouseId: string;
  supplyId: string;
  moveType: SupplyMoveType;
  quantity: number;
  workerId?: string | null;
  note?: string | null;
  createdBy?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const qty = Number(input.quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: 'Số lượng phải lớn hơn 0' };
  }

  const needsWorker = input.moveType === 'assign' || input.moveType === 'return';
  if (needsWorker && !input.workerId) {
    return { ok: false, error: 'Chọn công nhân' };
  }

  // Tồn hiện tại (trong kho) — dùng để chặn xuất/cấp phát vượt tồn.
  if (input.moveType === 'out' || input.moveType === 'assign') {
    const row = await queryOne<{ in_stock: string | null }>(
      `SELECT SUM(CASE move_type WHEN 'in'     THEN quantity
                                 WHEN 'out'    THEN -quantity
                                 WHEN 'assign' THEN -quantity
                                 WHEN 'return' THEN quantity END) AS in_stock
         FROM warehouse_supply_moves WHERE supply_id = $1`,
      [input.supplyId]
    );
    const inStock = num(row?.in_stock);
    if (qty > inStock) {
      return { ok: false, error: `Tồn kho chỉ còn ${inStock} — không đủ để ${input.moveType === 'out' ? 'xuất' : 'cấp phát'}` };
    }
  }

  // Thu hồi không được vượt quá số công nhân đó đang giữ.
  if (input.moveType === 'return') {
    const row = await queryOne<{ holding: string | null }>(
      `SELECT SUM(CASE move_type WHEN 'assign' THEN quantity
                                 WHEN 'return' THEN -quantity
                                 ELSE 0 END) AS holding
         FROM warehouse_supply_moves WHERE supply_id = $1 AND worker_id = $2`,
      [input.supplyId, input.workerId]
    );
    const holding = num(row?.holding);
    if (qty > holding) {
      return { ok: false, error: `Công nhân này chỉ đang giữ ${holding} — không thể thu hồi nhiều hơn` };
    }
  }

  const { text, params } = buildInsert('warehouse_supply_moves', {
    id: newId('wsmv'),
    warehouse_id: input.warehouseId,
    supply_id: input.supplyId,
    move_type: input.moveType,
    quantity: qty,
    worker_id: needsWorker ? input.workerId : null,
    note: input.note?.trim() || null,
    created_by: input.createdBy ?? null,
  });
  await execute(text, params);
  return { ok: true };
}

/** Lịch sử biến động của 1 vật tư (mới nhất trước). */
export async function listMoves(supplyId: string, limit = 100): Promise<SupplyMove[]> {
  const rows = await query<any>(
    `SELECT mv.id, mv.supply_id, mv.move_type, mv.quantity, mv.worker_id, mv.note, mv.created_at,
            s.name AS supply_name, s.unit,
            w.full_name AS worker_name,
            u.name      AS performed_by_name
       FROM warehouse_supply_moves mv
       JOIN warehouse_supplies s      ON s.id = mv.supply_id
       LEFT JOIN warehouse_workers w  ON w.id = mv.worker_id
       LEFT JOIN users u              ON u.id = mv.created_by
      WHERE mv.supply_id = $1
      ORDER BY mv.created_at DESC
      LIMIT $2`,
    [supplyId, limit]
  );
  return rows.map((r) => ({ ...r, quantity: num(r.quantity) }));
}

/** Ai đang giữ vật tư này (chỉ những người còn giữ > 0). */
export async function listHolders(supplyId: string): Promise<SupplyHolder[]> {
  const rows = await query<any>(
    `SELECT mv.worker_id,
            w.full_name AS worker_name,
            SUM(CASE mv.move_type WHEN 'assign' THEN mv.quantity
                                  WHEN 'return' THEN -mv.quantity
                                  ELSE 0 END) AS quantity
       FROM warehouse_supply_moves mv
       JOIN warehouse_workers w ON w.id = mv.worker_id
      WHERE mv.supply_id = $1 AND mv.worker_id IS NOT NULL
      GROUP BY mv.worker_id, w.full_name
     HAVING SUM(CASE mv.move_type WHEN 'assign' THEN mv.quantity
                                  WHEN 'return' THEN -mv.quantity
                                  ELSE 0 END) > 0
      ORDER BY w.full_name`,
    [supplyId]
  );
  return rows.map((r) => ({ ...r, quantity: num(r.quantity) }));
}
