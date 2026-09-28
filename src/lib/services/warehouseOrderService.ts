/**
 * ĐƠN HÀNG kho/xưởng (mig 296) — xương sống trục A-Z:
 * đơn khách → nổ lệnh sản xuất NHIỀU CẤP (MRP-lite đệ quy) → nhập thành phẩm → xuất theo đơn.
 *
 * Mô hình tham chiếu = Solace (công thức → bán → trừ kho):
 * - Mã đơn sinh NGUYÊN TỬ qua warehouse_code_counters (không dùng COUNT(*) như nextCode cũ).
 * - FSM trạng thái: draft → confirmed → in_production → ready → shipped (hoặc cancelled).
 * - planProduction chỉ ĐỀ XUẤT (cây theo cấp + cảnh báo thiếu nguyên liệu) — người quản lý
 *   duyệt rồi mới tạo chuỗi lệnh. Mỗi lệnh vẫn backflush 1 cấp (completeProductionOrder
 *   sẵn có), chạy từ cấp sâu nhất lên.
 */
import crypto from 'crypto';
import { query, queryOne, execute, withTransaction } from '@/lib/db';
import { getItemStock } from '@/lib/services/warehouseInventoryService';
import { createProductionOrder } from '@/lib/services/warehouseProductionService';
import { createShipment } from '@/lib/services/warehouseShipmentService';

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ===== Sinh mã nguyên tử =====

/**
 * Sinh mã PREFIX-YYYY-NNNN qua bảng counter (UPSERT + RETURNING trong 1 câu — nguyên tử).
 * Sửa lỗi của nextCode() cũ: COUNT(*) trùng mã khi xóa bản ghi hoặc 2 người tạo cùng lúc.
 */
export async function nextCodeAtomic(warehouseId: string, prefix: string): Promise<string> {
  const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' }).format(new Date()));
  const row = await queryOne<{ seq: number }>(
    `INSERT INTO warehouse_code_counters (warehouse_id, prefix, year, seq)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (warehouse_id, prefix, year) DO UPDATE SET seq = warehouse_code_counters.seq + 1
     RETURNING seq`,
    [warehouseId, prefix, year]
  );
  return `${prefix}-${year}-${String(row!.seq).padStart(4, '0')}`;
}

// ===== Kiểu dữ liệu =====

export type OrderStatus = 'draft' | 'confirmed' | 'in_production' | 'ready' | 'shipped' | 'cancelled';

export interface OrderLine {
  id: string;
  item_id: string;
  item_name?: string;
  sku?: string;
  unit?: string;
  quantity: number;
  in_stock?: number;     // tồn hiện tại của item
  shipped?: number;      // đã xuất cho đơn này
}

export interface WarehouseOrder {
  id: string;
  warehouse_id: string;
  code: string;
  customer_name: string;
  customer_contact: string | null;
  status: OrderStatus;
  expected_date: string | null;
  note: string | null;
  created_at: string;
  lines?: OrderLine[];
  production_orders?: any[];
  shipments?: any[];
}

// ===== CRUD + FSM =====

export async function listOrders(warehouseId: string, status?: string): Promise<any[]> {
  const p: unknown[] = [warehouseId];
  let where = `o.warehouse_id = $1`;
  if (status) { p.push(status); where += ` AND o.status = $${p.length}`; }
  return query(
    `SELECT o.*,
            (SELECT COUNT(*)::int FROM warehouse_order_lines l WHERE l.order_id = o.id) AS line_count,
            (SELECT COALESCE(SUM(l.quantity), 0) FROM warehouse_order_lines l WHERE l.order_id = o.id) AS total_qty
       FROM warehouse_orders o
      WHERE ${where}
      ORDER BY o.created_at DESC
      LIMIT 200`,
    p
  );
}

