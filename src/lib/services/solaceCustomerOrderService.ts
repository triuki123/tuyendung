/**
 * solaceCustomerOrderService — Đặt món từ webapp (khách tự đặt cho mình).
 * Khác POS: enforce giờ hoạt động, định tuyến thanh toán (ví/VietQR/tiền mặt/ghi nợ),
 * kiểm hạn mức nợ. Khách KHÔNG được tự đánh dấu đã thu tiền mặt.
 */
import { query, queryOne } from '@/lib/db';
import {
  createOrder, cancelOrder, getOrder, applyAvailableWalletCredit, type SolaceOrder, type PaymentMethod, type OrderItemInput, type FulfillmentType,
} from '@/lib/services/solaceOrderService';
import { payOrderWithWallet } from '@/lib/services/solaceWalletService';
import { getOperatingConfig, getDebtConfig, getRecipientsConfig, getDeliveryConfig } from '@/lib/services/solaceSettingsService';
import { isShopOpen, effectiveHours, vnDow } from '@/lib/config/solaceConfig';
import { getUserOutstanding } from '@/lib/services/solaceOrderService';
import { notify } from '@/lib/notifications/engine';
import { formatVND } from '@/lib/format';
import { sendOrderControls } from '@/lib/solace/solaceBotAdmin';

export interface WebOrderInput {
  channel?: 'web' | 'telegram';
  fulfillment_type: FulfillmentType;
  floor_note?: string | null;
  customer_phone?: string | null;
  voucher_code?: string | null;
  pickup_time?: string | null;       // ISO; bỏ trống = nhận ngay
  payment_method: PaymentMethod | 'debt';
  note?: string | null;
  items: OrderItemInput[];
}

/** Giờ VN hiện tại "HH:MM". */
function vnNowHHMM(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
}

export async function createWebOrder(userId: string, input: WebOrderInput): Promise<{ order: SolaceOrder; warning?: string }> {
  // 1. Giờ hoạt động: ngoài giờ → khoá (trừ khi "Mở quán").
  const op = await getOperatingConfig();
  if (!isShopOpen(op, vnNowHHMM())) {
    throw new Error('Quán đang đóng cửa, vui lòng đặt trong giờ hoạt động');
  }
  // 2. Giờ hẹn nhận (nếu có) phải trong giờ mở cửa của ĐÚNG NGÀY hẹn & không quá khứ.
  if (input.pickup_time) {
    const pickup = new Date(input.pickup_time);
    const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false }).format(pickup);
    const h = effectiveHours(op, vnDow(pickup));
    if (h.closed) throw new Error('Ngày hẹn nhận là ngày quán nghỉ');
    if (hhmm < h.openTime || hhmm > h.closeTime) throw new Error('Giờ hẹn nhận nằm ngoài giờ mở cửa');
  }

  const method = input.payment_method;
  const customer = await queryOne<{ name: string }>(`SELECT name FROM users WHERE id::text = $1`, [userId]);

  // Phí giao (giao trong toà nhà) — lấy từ cấu hình.
  let deliveryFee = 0;
  if (input.fulfillment_type === 'delivery') {
    const dc = await getDeliveryConfig();
    if (!dc.enabled) throw new Error('Quán hiện không nhận giao hàng');
    deliveryFee = dc.fee;
  }
  const common = {
    channel: input.channel ?? 'web' as const,
    customer_user_id: userId, customer_name: customer?.name ?? null,
    fulfillment_type: input.fulfillment_type, floor_note: input.floor_note ?? null,
    customer_phone: input.customer_phone ?? null, voucher_code: input.voucher_code ?? null,
    delivery_fee: deliveryFee, pickup_time: input.pickup_time ?? null, note: input.note ?? null,
    items: input.items,
  };

  // 3. Ghi nợ: kiểm hạn mức trước khi tạo đơn.
  if (method === 'debt') {
    const debt = await getDebtConfig();
    if (!debt.enabled) throw new Error('Quán hiện không cho phép mua ghi nợ');
    // Tổng đơn (tính lại ở createOrder) — ước lượng nhanh để chặn sớm; createOrder vẫn tính chuẩn.
    const outstanding = await getUserOutstanding(userId);
    // Tạo đơn ghi nợ rồi kiểm lại tổng thực tế.
    const order = await createOrder({
      ...common, payment_method: 'cash', paymentStatus: 'debt',
    }, userId);
    if (outstanding + Number(order.total) > debt.limit) {
      await cancelOrder(order.id, userId); // hoàn kho
      throw new Error(`Vượt hạn mức nợ (${formatVND(debt.limit)}). Hiện đang nợ ${formatVND(outstanding)}.`);
    }
    await notifyNewOrder(order);
    return { order: (await getOrder(order.id))!, warning: order.warnings?.join('; ') };
  }

  // 4. Các phương thức còn lại: tạo đơn chưa thu.
  const order = await createOrder({
    ...common, payment_method: method as PaymentMethod, paid: false,
  }, userId);

  if (method !== 'wallet') {
    await applyAvailableWalletCredit(order.id, userId).catch(() => {});
  }

  // Ví: trừ ngay; thất bại (không đủ số dư) → huỷ đơn (hoàn kho) + báo lỗi.
  if (method === 'wallet') {
    try {
      await payOrderWithWallet(order.id, userId, userId);
    } catch (e) {
      await cancelOrder(order.id, userId);
      throw e;
    }
  }
  await notifyNewOrder(order);
  return { order: (await getOrder(order.id))!, warning: order.warnings?.join('; ') };
}

