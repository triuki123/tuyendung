/**
 * Tồn kho SẢN XUẤT của kho/xưởng: hàng thô + thành phẩm + giá vốn (mig 295).
 *
 * Nguyên tắc (kế thừa module Vật Tư):
 *  - Tồn KHÔNG lưu thành cột — luôn tính từ sổ warehouse_stock_moves.
 *  - Giá vốn = BÌNH QUÂN GIA QUYỀN trên các lượt NHẬP có đơn giá:
 *      avg_cost = Σ(quantity × unit_cost) / Σ(quantity)  (chỉ các lượt nhập unit_cost NOT NULL)
 *  - Giá trị tồn = tồn × avg_cost. Muốn sửa tồn phải ghi dòng kiểm kê (adjust_in/out).
 */
import { query, queryOne, execute } from '@/lib/db';

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const IN_TYPES = `('purchase_in', 'production_in', 'adjust_in')`;

export interface WarehouseItem {
  id: string;
  warehouse_id: string;
  sku: string;
  barcode: string | null;
  name: string;
  // raw = hàng thô | semi = bán thành phẩm (mig 296, dùng cho BOM nhiều cấp) | finished = thành phẩm
  item_type: 'raw' | 'semi' | 'finished';
  unit: string;
  units_per_carton: number | null;
  min_quantity: number | null;
  note: string | null;
  active: boolean;
}

// ===== Danh mục hàng =====

export async function listItems(warehouseId: string, includeInactive = false): Promise<WarehouseItem[]> {
  return query<WarehouseItem>(
    `SELECT * FROM warehouse_items WHERE warehouse_id = $1 ${includeInactive ? '' : 'AND active = TRUE'}
     ORDER BY item_type, name`,
    [warehouseId]
  );
}

export async function createItem(input: {
  warehouseId: string; sku: string; barcode?: string | null; name: string;
  itemType: 'raw' | 'semi' | 'finished'; unit?: string; unitsPerCarton?: number | null;
  minQuantity?: number | null; note?: string | null; createdBy?: string | null;
}): Promise<{ ok: boolean; error?: string; item?: WarehouseItem }> {
  const sku = input.sku.trim().toUpperCase();
  if (!sku) return { ok: false, error: 'SKU không được trống' };
  const dup = await queryOne(
    `SELECT 1 FROM warehouse_items WHERE warehouse_id = $1 AND sku = $2`,
    [input.warehouseId, sku]
  );
  if (dup) return { ok: false, error: `SKU ${sku} đã tồn tại trong kho` };
  const rows = await query<WarehouseItem>(
    `INSERT INTO warehouse_items
       (id, warehouse_id, sku, barcode, name, item_type, unit, units_per_carton, min_quantity, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::uuid) RETURNING *`,
    [newId('wit'), input.warehouseId, sku, input.barcode?.trim() || null, input.name.trim(),
     input.itemType, input.unit || 'cái', input.unitsPerCarton ?? null,
     input.minQuantity ?? null, input.note ?? null, input.createdBy ?? null]
  );
  return { ok: true, item: rows[0] };
}

export async function updateItem(id: string, data: Record<string, any>): Promise<void> {
  const allowed = ['sku', 'barcode', 'name', 'unit', 'units_per_carton', 'min_quantity', 'note', 'active'];
  const sets: string[] = [];
  const params: any[] = [id];
  for (const k of allowed) {
    if (!(k in data)) continue;
    params.push(k === 'sku' ? String(data[k]).trim().toUpperCase() : data[k]);
    sets.push(`"${k}" = $${params.length}`);
  }
  if (sets.length === 0) return;
  await execute(`UPDATE warehouse_items SET ${sets.join(', ')} WHERE id = $1`, params);
}

/**
 * Xoá mặt hàng — CHỈ khi chưa có bất kỳ biến động sổ / định mức / dòng đơn nào.
 * Đã có dữ liệu gắn vào thì phải ẨN (active=false) để giữ nguyên sổ sách, vì các FK
 * đều ON DELETE CASCADE — xoá cứng là mất cả lịch sử nhập/xuất.
 */