export async function getOrder(orderId: string): Promise<WarehouseOrder | null> {
  const order = await queryOne<WarehouseOrder>(`SELECT * FROM warehouse_orders WHERE id = $1`, [orderId]);
  if (!order) return null;

  const lines = await query<any>(
    `SELECT l.id, l.item_id, l.quantity, i.name AS item_name, i.sku, i.unit,
            COALESCE((SELECT SUM(CASE WHEN m.move_type IN ('purchase_in','production_in','adjust_in')
                                      THEN m.quantity ELSE -m.quantity END)
                        FROM warehouse_stock_moves m WHERE m.item_id = l.item_id), 0) AS in_stock,
            COALESCE((SELECT SUM(m.quantity) FROM warehouse_stock_moves m
                       JOIN warehouse_shipments s ON s.id = m.shipment_id
                      WHERE m.item_id = l.item_id AND m.move_type = 'ship_out'
                        AND s.order_id = l.order_id), 0) AS shipped
       FROM warehouse_order_lines l
       JOIN warehouse_items i ON i.id = l.item_id
      WHERE l.order_id = $1
      ORDER BY i.name`,
    [orderId]
  );
  order.lines = lines.map((l) => ({ ...l, quantity: num(l.quantity), in_stock: num(l.in_stock), shipped: num(l.shipped) }));

  order.production_orders = await query(
    `SELECT id, code, status, planned_qty, actual_qty, finished_item_id,
            (SELECT name FROM warehouse_items WHERE id = finished_item_id) AS item_name, note
       FROM warehouse_production_orders WHERE order_id = $1 ORDER BY created_at`,
    [orderId]
  );
  order.shipments = await query(
    `SELECT id, code, status, shipped_at FROM warehouse_shipments WHERE order_id = $1 ORDER BY created_at`,
    [orderId]
  );
  return order;
}

export async function createOrder(input: {
  warehouseId: string;
  customerName: string;
  customerContact?: string | null;
  expectedDate?: string | null;
  note?: string | null;
  lines: { itemId: string; quantity: number }[];
  createdBy: string;
}): Promise<{ ok: boolean; error?: string; order?: { id: string; code: string } }> {
  const valid = input.lines.filter((l) => l.itemId && Number.isFinite(l.quantity) && l.quantity > 0);
  if (!input.customerName?.trim()) return { ok: false, error: 'Nhập tên khách hàng / nơi nhận' };
  if (valid.length === 0) return { ok: false, error: 'Đơn hàng cần ít nhất 1 dòng hàng' };

  const code = await nextCodeAtomic(input.warehouseId, 'DH');
  const orderId = newId('who');
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO warehouse_orders (id, warehouse_id, code, customer_name, customer_contact, expected_date, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [orderId, input.warehouseId, code, input.customerName.trim(),
       input.customerContact?.trim() || null, input.expectedDate || null,
       input.note?.trim() || null, input.createdBy]
    );
    for (const l of valid) {
      await client.query(
        `INSERT INTO warehouse_order_lines (id, order_id, item_id, quantity)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (order_id, item_id) DO UPDATE SET quantity = warehouse_order_lines.quantity + EXCLUDED.quantity`,
        [newId('whol'), orderId, l.itemId, l.quantity]
      );
    }
  });
  return { ok: true, order: { id: orderId, code } };
}

/** FSM: các bước chuyển hợp lệ. shipped/ready do syncOrderStatus tự tính — không chuyển tay. */
const MANUAL_TRANSITIONS: Record<string, OrderStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['cancelled'],
  in_production: ['cancelled'],
  ready: ['cancelled'],
};

export async function setOrderStatus(orderId: string, to: OrderStatus): Promise<{ ok: boolean; error?: string }> {
  const order = await queryOne<{ status: OrderStatus }>(`SELECT status FROM warehouse_orders WHERE id = $1`, [orderId]);
  if (!order) return { ok: false, error: 'Không tìm thấy đơn hàng' };
  if (!(MANUAL_TRANSITIONS[order.status] ?? []).includes(to)) {
    return { ok: false, error: `Không thể chuyển từ "${order.status}" sang "${to}"` };
  }
  if (to === 'cancelled') {
    // Không hủy đơn khi đã có lô SX đang chạy/hoàn thành hoặc đợt xuất chưa hủy.
    const busy = await queryOne<{ n: number }>(
      `SELECT (SELECT COUNT(*) FROM warehouse_production_orders WHERE order_id = $1 AND status IN ('in_progress','completed'))
            + (SELECT COUNT(*) FROM warehouse_shipments WHERE order_id = $1 AND status <> 'cancelled') AS n`,
      [orderId]
    );
    if ((busy?.n ?? 0) > 0) {
      return { ok: false, error: 'Đơn đã có lệnh sản xuất/đợt xuất gắn vào — hủy các phần đó trước' };
    }
  }
  await execute(
    `UPDATE warehouse_orders SET status = $2, confirmed_at = CASE WHEN $2 = 'confirmed' THEN NOW() ELSE confirmed_at END
      WHERE id = $1`,
    [orderId, to]
  );
  return { ok: true };
}

