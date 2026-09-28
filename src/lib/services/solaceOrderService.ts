/**
 * solaceOrderService — Đơn hàng quán SOLACE (POS + webapp).
 * - Giá tính LẠI ở server từ giá món + tuỳ chọn (không tin client).
 * - Tạo đơn + trừ kho theo công thức trong 1 transaction (an toàn).
 * - Huỷ đơn → hoàn kho.
 * Tiền BIGINT đồng VND.
 */
import { query, queryOne, withTransaction } from '@/lib/db';
import { logActivity } from '@/lib/services/auditService';
import { generateOrderCode } from '@/lib/services/solaceOrderCodeService';
import { recordMovement, getOptionRecipesForValues } from '@/lib/services/solaceInventoryService';
import { getInventoryConfig } from '@/lib/services/solaceSettingsService';
import { creditWalletTx, refundWalletTx } from '@/lib/services/solaceWalletService';
import { postCashTxn } from '@/lib/services/solaceCashService';
import { notify } from '@/lib/notifications/engine';
import { formatVND } from '@/lib/format';
import { validateVoucher, consumeVoucher } from '@/lib/services/solaceVoucherService';
import { getActiveShift } from '@/lib/services/solaceShiftService';
import { editAllOrderMessages } from '@/lib/solace/solaceBotAdmin';
import { settleOrder } from '@/lib/services/solaceDebtService';

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Nhật ký thao tác theo đơn (audit) ───────────────────────────────────────
export type OrderEventKind = 'created' | 'status' | 'paid' | 'cancelled' | 'edited' | 'payment_changed';

/** Ghi 1 sự kiện vào nhật ký đơn. Truyền `client` để ghi trong cùng transaction (atomic). */
export async function recordOrderEvent(
  e: { orderId: string; kind: OrderEventKind; detail?: string | null; actor?: string | null },
  client?: import('pg').PoolClient
): Promise<void> {
  const sql = `INSERT INTO solace_order_events (id, order_id, kind, detail, actor) VALUES ($1,$2,$3,$4,$5)`;
  const params = [genId('soev'), e.orderId, e.kind, e.detail ?? null, e.actor ?? null];
  if (client) await client.query(sql, params);
  else await query(sql, params).catch(() => {});
}

export interface OrderEvent {
  id: string; order_id: string; kind: string; detail: string | null;
  actor: string | null; actor_name: string | null; created_at: string;
}
/** Lịch sử thao tác của 1 đơn (kèm tên người thực hiện). */
export async function getOrderEvents(orderId: string): Promise<OrderEvent[]> {
  return query<OrderEvent>(
    `SELECT e.id, e.order_id, e.kind, e.detail, e.actor, u.name AS actor_name, e.created_at
       FROM solace_order_events e LEFT JOIN users u ON u.id::text = e.actor
      WHERE e.order_id = $1 ORDER BY e.created_at ASC, e.id ASC`,
    [orderId]
  );
}

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'delivering' | 'done' | 'cancelled';
export type PaymentMethod = 'cash' | 'wallet' | 'bankqr';

export interface OrderItemInput {
  product_id: string;
  qty: number;
  option_value_ids?: string[];
  note?: string | null;
}
export type FulfillmentType = 'counter' | 'dine_in' | 'delivery';
export interface CreateOrderInput {
  channel?: 'pos' | 'web' | 'telegram' | 'guest';
  customer_user_id?: string | null;
  customer_name?: string | null;
  fulfillment_type: FulfillmentType;
  floor_note?: string | null;      // tầng/vị trí (dine_in) hoặc tầng/phòng giao (delivery)
  customer_phone?: string | null;
  payment_method: PaymentMethod;
  paid?: boolean;                 // true = đã thu (vd tiền mặt tại quầy)
  paymentStatus?: 'unpaid' | 'debt'; // ghi đè khi chưa thu (vd 'debt' cho ghi nợ)
  discount?: number;              // giảm giá (đồng) — thủ công hoặc từ voucher
  voucher_code?: string | null;
  delivery_fee?: number;          // phí giao (đồng)
  pickup_time?: string | null;    // giờ hẹn nhận (ISO) — đặt webapp
  note?: string | null;
  items: OrderItemInput[];
}

export interface SolaceOrderItem {
  id: string; product_id: string | null; name_snapshot: string;
  unit_price: number; qty: number; line_total: number; options_json: unknown; note: string | null;
}
export interface SolaceOrder {
  id: string; code: string | null; channel: string; customer_user_id: string | null; customer_name: string | null;
  status: OrderStatus; fulfillment_type: string; floor_note: string | null;
  subtotal: number; discount: number; delivery_fee: number; total: number;
  payment_method: string | null; payment_status: string; paid_amount: number;
  customer_phone: string | null; voucher_code: string | null;
  note: string | null; cancel_reason: string | null; pickup_time: string | null; business_date: string | null;
  created_by: string | null; served_by: string | null; created_at: string; paid_at: string | null;
  items?: SolaceOrderItem[];
  /** Cảnh báo tồn kho sau khi trừ (chỉ trả khi tạo đơn, không lưu DB). */
  warnings?: string[];
}

async function walletBalanceOf(userId: string | null | undefined): Promise<number> {
  if (!userId) return 0;
  const r = await queryOne<{ balance: number }>(`SELECT balance FROM solace_wallets WHERE user_id = $1`, [userId]);
  return Number(r?.balance ?? 0);
}

/**
 * Tự áp credit ví sẵn có vào đơn chưa thu. Chỉ trừ tối đa phần còn thiếu.
 * Trả về số tiền thực tế đã áp.
 */
export async function applyAvailableWalletCredit(orderId: string, actor?: string | null): Promise<number> {
  const o = await queryOne<{ customer_user_id: string | null; total: number; paid_amount: number; payment_status: string; status: string }>(
    `SELECT customer_user_id, total, paid_amount, payment_status, status FROM solace_orders WHERE id = $1`,
    [orderId]
  );
  if (!o?.customer_user_id) return 0;
  if (o.status === 'cancelled' || o.payment_status === 'paid') return 0;
  const due = Math.max(0, Number(o.total) - Number(o.paid_amount ?? 0));
  if (!(due > 0)) return 0;
  const bal = await walletBalanceOf(o.customer_user_id);
  const amt = Math.min(due, bal);
  if (!(amt > 0)) return 0;
  const r = await settleOrder(orderId, amt, 'wallet', actor ?? null);
  return r.amountApplied;
}

