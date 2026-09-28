/**
 * solaceBotAdmin — gửi NÚT điều khiển đơn cho admin qua bot Solace (Pha chế/Sẵn sàng/Giao/Hoàn thành/Huỷ).
 * Tách module để tránh vòng import (customerOrderService → đây; đây chỉ dùng solaceBot + db).
 *
 * Đồng bộ đa nhân viên: mỗi bản tin gửi đi được lưu (order_id, chat_id, message_id);
 * khi 1 người đổi trạng thái → cập nhật nút/tin ở MỌI chat đã gửi (không để lệch).
 */
import { query, execute } from '@/lib/db';
import { formatVND } from '@/lib/format';
import { sendMessageReturningId, editMessageText, esc, type TgKeyboard } from '@/lib/solace/solaceBot';
import { getRecipientsConfig } from '@/lib/services/solaceSettingsService';
import type { SolaceOrder } from '@/lib/services/solaceOrderService';

const FWD_LABEL: Record<string, string> = {
  preparing: '👨‍🍳 Pha chế', ready: '✅ Sẵn sàng', delivering: '🚚 Đang giao', done: '✔️ Hoàn thành',
};

/**
 * Bàn phím điều khiển theo trạng thái (máy trạng thái tiến dần) + hình thức nhận.
 * - Chỉ hiện các bước CÒN LẠI phía sau trạng thái hiện tại (đã pha thì mất nút Pha chế…).
 * - Huỷ chỉ ở pending/preparing (sau khi Sẵn sàng không cho huỷ nữa).
 * - "Đã nhận tiền" hiện khi chưa thu.
 * - ĐÓNG đơn (mất hết nút) chỉ khi: done & đã thu, hoặc đã huỷ.
 */
export function controlKeyboard(order: { id: string; fulfillment_type: string; payment_status: string; status: string }): TgKeyboard {
  const id = order.id;
  const paid = order.payment_status === 'paid';
  const closed = order.status === 'cancelled' || (order.status === 'done' && paid);
  if (closed) return [];

  const seq = order.fulfillment_type === 'delivery'
    ? ['preparing', 'ready', 'delivering', 'done']
    : ['preparing', 'ready', 'done'];
  const idx = seq.indexOf(order.status); // pending → -1
  const forward = seq.slice(idx + 1);

  const kb: TgKeyboard = [];
  // Nút tiến trạng thái, 2 nút / hàng.
  for (let i = 0; i < forward.length; i += 2) {
    kb.push(forward.slice(i, i + 2).map(s => ({ text: FWD_LABEL[s], callback_data: `a:${s}:${id}` })));
  }
  if (order.status === 'pending' || order.status === 'preparing') {
    kb.push([{ text: '❌ Huỷ', callback_data: `a:cancel:${id}` }]);
  }
  if (!paid) kb.push([{ text: '💵 Đã nhận tiền', callback_data: `a:pay:${id}` }]);
  return kb;
}

const ST: Record<string, string> = {
  pending: 'Chờ xử lý', preparing: 'Đang pha chế', ready: 'Sẵn sàng',
  delivering: 'Đang giao', done: '✔️ Hoàn thành', cancelled: '❌ Đã huỷ',
};