export async function deleteOrder(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const order = await queryOne<{ status: string }>(`SELECT status FROM warehouse_orders WHERE id = $1`, [orderId]);
  if (!order) return { ok: false, error: 'Không tìm thấy đơn hàng' };
  if (order.status !== 'draft') return { ok: false, error: 'Chỉ xóa được đơn nháp — đơn đã chốt thì Hủy thay vì xóa' };
  await execute(`DELETE FROM warehouse_orders WHERE id = $1`, [orderId]);
  return { ok: true };
}

// ===== MRP-lite: nổ lệnh sản xuất đệ quy theo BOM =====

export interface PlanNode {
  itemId: string;
  itemName: string;
  itemType: string;
  unit: string;
  /** Cấp trong cây: 0 = thành phẩm khách đặt, 1 = bán thành phẩm cấp dưới... */
  level: number;
  required: number;   // tổng cần
  inStock: number;    // tồn hiện có
  toProduce: number;  // thiếu → cần sản xuất
}

export interface PlanShortage {
  kind: 'raw' | 'supply';
  id: string;
  name: string;
  unit: string;
  required: number;
  inStock: number;
  missing: number;
}

export interface ProductionPlan {
  nodes: PlanNode[];        // các cấp cần sản xuất (sắp theo level tăng dần)
  shortages: PlanShortage[]; // nguyên liệu thô/vật tư THIẾU — phải mua trước khi chạy
}

async function getSupplyStockLocal(supplyId: string): Promise<number> {
  const row = await queryOne<{ stock: string }>(
    `SELECT COALESCE(SUM(CASE WHEN move_type IN ('in','return') THEN quantity ELSE -quantity END), 0) AS stock
       FROM warehouse_supply_moves WHERE supply_id = $1`,
    [supplyId]
  );
  return num(row?.stock);
}

/**
 * "Nổ" kế hoạch sản xuất cho 1 đơn — ĐỆ QUY qua BOM nhiều cấp.
 *
 * Với mỗi item thiếu tồn: nếu có BOM active → thêm node "cần sản xuất" rồi đệ quy
 * xuống từng component (component là item có BOM → tính tiếp; là raw/không BOM hoặc
 * supply → chỉ kiểm tồn, thiếu thì ghi vào shortages để đi mua).
 * Chống vòng lặp BOM (A cần B, B cần A) bằng đường đi hiện tại (path Set).
 */
