/**
 * solaceBotService — liên kết tài khoản + giỏ hàng theo chat cho bot Solace.
 */
import { query, queryOne, execute } from '@/lib/db';

function token(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

// ─── LIÊN KẾT TÀI KHOẢN (deep-link /start <token>) ───────────────────────────
/** Tạo token liên kết 1 lần (15 phút) cho 1 user — webapp dựng link t.me/<bot>?start=<token>. */
export async function createLinkToken(userId: string): Promise<string> {
  const t = token();
  await execute(
    `INSERT INTO solace_tg_link_tokens (token, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
    [t, userId]
  );
  return t;
}

/** Tiêu thụ token: gắn telegram_id ↔ tài khoản. Trả tên user nếu thành công. */
export async function linkByToken(tok: string, tgId: string): Promise<{ name: string } | null> {
  const row = await queryOne<{ user_id: string }>(
    `SELECT user_id FROM solace_tg_link_tokens WHERE token = $1 AND expires_at > NOW()`, [tok]
  );
  if (!row) return null;
  await execute(
    `UPDATE users SET telegram_chat_id = $2, telegram_id = $2 WHERE id::text = $1`, [row.user_id, tgId]
  );
  await execute(`DELETE FROM solace_tg_link_tokens WHERE token = $1`, [tok]);
  const u = await queryOne<{ name: string }>(`SELECT name FROM users WHERE id::text = $1`, [row.user_id]);
  return { name: u?.name ?? 'bạn' };
}

export interface LinkedUser { id: string; name: string; role: string }

/** Tài khoản FADO gắn với 1 chat Telegram (null nếu chưa liên kết). */
export async function getLinkedUser(tgId: string): Promise<LinkedUser | null> {
  return queryOne<LinkedUser>(
    `SELECT id::text AS id, name, role FROM users WHERE telegram_chat_id = $1 AND status = 'active'`, [tgId]
  );
}

// ─── SUBSCRIBER (danh bạ broadcast Marketing) ────────────────────────────────
/**
 * Ghi nhận 1 người vào danh bạ bot Solace khi họ /start (kể cả chưa liên kết FADO).
 * Upsert theo chat_id; cập nhật tên/username/last_seen. /start lại ⇒ bỏ opt-out
 * (coi như đăng ký lại). Không bao giờ ghi đè user_id đã có bằng null.
 */
export async function recordSubscriber(
  chatId: string, name?: string | null, username?: string | null, userId?: string | null
): Promise<void> {
  await execute(
    `INSERT INTO solace_subscribers (chat_id, user_id, name, username, opted_out, started_at, last_seen_at)
     VALUES ($1, $2, $3, $4, false, NOW(), NOW())
     ON CONFLICT (chat_id) DO UPDATE SET
       user_id      = COALESCE(EXCLUDED.user_id, solace_subscribers.user_id),
       name         = COALESCE(EXCLUDED.name, solace_subscribers.name),
       username     = COALESCE(EXCLUDED.username, solace_subscribers.username),
       opted_out    = false,
       last_seen_at = NOW()`,
    [chatId, userId ?? null, name ?? null, username ?? null]
  );
}

/** Bật/tắt nhận broadcast cho 1 chat (user gõ /stop, hoặc bot bị chặn → opt-out). */
export async function setSubscriberOptOut(chatId: string, optedOut: boolean): Promise<void> {
  await execute(`UPDATE solace_subscribers SET opted_out = $2 WHERE chat_id = $1`, [chatId, optedOut]);
}

/** Danh sách chat_id còn nhận broadcast (chưa opt-out). */
export async function listActiveSubscriberChatIds(): Promise<string[]> {
  const rows = await query<{ chat_id: string }>(
    `SELECT chat_id FROM solace_subscribers WHERE opted_out = false`
  );
  return rows.map(r => r.chat_id);
}

/** Đếm subscriber còn nhận broadcast (để xem trước số người nhận). */
export async function countActiveSubscribers(): Promise<number> {
  const r = await queryOne<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM solace_subscribers WHERE opted_out = false`
  );
  return Number(r?.n ?? 0);
}

// ─── GIỎ HÀNG THEO CHAT ──────────────────────────────────────────────────────
export interface CartLine { product_id: string; qty: number; option_value_ids: string[]; note?: string | null; name: string; unit_price: number }
export interface CartData {
  lines: CartLine[];
  fulfillment?: 'counter' | 'dine_in' | 'delivery';
  floor?: string;
  voucherCode?: string | null;
  discount?: number;
  awaiting?: 'floor' | 'voucher' | 'note' | null;   // đang chờ người dùng nhập text
  awaitingCancel?: string | null;                   // admin đang chờ nhập lý do huỷ (orderId)
  // đang chọn tuỳ chọn theo BƯỚC: step = chỉ số nhóm option đang chọn
  draft?: { product_id: string; selected: Record<string, string[]>; qty: number; step: number; note?: string } | null;
}

export async function getCart(tgId: string): Promise<CartData> {
  const r = await queryOne<{ data: CartData }>(`SELECT data FROM solace_tg_carts WHERE telegram_id = $1`, [tgId]);
  return r?.data ?? { lines: [] };
}

export async function saveCart(tgId: string, data: CartData): Promise<void> {
  await execute(
    `INSERT INTO solace_tg_carts (telegram_id, data, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (telegram_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [tgId, JSON.stringify(data)]
  );
}

export async function clearCart(tgId: string): Promise<void> {
  await execute(`DELETE FROM solace_tg_carts WHERE telegram_id = $1`, [tgId]);
}

/**
 * Lấy giỏ + XOÁ nguyên tử (DELETE ... RETURNING). Hai lần bấm thanh toán / Telegram gửi lại
 * update → chỉ MỘT lần lấy được dữ liệu, các lần sau trả null ⇒ KHÔNG tạo đơn trùng.
 * Nếu tạo đơn lỗi, gọi saveCart để trả giỏ về cho khách thử lại.
 */
export async function claimCart(tgId: string): Promise<CartData | null> {
  const r = await queryOne<{ data: CartData }>(
    `DELETE FROM solace_tg_carts WHERE telegram_id = $1 RETURNING data`, [tgId]
  );
  return r?.data ?? null;
}

/**
 * Chống spam "nhắc đơn" / "đã chuyển khoản": cho phép 1 lần / phạm vi / 5 phút.
 * Trả true nếu được phép gửi (chiếm khe thành công), false nếu vừa gửi gần đây.
 */
export async function claimCooldown(kind: string, id: string, windowMs = 5 * 60 * 1000): Promise<boolean> {
  const bucket = Math.floor(Date.now() / windowMs);
  const r = await queryOne<{ scope: string }>(
    `INSERT INTO solace_reminder_log (scope) VALUES ($1) ON CONFLICT (scope) DO NOTHING RETURNING scope`,
    [`${kind}:${id}:${bucket}`]
  );
  return !!r;
}