/** Tạo đơn mới + trừ kho theo công thức (transaction). */
export async function createOrder(input: CreateOrderInput, actor?: string | null): Promise<SolaceOrder> {
  if (!input.items || input.items.length === 0) throw new Error('Đơn chưa có món nào');
  if ((input.fulfillment_type === 'dine_in' || input.fulfillment_type === 'delivery') && !input.floor_note?.trim()) {
    throw new Error('Nhận tại chỗ / giao hàng cần ghi rõ tầng/vị trí');
  }

  // Lấy giá món + tuỳ chọn + công thức (đọc trước transaction).
  const productIds = [...new Set(input.items.map(i => i.product_id))];
  const products = await query<{ id: string; name: string; price: number; track_recipe: boolean; is_active: boolean }>(
    `SELECT id, name, price, track_recipe, is_active FROM solace_products WHERE id = ANY($1)`, [productIds]
  );
  const pMap = new Map(products.map(p => [p.id, p]));

  const allOptIds = [...new Set(input.items.flatMap(i => i.option_value_ids ?? []))];
  const optValues = allOptIds.length
    ? await query<{ id: string; name: string; extra_price: number; group_id: string }>(
        `SELECT id, name, extra_price, group_id FROM solace_option_values WHERE id = ANY($1)`, [allOptIds])
    : [];
  const oMap = new Map(optValues.map(o => [o.id, o]));

  const recipes = await query<{ product_id: string; ingredient_id: string; qty: number; wastage_pct: number }>(
    `SELECT product_id, ingredient_id, qty, wastage_pct FROM solace_recipe_items WHERE product_id = ANY($1)`, [productIds]
  );

  // Định mức cộng thêm theo tuỳ chọn khách chọn (vd "thêm đường", "topping").
  const optRecipes = await getOptionRecipesForValues(allOptIds);

  const invCfg = await getInventoryConfig();

  // Dựng dòng đơn + tổng tiền (server tính).
  let subtotal = 0;
  const lines = input.items.map(it => {
    const p = pMap.get(it.product_id);
    if (!p) throw new Error('Món không tồn tại');
    if (!p.is_active) throw new Error(`Món "${p.name}" đã ngừng bán`);
    const qty = Math.max(1, Math.floor(it.qty));
    const opts = (it.option_value_ids ?? []).map(id => oMap.get(id)).filter(Boolean) as typeof optValues;
    const extra = opts.reduce((s, o) => s + Number(o.extra_price), 0);
    const unit_price = Number(p.price) + extra;
    const line_total = unit_price * qty;
    subtotal += line_total;
    return {
      id: genId('soit'), product_id: p.id, name_snapshot: p.name, unit_price, qty, line_total,
      options_json: opts.map(o => ({ group_id: o.group_id, value_id: o.id, name: o.name, extra_price: Number(o.extra_price) })),
      note: it.note ?? null, track_recipe: p.track_recipe,
    };
  });
  let discount = Math.max(0, Math.min(Math.round(input.discount ?? 0), subtotal));
  let voucherCode: string | null = null;
  if (input.voucher_code?.trim()) {
    const vc = await validateVoucher(input.voucher_code, subtotal,
      lines.map(l => ({ product_id: l.product_id, unit_price: l.unit_price, qty: l.qty })));
    if (!vc.ok) throw new Error(`Mã giảm giá: ${vc.message}`);
    // Mã thưởng có chủ: khi KHÁCH tự đặt (web/telegram) phải đúng người được thưởng.
    // Quầy (pos) áp hộ tự do vì khách có thể không đăng nhập tại quầy.
    if (vc.isReward && vc.ownerUserId && input.channel && input.channel !== 'pos' && input.customer_user_id !== vc.ownerUserId) {
      throw new Error('Mã thưởng này không phải của bạn');
    }
    discount = vc.discount;
    voucherCode = vc.code ?? input.voucher_code.trim().toUpperCase();
  }
  const deliveryFee = Math.max(0, Math.round(input.delivery_fee ?? 0));
  const total = subtotal - discount + deliveryFee;
  const { code, businessDate } = await generateOrderCode();
  const paid = !!input.paid;
  const paymentStatus = paid ? 'paid' : (input.paymentStatus ?? 'unpaid');
  const orderId = genId('sord');
  const usedIngredientIds = new Set<string>();
  // Gắn đơn vào ca đang mở (nếu có) — mở ca không bắt buộc nên có thể NULL.
  const activeShift = await getActiveShift();
  const shiftId = activeShift?.id ?? null;

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO solace_orders
         (id, code, channel, customer_user_id, customer_name, status, fulfillment_type, floor_note, customer_phone,
          subtotal, discount, delivery_fee, total, payment_method, payment_status, paid_amount, note, voucher_code, pickup_time, business_date, created_by, paid_at, shift_id)
       VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [orderId, code, input.channel ?? 'pos', input.customer_user_id ?? null, input.customer_name ?? null,
       input.fulfillment_type, input.floor_note ?? null, input.customer_phone ?? null, subtotal, discount, deliveryFee, total, input.payment_method,
       paymentStatus, paid ? total : 0, input.note ?? null, voucherCode, input.pickup_time ?? null, businessDate, actor ?? null, paid ? new Date().toISOString() : null, shiftId]
    );
    for (const l of lines) {
      await client.query(
        `INSERT INTO solace_order_items (id, order_id, product_id, name_snapshot, unit_price, qty, line_total, options_json, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
        [l.id, orderId, l.product_id, l.name_snapshot, l.unit_price, l.qty, l.line_total, JSON.stringify(l.options_json), l.note]
      );
      // Gom nhu cầu nguyên liệu = công thức MÓN (nếu bật trừ kho theo công thức)
      // + định mức của các TÙY CHỌN khách chọn (vd "thêm đường", "topping").
      const needRows: { ingredient_id: string; qty: number; wastage_pct: number }[] = [];
      if (l.track_recipe) needRows.push(...recipes.filter(r => r.product_id === l.product_id));
      for (const o of l.options_json) {
        needRows.push(...optRecipes.filter(r => r.option_value_id === o.value_id));
      }
      for (const r of needRows) {
        const need = Number(r.qty) * (1 + Number(r.wastage_pct) / 100) * l.qty;
        if (!(need > 0)) continue;
        if (!invCfg.allowNegativeStock) {
          const cur = await client.query<{ stock_qty: string }>(
            `SELECT stock_qty FROM solace_ingredients WHERE id = $1 FOR UPDATE`, [r.ingredient_id]);
          if (cur.rowCount && Number(cur.rows[0].stock_qty) < need) {
            throw new Error('Không đủ nguyên liệu trong kho');
          }
        }
        await recordMovement({
          ingredientId: r.ingredient_id, type: 'out', qty: -need,
          reason: 'sale', refType: 'order', refId: orderId, performedBy: actor ?? null,
        }, client);
        usedIngredientIds.add(r.ingredient_id);
      }
    }
    await recordOrderEvent({ orderId, kind: 'created', detail: `Tạo đơn — ${total}đ (${input.payment_method}${paid ? ', đã thu' : paymentStatus === 'debt' ? ', ghi nợ' : ''})`, actor: actor ?? null }, client);
  });

  if (voucherCode) await consumeVoucher(voucherCode).catch(() => {});
  void logActivity({ action: 'solace_order_created', details: `Tạo đơn ${code} — ${total}đ (${input.payment_method}${paid ? ', đã thu' : ''})`, performedBy: actor ?? 'System' }).catch(() => {});

  // Sổ Quỹ: thu tiền NGAY nếu đơn tạo ra đã thu (tiền mặt → két, VietQR/CK → ngân hàng).
  if (paid && (input.payment_method === 'cash' || input.payment_method === 'bankqr')) {
    await postCashTxn({
      account: input.payment_method === 'cash' ? 'cash' : 'bank', direction: 'in', amount: total,
      category: 'sale', refType: 'order', refId: orderId, note: `Bán hàng ${code}`, businessDate, actor,
    }).catch(() => {});
  }

  const order = (await getOrder(orderId))!;
  // Cảnh báo tồn kho sau khi trừ (âm hoặc dưới ngưỡng tối thiểu).
  if (usedIngredientIds.size > 0) {
    const rows = await query<{ name: string; unit: string; stock_qty: number; min_qty: number }>(
      `SELECT name, unit, stock_qty, min_qty FROM solace_ingredients WHERE id = ANY($1)`,
      [[...usedIngredientIds]]
    );
    order.warnings = rows
      .filter(r => Number(r.stock_qty) < 0 || (Number(r.min_qty) > 0 && Number(r.stock_qty) <= Number(r.min_qty)))
      .map(r => Number(r.stock_qty) < 0
        ? `${r.name}: ÂM KHO (${r.stock_qty} ${r.unit})`
        : `${r.name}: sắp hết (còn ${r.stock_qty} ${r.unit})`);
  }
  // Ghi nợ → báo khách (kèm tổng nợ hiện tại).
  if (paymentStatus === 'debt' && order.customer_user_id) {
    const outstanding = await getUserOutstanding(order.customer_user_id);
    await notify('solace.debt_recorded', {
      code: order.code ?? '', amount: formatVND(order.total), totalDebt: formatVND(outstanding),
    }, { recipients: [order.customer_user_id], relatedId: orderId }).catch(() => {});
  }
  return order;
}

/**
 * SỬA MÓN đơn CHƯA THU (active & payment_status != 'paid'): thay TOÀN BỘ danh sách món.
 * Kho reconcile theo NET (cộng dồn mọi biến động của đơn) → đảo về 0 rồi trừ lại theo món mới
 * ⇒ idempotent dù sửa nhiều lần. Tính lại tiền (giữ giảm giá, clamp theo tạm tính mới; giữ phí giao).
 * KHÔNG cho sửa đơn đã thanh toán (đổi tiền phức tạp — huỷ & tạo lại nếu cần).
 */
export async function editOrderItems(id: string, items: OrderItemInput[], actor?: string | null): Promise<SolaceOrder> {
  if (!items || items.length === 0) throw new Error('Đơn phải còn ít nhất 1 món (huỷ đơn nếu muốn bỏ hết)');

  // Đọc giá/tuỳ chọn/công thức trước transaction (giống createOrder).
  const productIds = [...new Set(items.map(i => i.product_id))];
  const products = await query<{ id: string; name: string; price: number; track_recipe: boolean; is_active: boolean }>(
    `SELECT id, name, price, track_recipe, is_active FROM solace_products WHERE id = ANY($1)`, [productIds]
  );
  const pMap = new Map(products.map(p => [p.id, p]));
  const allOptIds = [...new Set(items.flatMap(i => i.option_value_ids ?? []))];
  const optValues = allOptIds.length
    ? await query<{ id: string; name: string; extra_price: number; group_id: string }>(
        `SELECT id, name, extra_price, group_id FROM solace_option_values WHERE id = ANY($1)`, [allOptIds])
    : [];
  const oMap = new Map(optValues.map(o => [o.id, o]));
  const recipes = await query<{ product_id: string; ingredient_id: string; qty: number; wastage_pct: number }>(
    `SELECT product_id, ingredient_id, qty, wastage_pct FROM solace_recipe_items WHERE product_id = ANY($1)`, [productIds]
  );
  const optRecipes = await getOptionRecipesForValues(allOptIds);
  const invCfg = await getInventoryConfig();

  let subtotal = 0;
  const lines = items.map(it => {
    const p = pMap.get(it.product_id);
    if (!p) throw new Error('Món không tồn tại');
    if (!p.is_active) throw new Error(`Món "${p.name}" đã ngừng bán`);
    const qty = Math.max(1, Math.floor(it.qty));
    const opts = (it.option_value_ids ?? []).map(x => oMap.get(x)).filter(Boolean) as typeof optValues;
    const extra = opts.reduce((s, o) => s + Number(o.extra_price), 0);
    const unit_price = Number(p.price) + extra;
    const line_total = unit_price * qty;
    subtotal += line_total;
    return {
      id: genId('soit'), product_id: p.id, name_snapshot: p.name, unit_price, qty, line_total,
      options_json: opts.map(o => ({ group_id: o.group_id, value_id: o.id, name: o.name, extra_price: Number(o.extra_price) })),
      note: it.note ?? null, track_recipe: p.track_recipe,
    };
  });

  const usedIngredientIds = new Set<string>();
  await withTransaction(async (client) => {
    const cur = await client.query<{ status: string; payment_status: string; discount: string; delivery_fee: string }>(
      `SELECT status, payment_status, discount, delivery_fee FROM solace_orders WHERE id = $1 FOR UPDATE`, [id]
    );
    if (cur.rowCount === 0) throw new Error('Không tìm thấy đơn');
    const o = cur.rows[0];
    if (o.status === 'cancelled' || o.status === 'done') throw new Error('Đơn đã kết thúc — không sửa được món');
    if (o.payment_status === 'paid') throw new Error('Đơn đã thanh toán — không sửa món (huỷ & tạo lại nếu cần)');

    // 1) Đảo TOÀN BỘ tác động kho hiện có của đơn (NET) về 0 → tránh double khi sửa nhiều lần.
    const net = await client.query<{ ingredient_id: string; net: string }>(
      `SELECT ingredient_id, SUM(qty)::numeric AS net FROM solace_stock_movements WHERE ref_type='order' AND ref_id=$1 GROUP BY ingredient_id`, [id]
    );
    for (const m of net.rows) {
      const n = Number(m.net);
      if (n === 0) continue;
      await recordMovement({ ingredientId: m.ingredient_id, type: 'adjust', qty: -n,
        reason: 'edit', refType: 'order', refId: id, note: 'Đảo kho để sửa đơn', performedBy: actor ?? null }, client);
    }

    // 2) Thay danh sách món + trừ kho lại theo món mới.
    await client.query(`DELETE FROM solace_order_items WHERE order_id = $1`, [id]);
    for (const l of lines) {
      await client.query(
        `INSERT INTO solace_order_items (id, order_id, product_id, name_snapshot, unit_price, qty, line_total, options_json, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
        [l.id, id, l.product_id, l.name_snapshot, l.unit_price, l.qty, l.line_total, JSON.stringify(l.options_json), l.note]
      );
      const ris: { ingredient_id: string; qty: number; wastage_pct: number }[] = [];
      if (l.track_recipe) ris.push(...recipes.filter(r => r.product_id === l.product_id));
      for (const o of l.options_json) {
        ris.push(...optRecipes.filter(r => r.option_value_id === o.value_id));
      }
      for (const r of ris) {
        const need = Number(r.qty) * (1 + Number(r.wastage_pct) / 100) * l.qty;
        if (!(need > 0)) continue;
        if (!invCfg.allowNegativeStock) {
          const c = await client.query<{ stock_qty: string }>(`SELECT stock_qty FROM solace_ingredients WHERE id = $1 FOR UPDATE`, [r.ingredient_id]);
          if (c.rowCount && Number(c.rows[0].stock_qty) < need) throw new Error('Không đủ nguyên liệu trong kho');
        }
        await recordMovement({ ingredientId: r.ingredient_id, type: 'out', qty: -need,
          reason: 'sale', refType: 'order', refId: id, performedBy: actor ?? null }, client);
        usedIngredientIds.add(r.ingredient_id);
      }
    }

    // 3) Tính lại tiền (giữ giảm giá đã có, clamp theo tạm tính mới; giữ phí giao). Đơn chưa thu → paid_amount=0.
    const discount = Math.max(0, Math.min(Number(o.discount), subtotal));
    const total = subtotal - discount + Number(o.delivery_fee);
    await client.query(`UPDATE solace_orders SET subtotal=$2, discount=$3, total=$4, paid_amount=0 WHERE id=$1`, [id, subtotal, discount, total]);
    await recordOrderEvent({ orderId: id, kind: 'edited', detail: `Sửa món — ${items.length} dòng · tổng ${total}đ`, actor: actor ?? null }, client);
  });

  void logActivity({ action: 'solace_order_items_edited', details: `Sửa món đơn (${id}) — ${items.length} dòng`, performedBy: actor ?? 'System' }).catch(() => {});

  const order = (await getOrder(id))!;
  if (usedIngredientIds.size > 0) {
    const rows = await query<{ name: string; unit: string; stock_qty: number; min_qty: number }>(
      `SELECT name, unit, stock_qty, min_qty FROM solace_ingredients WHERE id = ANY($1)`, [[...usedIngredientIds]]
    );
    order.warnings = rows
      .filter(r => Number(r.stock_qty) < 0 || (Number(r.min_qty) > 0 && Number(r.stock_qty) <= Number(r.min_qty)))
      .map(r => Number(r.stock_qty) < 0 ? `${r.name}: ÂM KHO (${r.stock_qty} ${r.unit})` : `${r.name}: sắp hết (còn ${r.stock_qty} ${r.unit})`);
  }
  await syncTelegramCards(id);
  return order;
}