export async function planProduction(orderId: string): Promise<{ ok: boolean; error?: string; plan?: ProductionPlan }> {
  const order = await getOrder(orderId);
  if (!order) return { ok: false, error: 'Không tìm thấy đơn hàng' };
  if (!['draft', 'confirmed'].includes(order.status)) {
    return { ok: false, error: 'Chỉ nổ lệnh cho đơn nháp/đã chốt' };
  }

  // Gom nhu cầu theo item (cùng item ở nhiều nhánh → cộng dồn), giữ level SÂU NHẤT
  // để thứ tự sản xuất đúng (cấp sâu làm trước).
  const needMap = new Map<string, PlanNode>();
  const shortageMap = new Map<string, PlanShortage>();

  const addShortage = (kind: 'raw' | 'supply', id: string, name: string, unit: string, required: number, inStock: number) => {
    const key = `${kind}:${id}`;
    const cur = shortageMap.get(key);
    if (cur) {
      cur.required += required;
      cur.missing = Math.max(0, cur.required - cur.inStock);
    } else {
      shortageMap.set(key, { kind, id, name, unit, required, inStock, missing: Math.max(0, required - inStock) });
    }
  };

  async function explode(itemId: string, requiredQty: number, level: number, path: Set<string>): Promise<{ ok: true } | { ok: false; error: string }> {
    if (path.has(itemId)) {
      const it = await queryOne<{ name: string }>(`SELECT name FROM warehouse_items WHERE id = $1`, [itemId]);
      return { ok: false, error: `Định mức bị VÒNG LẶP tại "${it?.name ?? itemId}" (A cần B, B lại cần A) — sửa BOM trước` };
    }

    const item = await queryOne<{ id: string; name: string; item_type: string; unit: string }>(
      `SELECT id, name, item_type, unit FROM warehouse_items WHERE id = $1`, [itemId]
    );
    if (!item) return { ok: false, error: 'Mặt hàng trong định mức không còn tồn tại' };

    const inStock = await getItemStock(itemId);
    const existing = needMap.get(itemId);
    const totalRequired = (existing?.required ?? 0) + requiredQty;
    // Tồn chỉ trừ MỘT lần cho tổng nhu cầu của item này (không trừ lặp mỗi nhánh).
    const toProduce = Math.max(0, totalRequired - inStock);

    const bom = await queryOne<{ id: string }>(
      `SELECT id FROM warehouse_boms WHERE finished_item_id = $1 AND active = TRUE`, [itemId]
    );

    if (!bom) {
      // Không có định mức → coi như nguyên liệu phải MUA (raw hoặc item chưa khai BOM).
      addShortage('raw', item.id, item.name, item.unit, requiredQty, inStock);
      return { ok: true };
    }

    const deltaToProduce = toProduce - (existing?.toProduce ?? 0);   // phần PHÁT SINH THÊM ở lần gọi này
    needMap.set(itemId, {
      itemId: item.id, itemName: item.name, itemType: item.item_type, unit: item.unit,
      level: Math.max(level, existing?.level ?? 0),
      required: totalRequired, inStock, toProduce,
    });
    if (deltaToProduce <= 0) return { ok: true };   // tồn đủ phần thêm — không nổ tiếp

    const lines = await query<{ item_id: string | null; supply_id: string | null; quantity: string }>(
      `SELECT item_id, supply_id, quantity FROM warehouse_bom_lines WHERE bom_id = $1`, [bom.id]
    );
    const nextPath = new Set(path).add(itemId);
    for (const l of lines) {
      const compQty = num(l.quantity) * deltaToProduce;
      if (l.supply_id) {
        const sup = await queryOne<{ name: string; unit: string }>(
          `SELECT name, unit FROM warehouse_supplies WHERE id = $1`, [l.supply_id]
        );
        addShortage('supply', l.supply_id, sup?.name ?? l.supply_id, sup?.unit ?? '', compQty, await getSupplyStockLocal(l.supply_id));
      } else if (l.item_id) {
        const r = await explode(l.item_id, compQty, level + 1, nextPath);
        if (!r.ok) return r;
      }
    }
    return { ok: true };
  }

  for (const line of order.lines ?? []) {
    const r = await explode(line.item_id, line.quantity, 0, new Set());
    if (!r.ok) return { ok: false, error: r.error };
  }

  const nodes = Array.from(needMap.values())
    .filter((n) => n.toProduce > 0)
    .sort((a, b) => b.level - a.level);   // cấp sâu trước — đúng thứ tự sản xuất
  const shortages = Array.from(shortageMap.values()).filter((s) => s.missing > 0);

  return { ok: true, plan: { nodes, shortages } };
}

/**
 * Tạo CHUỖI lệnh sản xuất từ cây đã duyệt (mỗi node 1 lệnh, gắn order_id).
 * Dùng lại createProductionOrder sẵn có (đã validate BOM) rồi UPDATE order_id.
 */
export async function createProductionChain(input: {
  orderId: string;
  nodes: { itemId: string; qty: number; level: number }[];
  createdBy: string;
}): Promise<{ ok: boolean; error?: string; created?: { code: string; itemId: string }[] }> {
  const order = await queryOne<{ id: string; warehouse_id: string; code: string; status: string }>(
    `SELECT id, warehouse_id, code, status FROM warehouse_orders WHERE id = $1`, [input.orderId]
  );
  if (!order) return { ok: false, error: 'Không tìm thấy đơn hàng' };
  if (!['draft', 'confirmed'].includes(order.status)) return { ok: false, error: 'Đơn đã nổ lệnh hoặc đã đóng' };
  if (!input.nodes.length) return { ok: false, error: 'Không có cấp nào cần sản xuất' };

  const created: { code: string; itemId: string }[] = [];
  // Cấp sâu tạo trước để mã lô theo đúng thứ tự chạy.
  const ordered = [...input.nodes].sort((a, b) => b.level - a.level);
  for (const n of ordered) {
    const r = await createProductionOrder({
      warehouseId: order.warehouse_id,
      finishedItemId: n.itemId,
      plannedQty: n.qty,
      note: `Đơn ${order.code} — cấp ${n.level}${n.level > 0 ? ' (làm trước cấp trên)' : ''}`,
      createdBy: input.createdBy,
    });
    if (!r.ok || !r.order) return { ok: false, error: `Lỗi tạo lô cho cấp ${n.level}: ${r.error}` };
    await execute(`UPDATE warehouse_production_orders SET order_id = $2 WHERE id = $1`, [r.order.id, input.orderId]);
    created.push({ code: r.order.code, itemId: n.itemId });
  }

  await execute(`UPDATE warehouse_orders SET status = 'in_production' WHERE id = $1 AND status IN ('draft','confirmed')`, [input.orderId]);
  return { ok: true, created };
}

