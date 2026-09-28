/**
 * Sản xuất theo LÔ: định mức (BOM) + lệnh sản xuất + backflush + cuộn giá vốn (mig 295).
 *
 * Hoàn thành lô:
 *  1. Trừ nguyên liệu (hàng thô) + vật tư theo BOM × (số đạt + phế phẩm) — phế phẩm vẫn
 *     tiêu nguyên liệu nhưng không nhập kho thành phẩm.
 *  2. material_cost = Σ(lượng tiêu × giá vốn BQ hiện tại của từng thành phần).
 *  3. Nhập kho thành phẩm với unit_cost = material_cost / số đạt → giá vốn thành phẩm
 *     tự cuộn từ nguyên liệu, không ai phải nhập tay.
 * Toàn bộ trong 1 transaction — thiếu tồn bất kỳ thành phần nào là hủy cả lô.
 */
import { query, queryOne, execute, withTransaction } from '@/lib/db';
import { getItemAvgCost, getSupplyAvgCost } from '@/lib/services/warehouseInventoryService';

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ===== BOM (định mức) =====

export interface BomLineInput {
  itemId?: string | null;    // hàng thô
  supplyId?: string | null;  // vật tư (module Vật Tư)
  quantity: number;          // cho 1 đơn vị thành phẩm
}

export async function getActiveBom(finishedItemId: string): Promise<any | null> {
  const bom = await queryOne<any>(
    `SELECT * FROM warehouse_boms WHERE finished_item_id = $1 AND active = TRUE`,
    [finishedItemId]
  );
  if (!bom) return null;
  const lines = await query(
    `SELECT l.*, i.name AS item_name, i.sku AS item_sku, i.unit AS item_unit,
            s.name AS supply_name, s.unit AS supply_unit
     FROM warehouse_bom_lines l
     LEFT JOIN warehouse_items i ON i.id = l.item_id
     LEFT JOIN warehouse_supplies s ON s.id = l.supply_id
     WHERE l.bom_id = $1 ORDER BY i.name NULLS LAST, s.name`,
    [bom.id]
  );
  return { ...bom, lines };
}

/**
 * Lưu định mức cho 1 thành phẩm: tắt BOM active cũ (giữ lịch sử lô đã dùng), tạo BOM mới.
 */
export async function saveBom(input: {
  warehouseId: string; finishedItemId: string; name?: string | null;
  lines: BomLineInput[]; createdBy: string;
}): Promise<{ ok: boolean; error?: string }> {
  const valid = input.lines.filter(
    (l) => (l.itemId || l.supplyId) && Number.isFinite(l.quantity) && l.quantity > 0
  );
  if (valid.length === 0) return { ok: false, error: 'Định mức cần ít nhất 1 thành phần' };
  if (valid.some((l) => l.itemId === input.finishedItemId)) {
    return { ok: false, error: 'Thành phẩm không thể là nguyên liệu của chính nó' };
  }
  return withTransaction(async (client) => {
    await client.query(
      `UPDATE warehouse_boms SET active = FALSE WHERE finished_item_id = $1 AND active`,
      [input.finishedItemId]
    );
    const bomId = newId('wbom');
    await client.query(
      `INSERT INTO warehouse_boms (id, warehouse_id, finished_item_id, name, created_by)
       VALUES ($1,$2,$3,$4,$5::uuid)`,
      [bomId, input.warehouseId, input.finishedItemId, input.name ?? null, input.createdBy]
    );
    for (const l of valid) {
      await client.query(
        `INSERT INTO warehouse_bom_lines (id, bom_id, item_id, supply_id, quantity)
         VALUES ($1,$2,$3,$4,$5)`,
        [newId('wbl'), bomId, l.itemId ?? null, l.supplyId ?? null, l.quantity]
      );
    }
    return { ok: true };
  });
}

// ===== Lệnh sản xuất =====

/** Mã lô tự tăng theo năm: LO-2026-0001 */
async function nextCode(warehouseId: string, prefix: string, table: string): Promise<string> {
  const year = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()).slice(0, 4);
  const row = await queryOne<{ n: string }>(
    `SELECT COUNT(*)::int AS n FROM ${table} WHERE warehouse_id = $1 AND code LIKE $2`,
    [warehouseId, `${prefix}-${year}-%`]
  );
  return `${prefix}-${year}-${String(Number(row?.n ?? 0) + 1).padStart(4, '0')}`;
}