/** Nội dung tin đơn (đủ món + trạng thái hiện tại). Dùng cả lúc gửi mới lẫn lúc cập nhật. */
export function orderSummary(order: SolaceOrder): string {
  const place = order.fulfillment_type === 'delivery' ? `🚚 Giao${order.floor_note ? ' · ' + esc(order.floor_note) : ''}`
    : order.fulfillment_type === 'dine_in' ? `🪑 Tại chỗ${order.floor_note ? ' · ' + esc(order.floor_note) : ''}` : '🏪 Tại quầy';
  const items = (order.items ?? []).map(it => {
    const opts = Array.isArray(it.options_json)
      ? (it.options_json as { name?: string }[]).map(o => o?.name).filter(Boolean).join(', ') : '';
    let line = `• ${it.qty}× ${esc(it.name_snapshot)}`;
    if (opts) line += `\n   ↳ ${esc(opts)}`;
    if (it.note) line += `\n   📝 ${esc(it.note)}`;
    return line;
  }).join('\n');
  // Nhãn phương thức để nhân viên biết khách định trả kiểu gì (kể cả khi chưa bấm "đã chuyển khoản").
  const METHOD: Record<string, string> = { bankqr: '🏦 Chuyển khoản (VietQR)', cash: '💵 Tiền mặt', wallet: '👛 Ví tín dụng', mixed: '🔀 Hỗn hợp' };
  let pay: string;
  if (order.payment_status === 'paid') {
    pay = `✅ Đã thanh toán${order.payment_method && METHOD[order.payment_method] ? ' · ' + METHOD[order.payment_method] : ''}`;
  } else if (order.payment_status === 'partial') {
    pay = `🟦 Đã thu một phần${order.payment_method && METHOD[order.payment_method] ? ' · ' + METHOD[order.payment_method] : ''}`;
  } else if (order.payment_status === 'debt') {
    pay = '📒 Ghi nợ';
  } else {
    // Chưa thu → nêu rõ hình thức khách đã chọn.
    pay = order.payment_method === 'bankqr' ? '⏳ Chờ chuyển khoản (VietQR)'
      : order.payment_method === 'cash' ? '💵 Trả tiền mặt khi nhận'
      : order.payment_method === 'wallet' ? '👛 Trừ ví'
      : 'Chưa thu';
  }
  let promo = '';
  if (order.voucher_code) promo = `\n🎟️ Mã giảm giá: *${esc(order.voucher_code)}* (−${formatVND(order.discount)})`;
  else if (Number(order.discount) > 0) promo = `\n🏷️ Giảm giá: −${formatVND(order.discount)}`;
  const head = order.status === 'pending' ? `🛎️ *ĐƠN MỚI ${esc(order.code)}*`
    : `🛎️ *Đơn ${esc(order.code)}* — ${ST[order.status] ?? order.status}`;
  const cancelLine = order.status === 'cancelled' && order.cancel_reason ? `\n❌ Lý do huỷ: ${esc(order.cancel_reason)}` : '';
  // Đơn đặt qua mã QR khách vãng lai (không đăng nhập) → gắn nhãn + SĐT để nhân viên thu tiền tại quầy.
  const isGuest = order.channel === 'guest';
  const guestTag = isGuest ? ' · 🚶 Khách vãng lai' : '';
  const phoneLine = isGuest && order.customer_phone ? `\n📞 ${esc(order.customer_phone)}` : '';
  return `${head}\n👤 ${esc(order.customer_name ?? 'Khách')}${guestTag}${phoneLine}\n${place}\n${items}${promo}\n💵 *${formatVND(order.total)}* · ${pay}${cancelLine}`;
}

/** Chat Telegram của nhân viên vận hành (operators; fallback danh sách "Đơn mới"). */
async function operatorChatIds(): Promise<string[]> {
  const cfg = await getRecipientsConfig();
  const recipients = cfg.operators.length > 0 ? cfg.operators : cfg.order;
  if (recipients.length === 0) return [];
  const rows = await query<{ telegram_chat_id: string | null }>(
    `SELECT telegram_chat_id FROM users WHERE id::text = ANY($1) AND telegram_chat_id IS NOT NULL`, [recipients]
  );
  return rows.map(r => r.telegram_chat_id).filter((x): x is string => !!x);
}

async function recordOrderMessage(orderId: string, chatId: string, messageId: number): Promise<void> {
  await execute(
    `INSERT INTO solace_order_messages (order_id, chat_id, message_id) VALUES ($1, $2, $3)
     ON CONFLICT (order_id, chat_id, message_id) DO NOTHING`,
    [orderId, chatId, messageId]
  ).catch(() => {});
}

/**
 * Cập nhật ĐỒNG BỘ nội dung + nút của 1 đơn ở MỌI bản tin đã gửi (mọi chat nhân viên).
 * Gọi sau khi đổi trạng thái để không còn cảnh "người này bấm, người kia vẫn nút cũ".
 */
export async function editAllOrderMessages(order: SolaceOrder): Promise<void> {
  const rows = await query<{ chat_id: string; message_id: number }>(
    `SELECT chat_id, message_id FROM solace_order_messages WHERE order_id = $1`, [order.id]
  );
  const text = orderSummary(order);
  const kb = controlKeyboard(order);
  await Promise.all(rows.map(r => editMessageText(r.chat_id, Number(r.message_id), text, kb).catch(() => {})));
}

/** Gửi đơn mới + nút điều khiển tới NHÂN VIÊN VẬN HÀNH đã liên kết Telegram. */
export async function sendOrderControls(order: SolaceOrder): Promise<void> {
  const chats = await operatorChatIds();
  const kb = controlKeyboard(order);
  const text = orderSummary(order);
  for (const c of chats) {
    const mid = await sendMessageReturningId(c, text, kb).catch(() => null);
    if (mid) await recordOrderMessage(order.id, c, mid);
  }
}

/**
 * Gửi 1 thông báo (vd khách nhắc đơn / báo đã chuyển khoản) tới nhân viên vận hành.
 * Nếu kèm orderId → lưu bản tin để cập nhật đồng bộ khi đổi trạng thái sau này.
 */
export async function sendToOperators(text: string, kb?: TgKeyboard, orderId?: string): Promise<void> {
  const chats = await operatorChatIds();
  for (const c of chats) {
    const mid = await sendMessageReturningId(c, text, kb).catch(() => null);
    if (mid && orderId) await recordOrderMessage(orderId, c, mid);
  }
}