// ===== Xuất hàng theo đơn =====

/** Tạo đợt xuất từ đơn — line = phần khách đặt CHƯA xuất. Dùng lại createShipment sẵn có. */
export async function createShipmentFromOrder(orderId: string, createdBy: string): Promise<{ ok: boolean; error?: string; shipment?: any }> {
  const order = await getOrder(orderId);
  if (!order) return { ok: false, error: 'Không tìm thấy đơn hàng' };
  if (['shipped', 'cancelled'].includes(order.status)) return { ok: false, error: 'Đơn đã xuất đủ hoặc đã hủy' };

  const remaining = (order.lines ?? [])
    .map((l) => ({ itemId: l.item_id, qtyPlanned: l.quantity - (l.shipped ?? 0) }))
    .filter((l) => l.qtyPlanned > 0);
  if (!remaining.length) return { ok: false, error: 'Mọi dòng hàng đã xuất đủ' };

  const r = await createShipment({
    warehouseId: order.warehouse_id,
    customer: order.customer_name,
    note: `Theo đơn ${order.code}`,
    lines: remaining,
    createdBy,
  });
  if (!r.ok || !r.shipment) return r;
  await execute(`UPDATE warehouse_shipments SET order_id = $2 WHERE id = $1`, [r.shipment.id, orderId]);
  return r;
}

// ===== Đồng bộ trạng thái đơn (hook sau complete lô / finalize xuất) =====

/**
 * Gỡ kẹt đơn khi chuỗi lệnh SX bị XÓA/HỦY hết: đơn 'in_production' mà không còn
 * lô nào sống (draft/in_progress/completed) → trả về 'confirmed' để nổ lệnh lại được.
 * (planProduction chỉ chạy với draft/confirmed — thiếu bước này là đơn kẹt vĩnh viễn.)
 */
export async function revertOrderIfNoProduction(orderId: string): Promise<void> {
  const alive = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM warehouse_production_orders
      WHERE order_id = $1 AND status IN ('draft', 'in_progress', 'completed')`,
    [orderId]
  );
  if ((alive?.n ?? 0) === 0) {
    await execute(
      `UPDATE warehouse_orders SET status = 'confirmed' WHERE id = $1 AND status = 'in_production'`,
      [orderId]
    );
  }
}

/**
 * Tự tính trạng thái đơn từ thực tế kho:
 * - Xuất đủ mọi line → 'shipped' (+ shipped_at).
 * - Chưa xuất đủ nhưng tồn hiện có ≥ phần còn thiếu của mọi line → 'ready'.
 * Không hạ cấp trạng thái; không đụng draft/cancelled.
 */
export async function syncOrderStatus(orderId: string): Promise<void> {
  const order = await getOrder(orderId);
  if (!order || !order.lines?.length) return;
  if (['draft', 'cancelled', 'shipped'].includes(order.status)) return;

  const allShipped = order.lines.every((l) => (l.shipped ?? 0) >= l.quantity);
  if (allShipped) {
    await execute(`UPDATE warehouse_orders SET status = 'shipped', shipped_at = NOW() WHERE id = $1`, [orderId]);
    return;
  }
  const allCoverable = order.lines.every((l) => (l.in_stock ?? 0) >= l.quantity - (l.shipped ?? 0));
  if (allCoverable && order.status === 'in_production') {
    await execute(`UPDATE warehouse_orders SET status = 'ready' WHERE id = $1`, [orderId]);
  }
}