export async function listProductionOrders(warehouseId: string, status?: string): Promise<any[]> {
  return query(
    `SELECT po.*, i.name AS finished_name, i.sku AS finished_sku, i.unit AS finished_unit,
            u.name AS created_by_name,
            o.code AS order_code,
            (SELECT COALESCE(SUM(wo.quantity), 0) FROM warehouse_output wo
              WHERE wo.production_order_id = po.id AND wo.status = 'approved') AS declared_total
     FROM warehouse_production_orders po
     JOIN warehouse_items i ON i.id = po.finished_item_id
     LEFT JOIN users u ON u.id = po.created_by
     LEFT JOIN warehouse_orders o ON o.id = po.order_id
     WHERE po.warehouse_id = $1 ${status ? 'AND po.status = $2' : ''}
     ORDER BY po.created_at DESC LIMIT 200`,
    status ? [warehouseId, status] : [warehouseId]
  );
}

export async function createProductionOrder(input: {
  warehouseId: string; finishedItemId: string; plannedQty: number;
  note?: string | null; createdBy: string;
}): Promise<{ ok: boolean; error?: string; order?: any }> {
  if (!Number.isFinite(input.plannedQty) || input.plannedQty <= 0) {
    return { ok: false, error: 'Số lượng kế hoạch phải > 0' };
  }
  const bom = await getActiveBom(input.finishedItemId);
  if (!bom) return { ok: false, error: 'Thành phẩm chưa có định mức (BOM) — khai định mức trước khi tạo lô' };
  const code = await nextCode(input.warehouseId, 'LO', 'warehouse_production_orders');
  const rows = await query(
    `INSERT INTO warehouse_production_orders
       (id, warehouse_id, code, finished_item_id, bom_id, planned_qty, status, note, created_by, started_at)
     VALUES ($1,$2,$3,$4,$5,$6,'in_progress',$7,$8::uuid,NOW()) RETURNING *`,
    [newId('wpo'), input.warehouseId, code, input.finishedItemId, bom.id, input.plannedQty,
     input.note ?? null, input.createdBy]
  );
  return { ok: true, order: rows[0] };
}

/**
 * HOÀN THÀNH LÔ (backflush) — trái tim của sản xuất.
 * Kiểm đủ tồn mọi thành phần TRƯỚC, rồi trừ nguyên liệu + cộng thành phẩm trong 1 transaction.
 */
export async function completeProductionOrder(input: {
  orderId: string; actualQty: number; wasteQty?: number; note?: string | null; completedBy: string;
}): Promise<{ ok: boolean; error?: string; materialCost?: number; unitCost?: number }> {
  const actual = Number(input.actualQty);
  const waste = Number(input.wasteQty ?? 0);
  if (!Number.isFinite(actual) || actual <= 0) return { ok: false, error: 'Số thành phẩm đạt phải > 0' };
  if (!Number.isFinite(waste) || waste < 0) return { ok: false, error: 'Phế phẩm không hợp lệ' };

  const order = await queryOne<any>(
    `SELECT * FROM warehouse_production_orders WHERE id = $1`, [input.orderId]
  );
  if (!order) return { ok: false, error: 'Không tìm thấy lô' };
  if (order.status !== 'in_progress' && order.status !== 'draft') {
    return { ok: false, error: 'Lô đã hoàn thành hoặc đã hủy' };
  }

  const bom = order.bom_id
    ? await queryOne<any>(`SELECT * FROM warehouse_boms WHERE id = $1`, [order.bom_id])
    : null;
  const lines = bom
    ? await query<any>(`SELECT * FROM warehouse_bom_lines WHERE bom_id = $1`, [bom.id])
    : [];
  if (lines.length === 0) return { ok: false, error: 'Lô không có định mức — không xác định được nguyên liệu' };

  // Tổng tiêu = định mức × (đạt + phế phẩm). Kiểm tồn + lấy giá vốn từng thành phần.
  const consumeQty = actual + waste;
  const consumption: { line: any; qty: number; avgCost: number | null; name: string }[] = [];
  for (const l of lines) {
    const qty = Math.round(Number(l.quantity) * consumeQty * 10000) / 10000;
    if (l.item_id) {
      const stockRow = await queryOne<{ stock: string; name: string }>(
        `SELECT COALESCE(SUM(CASE WHEN move_type IN ('purchase_in','production_in','adjust_in')
                 THEN quantity ELSE -quantity END), 0) AS stock,
                (SELECT name FROM warehouse_items WHERE id = $1) AS name
         FROM warehouse_stock_moves WHERE item_id = $1`,
        [l.item_id]
      );
      const stock = Number(stockRow?.stock ?? 0);
      const name = stockRow?.name ?? l.item_id;
      if (stock < qty) return { ok: false, error: `Thiếu tồn "${name}": cần ${qty}, còn ${stock}` };
      consumption.push({ line: l, qty, avgCost: await getItemAvgCost(l.item_id), name });
    } else {
      const stockRow = await queryOne<{ stock: string; name: string }>(
        `SELECT COALESCE(SUM(CASE move_type WHEN 'in' THEN quantity WHEN 'return' THEN quantity
                 ELSE -quantity END), 0) AS stock,
                (SELECT name FROM warehouse_supplies WHERE id = $1) AS name
         FROM warehouse_supply_moves WHERE supply_id = $1`,
        [l.supply_id]
      );
      const stock = Number(stockRow?.stock ?? 0);
      const name = stockRow?.name ?? l.supply_id;
      if (stock < qty) return { ok: false, error: `Thiếu vật tư "${name}": cần ${qty}, còn ${stock}` };
      consumption.push({ line: l, qty, avgCost: await getSupplyAvgCost(l.supply_id), name });
    }
  }

  // Chi phí nguyên liệu (thành phần chưa có giá vốn tính 0 đồng — hiện cảnh báo ở UI)
  const materialCost = Math.round(
    consumption.reduce((s, c) => s + c.qty * (c.avgCost ?? 0), 0)
  );
  const unitCost = Math.round((materialCost / actual) * 100) / 100;

  await withTransaction(async (client) => {
    for (const c of consumption) {
      if (c.line.item_id) {
        await client.query(
          `INSERT INTO warehouse_stock_moves
             (id, warehouse_id, item_id, move_type, quantity, production_order_id, note, created_by)
           VALUES ($1,$2,$3,'production_out',$4,$5,$6,$7::uuid)`,
          [newId('wsm'), order.warehouse_id, c.line.item_id, c.qty, order.id,
           `Lô ${order.code}`, input.completedBy]
        );
      } else {
        await client.query(
          `INSERT INTO warehouse_supply_moves
             (id, warehouse_id, supply_id, move_type, quantity, note, created_by)
           VALUES ($1,$2,$3,'out',$4,$5,$6::uuid)`,
          [newId('wspm'), order.warehouse_id, c.line.supply_id, c.qty,
           `Sản xuất lô ${order.code}`, input.completedBy]
        );
      }
    }
    // Nhập kho thành phẩm với giá vốn cuộn từ nguyên liệu
    await client.query(
      `INSERT INTO warehouse_stock_moves
         (id, warehouse_id, item_id, move_type, quantity, unit_cost, production_order_id, note, created_by)
       VALUES ($1,$2,$3,'production_in',$4,$5,$6,$7,$8::uuid)`,
      [newId('wsm'), order.warehouse_id, order.finished_item_id, actual, unitCost, order.id,
       `Nhập TP lô ${order.code}${waste > 0 ? ` (phế phẩm ${waste})` : ''}`, input.completedBy]
    );
    await client.query(
      `UPDATE warehouse_production_orders SET
         status = 'completed', actual_qty = $2, waste_qty = $3,
         material_cost = $4, unit_cost = $5,
         note = COALESCE($6, note), completed_at = NOW()
       WHERE id = $1`,
      [order.id, actual, waste, materialCost, unitCost, input.note ?? null]
    );
  });

  return { ok: true, materialCost, unitCost };
}