const ORDER_COLS = `id, code, channel, customer_user_id, customer_name, status, fulfillment_type, floor_note, customer_phone,
  subtotal, discount, delivery_fee, total, payment_method, payment_status, paid_amount, note, cancel_reason, voucher_code, pickup_time, business_date,
  created_by, served_by, created_at, paid_at`;

export async function getOrder(id: string): Promise<SolaceOrder | null> {
  const order = await queryOne<SolaceOrder>(`SELECT ${ORDER_COLS} FROM solace_orders WHERE id = $1`, [id]);
  if (!order) return null;
  order.items = await query<SolaceOrderItem>(
    `SELECT id, product_id, name_snapshot, unit_price, qty, line_total, options_json, note
       FROM solace_order_items WHERE order_id = $1 ORDER BY id ASC`, [id]
  );
  return order;
}

export interface ListOrdersFilter { businessDate?: string; status?: OrderStatus; activeOnly?: boolean; limit?: number; }

export async function listOrders(f: ListOrdersFilter = {}): Promise<SolaceOrder[]> {
  const conds: string[] = []; const params: unknown[] = []; let i = 1;
  if (f.businessDate) { conds.push(`business_date = $${i++}`); params.push(f.businessDate); }
  if (f.status) { conds.push(`status = $${i++}`); params.push(f.status); }
  if (f.activeOnly) { conds.push(`status IN ('pending','preparing','ready')`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  params.push(Math.min(f.limit ?? 100, 300));
  return query<SolaceOrder>(`SELECT ${ORDER_COLS} FROM solace_orders ${where} ORDER BY created_at DESC LIMIT $${i}`, params);
}

/** Tổng còn nợ/chưa thu của 1 thành viên (đơn chưa thanh toán đủ, không tính đã huỷ). */
export async function getUserOutstanding(userId: string): Promise<number> {
  const r = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(total - paid_amount), 0)::bigint AS total
       FROM solace_orders
      WHERE customer_user_id = $1 AND status <> 'cancelled' AND payment_status <> 'paid'`,
    [userId]
  );
  return Number(r?.total ?? 0);
}

const STATUS_VN: Record<string, string> = {
  pending: 'Chờ pha', preparing: 'Đang pha', ready: 'Sẵn sàng', delivering: 'Đang giao', done: 'Hoàn tất', cancelled: 'Đã huỷ',
};
const PAYFORM_VN: Record<string, string> = {
  cash: 'Tiền mặt', bankqr: 'Chuyển khoản', wallet: 'Ví tín dụng', debt: 'Ghi nợ',
};

const FLOW: Record<OrderStatus, OrderStatus[]> = {
  pending: ['preparing', 'ready', 'delivering', 'done', 'cancelled'],
  preparing: ['ready', 'delivering', 'done', 'cancelled'],
  ready: ['delivering', 'done', 'cancelled'],
  delivering: ['done', 'cancelled'],
  done: [], cancelled: [],
};

/**
 * Đồng bộ thẻ điều khiển Telegram của đơn ở MỌI chat nhân viên sau khi đổi trạng thái/thanh toán.
 * Gọi ở tầng service để CẢ web (màn Bếp/POS) LẪN bot đều cập nhật nút — tránh nhân viên bấm trùng.
 * Nuốt lỗi: việc đồng bộ Telegram không được làm hỏng giao dịch nghiệp vụ.
 */
async function syncTelegramCards(id: string): Promise<void> {
  try {
    const o = await getOrder(id);
    if (o) await editAllOrderMessages(o);
  } catch (e) {
    console.error('[solaceOrder] sync telegram cards error:', (e as Error).message);
  }
}

export async function updateOrderStatus(id: string, status: OrderStatus, actor?: string | null): Promise<void> {
  const cur = await queryOne<{ status: OrderStatus }>(`SELECT status FROM solace_orders WHERE id = $1`, [id]);
  if (!cur) throw new Error('Không tìm thấy đơn');
  if (cur.status === status) return;
  if (!FLOW[cur.status]?.includes(status)) throw new Error(`Không thể chuyển trạng thái ${cur.status} → ${status}`);
  if (status === 'cancelled') { await cancelOrder(id, actor); return; }
  // served_by = người ĐẦU TIÊN đẩy đơn tiến (giữ nguyên nếu đã có) → biết ai phục vụ.
  await query(
    `UPDATE solace_orders SET status = $2, served_by = COALESCE(served_by, $3) WHERE id = $1`,
    [id, status, actor ?? null]
  );
  await recordOrderEvent({ orderId: id, kind: 'status', detail: `${STATUS_VN[cur.status] ?? cur.status} → ${STATUS_VN[status] ?? status}`, actor: actor ?? null });
  // Báo khách khi đơn sẵn sàng / đang giao / hoàn tất (chỉ đơn có chủ là thành viên).
  const EV: Partial<Record<OrderStatus, string>> = {
    ready: 'solace.order_ready', delivering: 'solace.order_delivering', done: 'solace.order_done',
  };
  if (EV[status]) {
    const o = await queryOne<{ code: string | null; customer_user_id: string | null; fulfillment_type: string; floor_note: string | null }>(
      `SELECT code, customer_user_id, fulfillment_type, floor_note FROM solace_orders WHERE id = $1`, [id]
    );
    if (o?.customer_user_id) {
      const vars: Record<string, string> = { code: o.code ?? '' };
      // "Sẵn sàng" phải đúng hình thức nhận: GIAO không được bảo "tới quầy nhận".
      if (status === 'ready') {
        vars.pickupLine = o.fulfillment_type === 'delivery'
          ? ` Nhân viên sẽ giao tới ${o.floor_note ?? 'địa chỉ của bạn'} ngay.`
          : o.fulfillment_type === 'dine_in'
            ? ` Nhân viên sẽ mang ra ${o.floor_note ?? 'bàn của bạn'} ngay.`
            : ' Mời bạn tới quầy Solace nhận nhé!';
      }
      await notify(EV[status]!, vars, { recipients: [o.customer_user_id], relatedId: id }).catch(() => {});
    }
  }
  await syncTelegramCards(id);
}

/** Huỷ đơn + hoàn lại kho đã trừ (nếu có). reason = lý do huỷ (nhân viên nhập). */
export async function cancelOrder(
  id: string,
  actor?: string | null,
  reason?: string | null,
  opts?: { creditToWallet?: boolean | null }
): Promise<void> {
  let refunded = 0;
  let refundMethod: 'wallet' | 'cash' | 'bank' | null = null;
  let cancelInfo: { code: string; userId: string | null; walletBalanceAfter?: number } | null = null;
  await withTransaction(async (client) => {
    const cur = await client.query<{ status: OrderStatus; code: string; payment_status: string; payment_method: string | null; paid_amount: string; customer_user_id: string | null }>(
      `SELECT status, code, payment_status, payment_method, paid_amount, customer_user_id FROM solace_orders WHERE id = $1 FOR UPDATE`, [id]
    );
    if (cur.rowCount === 0) throw new Error('Không tìm thấy đơn');
    const ord = cur.rows[0];
    if (ord.status === 'cancelled') return;
    // Hoàn kho: cộng lại các biến động 'out' của đơn này (chưa hoàn trước đó).
    const moves = await client.query<{ ingredient_id: string; qty: string }>(
      `SELECT ingredient_id, qty FROM solace_stock_movements WHERE ref_type = 'order' AND ref_id = $1 AND type = 'out'`, [id]
    );
    for (const m of moves.rows) {
      await recordMovement({
        ingredientId: m.ingredient_id, type: 'in', qty: -Number(m.qty), // -(-x) = +x: cộng trả lại
        reason: 'cancel', refType: 'order', refId: id, note: 'Hoàn kho do huỷ đơn', performedBy: actor ?? null,
      }, client);
    }
    // Hoàn TIỀN VÍ nếu đơn đã thanh toán bằng ví (tránh khách mất tiền khi huỷ).
    if (ord.payment_status === 'paid' && ord.payment_method === 'wallet' && ord.customer_user_id && Number(ord.paid_amount) > 0) {
      await refundWalletTx(client, ord.customer_user_id, Number(ord.paid_amount), id, `Hoàn tiền huỷ đơn ${ord.code}`, actor ?? null);
      refunded = Number(ord.paid_amount); refundMethod = 'wallet';
    }
    // Hoàn TIỀN MẶT / CHUYỂN KHOẢN: ghi 1 khoản CHI ra khỏi quỹ tương ứng (đúng sổ sách).
    else if (ord.payment_status === 'paid' && (ord.payment_method === 'cash' || ord.payment_method === 'bankqr') && Number(ord.paid_amount) > 0) {
      const paidAmount = Number(ord.paid_amount);
      if (opts?.creditToWallet && ord.customer_user_id) {
        await creditWalletTx(client, ord.customer_user_id, paidAmount, id, `Giữ tiền huỷ đơn ${ord.code} vào ví tín dụng`, actor ?? null);
        refunded = paidAmount;
        refundMethod = 'wallet';
      } else {
        const acct = ord.payment_method === 'cash' ? 'cash' : 'bank';
        await postCashTxn({
          account: acct, direction: 'out', amount: paidAmount, category: 'refund',
          refType: 'order', refId: id, note: `Hoàn tiền huỷ đơn ${ord.code}`, actor: actor ?? null,
        }, client);
        refunded = paidAmount; refundMethod = acct;
      }
    }
    cancelInfo = { code: ord.code, userId: ord.customer_user_id };
    await client.query(`UPDATE solace_orders SET status = 'cancelled', cancel_reason = $2 WHERE id = $1`, [id, reason?.trim() || null]);
    await recordOrderEvent({ orderId: id, kind: 'cancelled', detail: reason?.trim() ? `Huỷ — ${reason.trim()}` : 'Huỷ đơn', actor: actor ?? null }, client);
  });
  void logActivity({ action: 'solace_order_cancelled', details: `Huỷ đơn (${id})`, performedBy: actor ?? 'System' }).catch(() => {});

  // Thông báo khách bị huỷ đơn (kèm dòng hoàn tiền nếu có). Bỏ qua nếu chính khách tự huỷ & không hoàn.
  const ci = cancelInfo as { code: string; userId: string | null } | null;
  if (ci?.userId && (refunded > 0 || ci.userId !== actor)) {
    let refundLine = '';
    if (refunded > 0 && refundMethod === 'wallet') {
      const w = await queryOne<{ balance: number }>(`SELECT balance FROM solace_wallets WHERE user_id = $1`, [ci.userId]);
      refundLine = ` Đã chuyển ${formatVND(refunded)} vào Ví tín dụng để bù trừ cho đơn tiếp theo (số dư: ${formatVND(Number(w?.balance ?? 0))}).`;
    } else if (refunded > 0) {
      refundLine = ` Quán sẽ hoàn ${formatVND(refunded)} (${refundMethod === 'bank' ? 'chuyển khoản' : 'tiền mặt'}).`;
    }
    await notify('solace.order_cancelled', { code: ci.code ?? '', refundLine }, { recipients: [ci.userId], relatedId: id }).catch(() => {});
  }
  await syncTelegramCards(id);
}

/**
 * XOÁ CỨNG 1 đơn khỏi DB (đơn + dòng món). Chỉ cho đơn đã KẾT THÚC (done/cancelled)
 * để tránh xoá nhầm đơn đang xử lý. Dùng để dọn đơn TEST khi phát triển.
 * KHÔNG hoàn kho/ví (đơn done đã tiêu hao thật; đơn cancelled đã hoàn lúc huỷ).
 */
export async function deleteOrderHard(id: string, actor: string | null): Promise<void> {
  const o = await queryOne<{ code: string | null; status: OrderStatus }>(
    `SELECT code, status FROM solace_orders WHERE id = $1`, [id]
  );
  if (!o) throw new Error('Không tìm thấy đơn');
  if (o.status !== 'done' && o.status !== 'cancelled') {
    throw new Error('Chỉ xoá được đơn đã hoàn tất hoặc đã huỷ (huỷ đơn trước nếu cần)');
  }
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM solace_order_items WHERE order_id = $1`, [id]);
    await client.query(`DELETE FROM solace_orders WHERE id = $1`, [id]);
  });
  void logActivity({ action: 'solace_order_deleted', details: `Xoá cứng đơn ${o.code ?? id} (${o.status})`, performedBy: actor ?? 'System' }).catch(() => {});
}