export async function deleteItem(id: string): Promise<{ ok: boolean; error?: string }> {
  const used = await queryOne<{ moves: number; boms: number; orders: number; sales: number; ships: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM warehouse_stock_moves WHERE item_id = $1) AS moves,
       (SELECT COUNT(*)::int FROM warehouse_bom_lines WHERE item_id = $1)
         + (SELECT COUNT(*)::int FROM warehouse_boms WHERE finished_item_id = $1) AS boms,
       (SELECT COUNT(*)::int FROM warehouse_production_orders WHERE finished_item_id = $1) AS orders,
       -- Đơn hàng + đợt xuất (mig 296): FK là ON DELETE CASCADE — không chặn ở đây
       -- thì xóa mặt hàng sẽ làm DÒNG ĐƠN của khách biến mất lặng lẽ.
       (SELECT COUNT(*)::int FROM warehouse_order_lines WHERE item_id = $1) AS sales,
       (SELECT COUNT(*)::int FROM warehouse_shipment_lines WHERE item_id = $1) AS ships`,
    [id]
  );
  if (used && (used.moves > 0 || used.boms > 0 || used.orders > 0 || used.sales > 0 || used.ships > 0)) {
    const parts = [
      used.moves > 0 ? `${used.moves} dòng sổ kho` : null,
      used.boms > 0 ? 'định mức' : null,
      used.orders > 0 ? 'lệnh sản xuất' : null,
      used.sales > 0 ? 'đơn hàng khách' : null,
      used.ships > 0 ? 'đợt xuất' : null,
    ].filter(Boolean).join(', ');
    return { ok: false, error: `Mặt hàng đã có ${parts} — chỉ có thể ẨN để giữ sổ sách, không xoá được` };
  }
  await execute(`DELETE FROM warehouse_items WHERE id = $1`, [id]);
  return { ok: true };
}

/**
 * TỰ SINH BARCODE EAN-13 nội bộ cho mặt hàng.
 * Chuẩn công xưởng: GS1 dành dải prefix 20–29 cho mã lưu hành NỘI BỘ (in-store) —
 * hợp lệ với mọi máy quét/app đọc EAN-13 mà không đụng mã đăng ký GS1 của ai.
 * Cấu trúc: "20" + 10 chữ số từ counter nguyên tử (khuôn mig 296) + 1 số kiểm tra EAN.
 * Kèm kiểm tra trùng trong kho (vòng an toàn) rồi lưu thẳng vào item nếu truyền itemId.
 */
export async function generateItemBarcode(
  warehouseId: string,
  itemId?: string | null
): Promise<{ ok: boolean; error?: string; barcode?: string }> {
  const checkDigit = (d12: string): number => {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
    return (10 - (sum % 10)) % 10;
  };

  for (let attempt = 0; attempt < 5; attempt++) {
    // Counter riêng prefix 'EAN', year=0 (dãy chạy mãi, không reset theo năm)
    const row = await queryOne<{ seq: number }>(
      `INSERT INTO warehouse_code_counters (warehouse_id, prefix, year, seq)
       VALUES ($1, 'EAN', 0, 1)
       ON CONFLICT (warehouse_id, prefix, year) DO UPDATE SET seq = warehouse_code_counters.seq + 1
       RETURNING seq`,
      [warehouseId]
    );
    const body12 = '20' + String(row!.seq).padStart(10, '0');
    const barcode = body12 + String(checkDigit(body12));

    const dup = await queryOne(
      `SELECT 1 FROM warehouse_items WHERE warehouse_id = $1 AND (barcode = $2 OR sku = $2)`,
      [warehouseId, barcode]
    );
    if (dup) continue; // ai đó nhập tay trùng dải → lấy số kế tiếp

    if (itemId) {
      await execute(`UPDATE warehouse_items SET barcode = $2 WHERE id = $1`, [itemId, barcode]);
    }
    return { ok: true, barcode };
  }
  return { ok: false, error: 'Không sinh được mã không trùng — kiểm tra dữ liệu barcode trong kho' };
}

/** Tìm item theo mã quét (barcode trước, SKU sau) — cho màn kiểm đếm xuất kho. */
export async function findItemByCode(warehouseId: string, code: string): Promise<WarehouseItem | null> {
  const c = code.trim();
  if (!c) return null;
  return queryOne<WarehouseItem>(
    `SELECT * FROM warehouse_items
     WHERE warehouse_id = $1 AND active = TRUE AND (barcode = $2 OR sku = UPPER($2))
     ORDER BY (barcode = $2) DESC LIMIT 1`,
    [warehouseId, c]
  );
}

// ===== Sổ kho + tồn + giá vốn =====

/**
 * Tồn kho + giá vốn bình quân của mọi mặt hàng trong kho.
 * pending các lô/đợt chưa chốt KHÔNG nằm trong sổ nên không ảnh hưởng.
 */
export async function getStockOverview(warehouseId: string, includeInactive = false): Promise<any[]> {
  return query(
    `SELECT i.*,
            COALESCE(m.stock, 0)      AS stock,
            m.avg_cost                AS avg_cost,
            ROUND(COALESCE(m.stock, 0) * COALESCE(m.avg_cost, 0)) AS stock_value,
            (i.min_quantity IS NOT NULL AND COALESCE(m.stock, 0) < i.min_quantity) AS low_stock
     FROM warehouse_items i
     LEFT JOIN LATERAL (
       SELECT
         SUM(CASE WHEN sm.move_type IN ${IN_TYPES} THEN sm.quantity ELSE -sm.quantity END) AS stock,
         CASE WHEN SUM(sm.quantity) FILTER (WHERE sm.move_type IN ${IN_TYPES} AND sm.unit_cost IS NOT NULL) > 0
              THEN ROUND(
                SUM(sm.quantity * sm.unit_cost) FILTER (WHERE sm.move_type IN ${IN_TYPES} AND sm.unit_cost IS NOT NULL)
                / SUM(sm.quantity) FILTER (WHERE sm.move_type IN ${IN_TYPES} AND sm.unit_cost IS NOT NULL), 2)
              ELSE NULL END AS avg_cost
       FROM warehouse_stock_moves sm WHERE sm.item_id = i.id
     ) m ON TRUE
     WHERE i.warehouse_id = $1 ${includeInactive ? '' : 'AND i.active = TRUE'}
     ORDER BY i.item_type, i.name`,
    [warehouseId]
  );
}

/** Tồn hiện tại của 1 item (dùng khi chốt xuất kho / hoàn thành lô). */
export async function getItemStock(itemId: string): Promise<number> {
  const row = await queryOne<{ stock: string }>(
    `SELECT COALESCE(SUM(CASE WHEN move_type IN ${IN_TYPES} THEN quantity ELSE -quantity END), 0) AS stock
     FROM warehouse_stock_moves WHERE item_id = $1`,
    [itemId]
  );
  return Number(row?.stock ?? 0);
}

/** Giá vốn bình quân hiện tại của 1 item (đồng/đơn vị). NULL = chưa có lượt nhập có giá. */
export async function getItemAvgCost(itemId: string): Promise<number | null> {
  const row = await queryOne<{ avg_cost: string | null }>(
    `SELECT CASE WHEN SUM(quantity) FILTER (WHERE move_type IN ${IN_TYPES} AND unit_cost IS NOT NULL) > 0
            THEN ROUND(
              SUM(quantity * unit_cost) FILTER (WHERE move_type IN ${IN_TYPES} AND unit_cost IS NOT NULL)
              / SUM(quantity) FILTER (WHERE move_type IN ${IN_TYPES} AND unit_cost IS NOT NULL), 2)
            ELSE NULL END AS avg_cost
     FROM warehouse_stock_moves WHERE item_id = $1`,
    [itemId]
  );
  return row?.avg_cost != null ? Number(row.avg_cost) : null;
}

/** Giá vốn bình quân của 1 VẬT TƯ (từ sổ vật tư — lượt nhập có unit_cost). */
export async function getSupplyAvgCost(supplyId: string): Promise<number | null> {
  const row = await queryOne<{ avg_cost: string | null }>(
    `SELECT CASE WHEN SUM(quantity) FILTER (WHERE move_type = 'in' AND unit_cost IS NOT NULL) > 0
            THEN ROUND(
              SUM(quantity * unit_cost) FILTER (WHERE move_type = 'in' AND unit_cost IS NOT NULL)
              / SUM(quantity) FILTER (WHERE move_type = 'in' AND unit_cost IS NOT NULL), 2)
            ELSE NULL END AS avg_cost
     FROM warehouse_supply_moves WHERE supply_id = $1`,
    [supplyId]
  );
  return row?.avg_cost != null ? Number(row.avg_cost) : null;
}

/** Nhập hàng thô / kiểm kê điều chỉnh — ghi 1 dòng sổ. */
export async function addStockMove(input: {
  warehouseId: string; itemId: string;
  moveType: 'purchase_in' | 'adjust_in' | 'adjust_out';
  quantity: number; unitCost?: number | null; note?: string | null; createdBy: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false, error: 'Số lượng phải lớn hơn 0' };
  }
  if (input.moveType === 'adjust_out') {
    const stock = await getItemStock(input.itemId);
    if (input.quantity > stock) return { ok: false, error: `Chỉ còn tồn ${stock} — không thể trừ ${input.quantity}` };
  }
  await execute(
    `INSERT INTO warehouse_stock_moves
       (id, warehouse_id, item_id, move_type, quantity, unit_cost, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::uuid)`,
    [newId('wsm'), input.warehouseId, input.itemId, input.moveType, input.quantity,
     input.moveType === 'adjust_out' ? null : (input.unitCost ?? null),
     input.note ?? null, input.createdBy]
  );
  return { ok: true };
}

/**
 * SỬA ĐƠN GIÁ một lượt NHẬP đã ghi (nhập sai giá) — giá vốn bình quân tự tính lại vì
 * luôn derive từ sổ. CHỈ cho sửa purchase_in / adjust_in:
 *  - production_in KHÔNG sửa tay được — giá đó do lô sản xuất cuộn từ nguyên liệu,
 *    sửa tay là lệch với material_cost của lô; muốn đúng phải sửa giá nguyên liệu.
 *  - Lượt xuất không có giá.
 * Ghi vết người sửa + giá cũ vào note (sổ không có bảng audit riêng).
 */
export async function updateStockMoveCost(input: {
  moveId: string; unitCost: number | null; editedByName: string;
}): Promise<{ ok: boolean; error?: string }> {
  const move = await queryOne<any>(
    `SELECT id, move_type, unit_cost, note FROM warehouse_stock_moves WHERE id = $1`,
    [input.moveId]
  );
  if (!move) return { ok: false, error: 'Không tìm thấy dòng sổ' };
  if (!['purchase_in', 'adjust_in'].includes(move.move_type)) {
    return { ok: false, error: 'Chỉ sửa được giá của lượt Nhập mua / Kiểm kê tăng. Giá nhập từ lô sản xuất do hệ thống tính — sửa giá nguyên liệu rồi chạy lô mới.' };
  }
  if (input.unitCost != null && (!Number.isFinite(input.unitCost) || input.unitCost < 0)) {
    return { ok: false, error: 'Đơn giá không hợp lệ' };
  }
  const oldCost = move.unit_cost != null ? Math.round(Number(move.unit_cost)).toLocaleString('vi-VN') : '—';
  const trail = `[sửa giá ${oldCost}→${input.unitCost != null ? Math.round(input.unitCost).toLocaleString('vi-VN') : '—'} bởi ${input.editedByName}]`;
  await execute(
    `UPDATE warehouse_stock_moves
        SET unit_cost = $2, note = COALESCE(note || ' ', '') || $3
      WHERE id = $1`,
    [input.moveId, input.unitCost, trail]
  );
  return { ok: true };
}

/** Lịch sử biến động của 1 item (sổ chi tiết). */
export async function getItemMoves(itemId: string, limit = 100): Promise<any[]> {
  return query(
    `SELECT sm.*, u.name AS created_by_name,
            po.code AS production_code, sh.code AS shipment_code
     FROM warehouse_stock_moves sm
     LEFT JOIN users u  ON u.id = sm.created_by
     LEFT JOIN warehouse_production_orders po ON po.id = sm.production_order_id
     LEFT JOIN warehouse_shipments sh ON sh.id = sm.shipment_id
     WHERE sm.item_id = $1
     ORDER BY sm.created_at DESC LIMIT $2`,
    [itemId, limit]
  );
}

/**
 * Báo cáo XUẤT-NHẬP-TỒN theo kỳ [from, to] — chuẩn kế toán kho:
 * tồn đầu kỳ, nhập trong kỳ, xuất trong kỳ, tồn cuối kỳ (số lượng + giá trị theo giá vốn BQ).
 */
export async function getXntReport(warehouseId: string, from: string, to: string): Promise<any[]> {
  return query(
    `WITH agg AS (
       SELECT sm.item_id,
         SUM(CASE WHEN sm.created_at < $2::date AND sm.move_type IN ${IN_TYPES} THEN sm.quantity
                  WHEN sm.created_at < $2::date THEN -sm.quantity ELSE 0 END) AS opening,
         SUM(CASE WHEN sm.created_at >= $2::date AND sm.created_at < ($3::date + 1) AND sm.move_type IN ${IN_TYPES}
                  THEN sm.quantity ELSE 0 END) AS in_qty,
         SUM(CASE WHEN sm.created_at >= $2::date AND sm.created_at < ($3::date + 1) AND sm.move_type NOT IN ${IN_TYPES}
                  THEN sm.quantity ELSE 0 END) AS out_qty,
         CASE WHEN SUM(sm.quantity) FILTER (WHERE sm.move_type IN ${IN_TYPES} AND sm.unit_cost IS NOT NULL) > 0
              THEN ROUND(
                SUM(sm.quantity * sm.unit_cost) FILTER (WHERE sm.move_type IN ${IN_TYPES} AND sm.unit_cost IS NOT NULL)
                / SUM(sm.quantity) FILTER (WHERE sm.move_type IN ${IN_TYPES} AND sm.unit_cost IS NOT NULL), 2)
              ELSE NULL END AS avg_cost
       FROM warehouse_stock_moves sm
       WHERE sm.warehouse_id = $1
       GROUP BY sm.item_id
     )
     SELECT i.id, i.sku, i.name, i.item_type, i.unit,
            COALESCE(a.opening, 0) AS opening,
            COALESCE(a.in_qty, 0)  AS in_qty,
            COALESCE(a.out_qty, 0) AS out_qty,
            COALESCE(a.opening, 0) + COALESCE(a.in_qty, 0) - COALESCE(a.out_qty, 0) AS closing,
            a.avg_cost,
            ROUND((COALESCE(a.opening, 0) + COALESCE(a.in_qty, 0) - COALESCE(a.out_qty, 0)) * COALESCE(a.avg_cost, 0)) AS closing_value
     FROM warehouse_items i
     LEFT JOIN agg a ON a.item_id = i.id
     WHERE i.warehouse_id = $1 AND i.active = TRUE
     ORDER BY i.item_type, i.name`,
    [warehouseId, from, to]
  );
}