export async function cancelProductionOrder(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const n = await execute(
    `UPDATE warehouse_production_orders SET status = 'cancelled'
     WHERE id = $1 AND status IN ('draft', 'in_progress')`,
    [orderId]
  );
  return n > 0 ? { ok: true } : { ok: false, error: 'Lô đã hoàn thành — không hủy được' };
}

/**
 * Xoá hẳn 1 lô sản xuất khỏi danh sách.
 * CHẶN lô đã 'completed': backflush đã trừ nguyên liệu + nhập thành phẩm vào sổ kho —
 * xoá lô là mất dấu vết vì sao tồn thay đổi (dòng sổ có production_order_id bị SET NULL).
 * Lô draft/in_progress/cancelled chưa ghi sổ → xoá an toàn (sản lượng gắn lô chỉ mất
 * liên kết lô, bản ghi vẫn còn).
 */
export async function deleteProductionOrder(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const o = await queryOne<{ status: string; code: string }>(
    `SELECT status, code FROM warehouse_production_orders WHERE id = $1`, [orderId]
  );
  if (!o) return { ok: false, error: 'Không tìm thấy lô' };
  if (o.status === 'completed') {
    return { ok: false, error: `Lô ${o.code} đã hoàn thành — không xoá được (đã trừ NVL & nhập thành phẩm vào sổ kho).` };
  }
  await execute(`DELETE FROM warehouse_production_orders WHERE id = $1`, [orderId]);
  return { ok: true };
}

/** Chi tiết tiêu hao nguyên liệu của 1 lô (đối chiếu định mức vs thực tế). */
export async function getOrderConsumption(orderId: string): Promise<any[]> {
  return query(
    `SELECT sm.quantity, sm.move_type, i.name, i.sku, i.unit
     FROM warehouse_stock_moves sm
     JOIN warehouse_items i ON i.id = sm.item_id
     WHERE sm.production_order_id = $1
     ORDER BY sm.move_type DESC, i.name`,
    [orderId]
  );
}

export { nextCode };