/** Đánh dấu đã thanh toán (tiền mặt). Ví/VietQR xử lý ở Phase sau. */
/** Xác nhận đã thu tiền. method bỏ trống = GIỮ NGUYÊN phương thức gốc của đơn (vd VietQR vẫn là Chuyển khoản). */
export async function markOrderPaid(id: string, method?: PaymentMethod | null, actor?: string | null): Promise<void> {
  const o = await queryOne<{ code: string | null; customer_user_id: string | null; total: number; paid_amount: number; payment_method: string | null; payment_status: string; business_date: string | null }>(
    `SELECT code, customer_user_id, total, paid_amount, payment_method, payment_status, business_date FROM solace_orders WHERE id = $1`, [id]
  );
  if (!o) throw new Error('Không tìm thấy đơn');
  if (o.payment_status === 'paid') return; // đã thu rồi → không thu (và không ghi quỹ) lần nữa
  const wasDebt = o.payment_status === 'debt';
  const m = (method ?? o.payment_method ?? 'cash') as PaymentMethod;
  const due = Math.max(0, Number(o.total) - Number(o.paid_amount ?? 0));
  if (!(due > 0)) {
    await query(
      `UPDATE solace_orders
          SET payment_status = 'paid', paid_amount = total, paid_at = NOW(),
              payment_method = CASE
                WHEN payment_method IS NULL THEN $2
                WHEN payment_method IN ('cash','bankqr','wallet') AND payment_method <> $2 THEN 'mixed'
                ELSE payment_method
              END
        WHERE id = $1`,
      [id, m]
    );
    await syncTelegramCards(id);
    return;
  }
  await query(
    `UPDATE solace_orders
        SET payment_status = 'paid',
            payment_method = CASE
              WHEN COALESCE(paid_amount, 0) > 0 AND payment_method IS NOT NULL AND payment_method <> $2 THEN 'mixed'
              ELSE $2
            END,
            paid_amount = total, paid_at = NOW()
      WHERE id = $1 AND payment_status <> 'paid'`,
    [id, m]
  );
  void logActivity({ action: 'solace_order_paid', details: `Thu tiền đơn (${id}) — ${m}`, performedBy: actor ?? 'System' }).catch(() => {});
  await recordOrderEvent({ orderId: id, kind: 'paid', detail: `Đã thu — ${m === 'bankqr' ? 'Chuyển khoản' : m === 'wallet' ? 'Ví' : 'Tiền mặt'}${wasDebt ? ' (thu nợ)' : ''}`, actor: actor ?? null });

  // Sổ Quỹ: tiền mặt → két, chuyển khoản → ngân hàng. (Ví không phải tiền mới — đã vào lúc nạp.)
  if (m === 'cash' || m === 'bankqr') {
    await postCashTxn({
      account: m === 'cash' ? 'cash' : 'bank', direction: 'in', amount: due,
      category: wasDebt ? 'debt_payment' : 'sale', refType: 'order', refId: id,
      note: `${wasDebt ? 'Thu nợ' : 'Bán hàng'} ${o.code ?? ''}`.trim(), businessDate: o.business_date, actor,
    }).catch(() => {});
  }

  // Báo khách đã xác nhận thanh toán (nếu đơn gắn thành viên) — hữu ích cho tiền mặt/VietQR.
  if (o.customer_user_id) {
    const label = m === 'bankqr' ? 'Chuyển khoản' : m === 'wallet' ? 'Ví' : 'Tiền mặt';
    await notify('solace.payment_confirmed', {
      code: o.code ?? '', amount: formatVND(o.total), method: label,
    }, { recipients: [o.customer_user_id], relatedId: id }).catch(() => {});
  }
  await syncTelegramCards(id);
}