/** Báo "Đơn mới" tới danh sách người nhận cấu hình. */
async function notifyNewOrder(order: SolaceOrder): Promise<void> {
  const recipients = (await getRecipientsConfig()).order;
  if (recipients.length === 0) return;
  const place = order.fulfillment_type === 'delivery' ? `🚚 Giao${order.floor_note ? ' · ' + order.floor_note : ''}`
    : order.fulfillment_type === 'dine_in' ? `Tại chỗ${order.floor_note ? ' · ' + order.floor_note : ''}` : 'Tại quầy';
  await notify('solace.order_new', {
    code: order.code ?? '', customer: order.customer_name ?? 'Khách',
    total: formatVND(order.total), fulfillment: place,
  }, { recipients, relatedId: order.id }).catch(() => {});
  // Telegram: gửi admin nút điều khiển đơn (Pha chế/Sẵn sàng/Giao/Hoàn thành/Huỷ) qua bot Solace.
  await sendOrderControls(order).catch(() => {});
}

const GUEST_MAX_ITEMS = 20;

/**
 * Đặt món KHÁCH VÃNG LAI (không đăng nhập, qua QR): chỉ tiền mặt / VietQR, không ví/nợ.
 * Tạo đơn pending (nhân viên phải nhận) + báo nhân viên như đơn web thường.
 */
export async function createGuestOrder(input: {
  name: string; phone?: string | null; fulfillment_type: 'counter' | 'dine_in';
  floor_note?: string | null; payment_method: 'cash' | 'bankqr'; items: OrderItemInput[];
}): Promise<SolaceOrder> {
  const op = await getOperatingConfig();
  if (!isShopOpen(op, vnNowHHMM())) throw new Error('Quán đang đóng cửa, vui lòng quay lại trong giờ hoạt động');
  const name = (input.name ?? '').trim();
  if (!name) throw new Error('Vui lòng nhập tên của bạn');
  if (input.payment_method !== 'cash' && input.payment_method !== 'bankqr') {
    throw new Error('Khách vãng lai chỉ thanh toán Tiền mặt hoặc Chuyển khoản (VietQR)');
  }
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error('Chưa chọn món');
  if (input.items.length > GUEST_MAX_ITEMS) throw new Error('Đơn quá nhiều món, vui lòng liên hệ nhân viên');

  const order = await createOrder({
    channel: 'guest', customer_user_id: null, customer_name: name.slice(0, 60),
    customer_phone: (input.phone ?? '').trim().slice(0, 20) || null,
    fulfillment_type: input.fulfillment_type === 'dine_in' ? 'dine_in' : 'counter',
    floor_note: input.floor_note ?? null, payment_method: input.payment_method, paid: false,
    items: input.items,
  }, null);
  await notifyNewOrder(order);
  return order;
}

export async function listMyOrders(userId: string, limit = 30): Promise<SolaceOrder[]> {
  const orders = await query<SolaceOrder>(
    `SELECT id, code, channel, customer_user_id, customer_name, status, fulfillment_type, floor_note,
            subtotal, discount, total, payment_method, payment_status, paid_amount, note, pickup_time,
            business_date, created_by, served_by, created_at, paid_at
       FROM solace_orders WHERE customer_user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, Math.min(limit, 100)]
  );
  if (orders.length === 0) return [];
  const items = await query<{ order_id: string; id: string; product_id: string | null; name_snapshot: string; unit_price: number; qty: number; line_total: number; options_json: unknown; note: string | null }>(
    `SELECT order_id, id, product_id, name_snapshot, unit_price, qty, line_total, options_json, note
       FROM solace_order_items WHERE order_id = ANY($1)`,
    [orders.map(o => o.id)]
  );
  for (const o of orders) o.items = items.filter(it => it.order_id === o.id);
  return orders;
}

/** Đơn chưa thanh toán của khách (để trả bằng ví / quét QR). */
export async function listMyUnpaidOrders(userId: string): Promise<SolaceOrder[]> {
  return query<SolaceOrder>(
    `SELECT id, code, total, paid_amount, payment_status, status, created_at, fulfillment_type, floor_note,
            channel, customer_user_id, customer_name, subtotal, discount, payment_method, note, pickup_time,
            business_date, created_by, served_by, paid_at
       FROM solace_orders
      WHERE customer_user_id = $1 AND status <> 'cancelled' AND payment_status <> 'paid'
      ORDER BY created_at DESC`,
    [userId]
  );
}

export async function cancelMyOrder(userId: string, orderId: string): Promise<void> {
  const o = await queryOne<{ customer_user_id: string | null; status: string }>(
    `SELECT customer_user_id, status FROM solace_orders WHERE id = $1`, [orderId]
  );
  if (!o || o.customer_user_id !== userId) throw new Error('Không tìm thấy đơn của bạn');
  if (o.status !== 'pending') throw new Error('Chỉ huỷ được đơn khi còn chờ pha chế');
  await cancelOrder(orderId, userId);
}