export type PaymentForm = 'cash' | 'bankqr' | 'wallet' | 'debt';

/**
 * Đổi hình thức thanh toán của 1 đơn (đã thu HOẶC chưa thu) — đồng bộ Sổ Quỹ + ví, chạy trong 1 transaction.
 * - Hoàn hiệu ứng tiền của phương thức CŨ (chỉ khi đã thu): tiền mặt/CK → ghi quỹ 'out'; ví → hoàn ví.
 * - Áp hiệu ứng MỚI: tiền mặt/CK → ghi quỹ 'in' + đơn 'paid'; ví → trừ ví + 'paid'; debt → chuyển 'chưa thu'.
 */
export async function changeOrderPayment(
  id: string, target: PaymentForm, opts?: { memberId?: string | null; actor?: string | null }
): Promise<void> {
  const actor = opts?.actor ?? null;
  await withTransaction(async (client) => {
    const res = await client.query<{ status: string; payment_status: string; payment_method: string | null; total: string; paid_amount: string; customer_user_id: string | null; code: string | null; business_date: string | null }>(
      `SELECT status, payment_status, payment_method, total, paid_amount, customer_user_id, code, business_date
         FROM solace_orders WHERE id = $1 FOR UPDATE`, [id]
    );
    if (res.rowCount === 0) throw new Error('Không tìm thấy đơn');
    const o = res.rows[0];
    if (o.status === 'cancelled') throw new Error('Đơn đã huỷ — không đổi được thanh toán');

    const wasPaid = o.payment_status === 'paid';
    const oldMethod = o.payment_method;
    const total = Number(o.total);
    const prevPaid = Number(o.paid_amount);
    const targetPaid = target !== 'debt';

    if (wasPaid && targetPaid && oldMethod === target) throw new Error('Đơn đã ở hình thức này');
    // Chưa thu → ghi nợ: chỉ đổi nhãn, không động tiền.
    if (!wasPaid && target === 'debt') {
      await client.query(`UPDATE solace_orders SET payment_status = 'debt', payment_method = NULL, paid_amount = 0, paid_at = NULL WHERE id = $1`, [id]);
      return;
    }

    // 1) Hoàn hiệu ứng tiền CŨ (chỉ khi đã thu thật).
    if (wasPaid && prevPaid > 0) {
      if (oldMethod === 'cash' || oldMethod === 'bankqr') {
        await postCashTxn({ account: oldMethod === 'cash' ? 'cash' : 'bank', direction: 'out', amount: prevPaid,
          category: 'adjust', refType: 'order', refId: id, note: `Đổi HTTT đơn ${o.code ?? ''} — hoàn ${oldMethod}`.trim(),
          businessDate: o.business_date, actor }, client);
      } else if (oldMethod === 'wallet' && o.customer_user_id) {
        await refundWalletTx(client, o.customer_user_id, prevPaid, id, `Đổi HTTT đơn ${o.code ?? ''} — hoàn ví`.trim(), actor);
      }
    }

    // 2) Áp hiệu ứng MỚI.
    if (target === 'cash' || target === 'bankqr') {
      await postCashTxn({ account: target === 'cash' ? 'cash' : 'bank', direction: 'in', amount: total,
        category: 'sale', refType: 'order', refId: id, note: `Đổi HTTT đơn ${o.code ?? ''} — ${target}`.trim(),
        businessDate: o.business_date, actor }, client);
      await client.query(`UPDATE solace_orders SET payment_status='paid', payment_method=$2, paid_amount=total, paid_at=NOW() WHERE id=$1`, [id, target]);
    } else if (target === 'wallet') {
      const wid = opts?.memberId ?? o.customer_user_id;
      if (!wid) throw new Error('Cần chọn thành viên để trừ ví');
      await client.query(`INSERT INTO solace_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [wid]);
      const w = await client.query<{ balance: string }>(`SELECT balance FROM solace_wallets WHERE user_id = $1 FOR UPDATE`, [wid]);
      const bal = Number(w.rows[0].balance);
      if (bal < total) throw new Error('Số dư ví không đủ');
      const newBal = bal - total;
      await client.query(`UPDATE solace_wallets SET balance=$2, total_spent=total_spent+$3, updated_at=NOW() WHERE user_id=$1`, [wid, newBal, total]);
      await client.query(
        `INSERT INTO solace_wallet_txns (id, user_id, type, amount, balance_after, method, ref_order_id, note, performed_by)
         VALUES ($1,$2,'payment',$3,$4,'wallet',$5,$6,$7)`,
        [genId('swtx'), wid, -total, newBal, id, `Đổi HTTT đơn ${o.code ?? ''} — trừ ví`, actor]
      );
      await client.query(`UPDATE solace_orders SET payment_status='paid', payment_method='wallet', paid_amount=total, customer_user_id=COALESCE(customer_user_id,$2), paid_at=NOW() WHERE id=$1`, [id, wid]);
    } else {
      // debt: đơn đã thu → chuyển về CHƯA THU (thu sau), tiền đã hoàn ở bước 1.
      await client.query(`UPDATE solace_orders SET payment_status='debt', payment_method=NULL, paid_amount=0, paid_at=NULL WHERE id=$1`, [id]);
    }
  });
  void logActivity({ action: 'solace_order_payment_changed', details: `Đổi hình thức thanh toán đơn (${id}) → ${target}`, performedBy: actor ?? 'System' }).catch(() => {});
  await recordOrderEvent({ orderId: id, kind: 'payment_changed', detail: `Đổi hình thức → ${PAYFORM_VN[target] ?? target}`, actor }).catch(() => {});
  await syncTelegramCards(id);
}

/**
 * KHÁCH tự đổi hình thức thanh toán cho đơn CHƯA THU (trước khi nhân viên xác nhận "đã nhận tiền").
 * Khác changeOrderPayment (POS): KHÔNG ghi quỹ/không đánh dấu đã thu cho cash/bankqr — chỉ đổi "ý định trả".
 * - cash / bankqr: chỉ đổi nhãn, GIỮ trạng thái chưa thu.
 * - wallet: TRỪ VÍ NGAY trong transaction (re-check số dư) → 'paid'.
 * - debt: chuyển nhãn 'debt' (không tăng công nợ — đơn chưa thu vốn đã được tính nợ).
 * Atomic + SELECT … FOR UPDATE để chống đua với thao tác "Đã nhận tiền" của nhân viên.
 */
export async function changeUnpaidOrderMethodByCustomer(
  id: string, userId: string, target: PaymentForm
): Promise<SolaceOrder> {
  await withTransaction(async (client) => {
    const res = await client.query<{ status: string; payment_status: string; payment_method: string | null; total: string; customer_user_id: string | null; code: string | null }>(
      `SELECT status, payment_status, payment_method, total, customer_user_id, code
         FROM solace_orders WHERE id = $1 FOR UPDATE`, [id]
    );
    if (res.rowCount === 0) throw new Error('Không tìm thấy đơn');
    const o = res.rows[0];
    if (o.customer_user_id !== userId) throw new Error('Không tìm thấy đơn của bạn');
    if (o.status === 'cancelled' || o.status === 'done') throw new Error('Đơn đã kết thúc — không đổi được');
    if (o.payment_status === 'paid') throw new Error('Đơn đã được thanh toán');

    const total = Number(o.total);
    const curr = o.payment_status === 'debt' ? 'debt' : o.payment_method;
    if (curr === target) throw new Error('Đơn đang ở hình thức này');

    if (target === 'cash' || target === 'bankqr') {
      await client.query(`UPDATE solace_orders SET payment_method=$2, payment_status='unpaid', paid_amount=0, paid_at=NULL WHERE id=$1`, [id, target]);
    } else if (target === 'debt') {
      await client.query(`UPDATE solace_orders SET payment_status='debt', payment_method=NULL, paid_amount=0, paid_at=NULL WHERE id=$1`, [id]);
    } else { // wallet — trừ ví ngay (pay-now)
      await client.query(`INSERT INTO solace_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId]);
      const w = await client.query<{ balance: string }>(`SELECT balance FROM solace_wallets WHERE user_id=$1 FOR UPDATE`, [userId]);
      const bal = Number(w.rows[0].balance);
      if (bal < total) throw new Error('Số dư ví không đủ');
      const newBal = bal - total;
      await client.query(`UPDATE solace_wallets SET balance=$2, total_spent=total_spent+$3, updated_at=NOW() WHERE user_id=$1`, [userId, newBal, total]);
      await client.query(
        `INSERT INTO solace_wallet_txns (id, user_id, type, amount, balance_after, method, ref_order_id, note, performed_by)
         VALUES ($1,$2,'payment',$3,$4,'wallet',$5,$6,$7)`,
        [genId('swtx'), userId, -total, newBal, id, `Khách đổi sang trả ví — đơn ${o.code ?? ''}`.trim(), userId]
      );
      await client.query(`UPDATE solace_orders SET payment_status='paid', payment_method='wallet', paid_amount=total, paid_at=NOW() WHERE id=$1`, [id]);
    }
  });
  void logActivity({ action: 'solace_order_payment_changed_by_customer', details: `Khách đổi HTTT đơn (${id}) → ${target}`, performedBy: userId }).catch(() => {});
  await recordOrderEvent({ orderId: id, kind: 'payment_changed', detail: `Khách đổi cách trả → ${PAYFORM_VN[target] ?? target}`, actor: userId }).catch(() => {});
  await syncTelegramCards(id);
  return (await getOrder(id))!;
}
