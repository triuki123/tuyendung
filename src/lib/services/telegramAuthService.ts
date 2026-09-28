import crypto from 'crypto';
import { query, queryOne, execute } from '@/lib/db';

/**
 * telegramAuthService — xác thực dữ liệu Telegram Login Widget + quản lý liên kết.
 *
 * Tham chiếu chính thức: https://core.telegram.org/widgets/login#checking-authorization
 * - secret_key = SHA256(bot_token)
 * - data_check_string = các cặp "key=value" (TRỪ hash), sort theo key, nối bằng '\n'
 * - hash hợp lệ ⇔ HMAC_SHA256(data_check_string, secret_key) == hash (hex)
 * - Kiểm tra auth_date để chống replay (mặc định cho phép tối đa 24h).
 *
 * QUAN TRỌNG: chỉ dùng telegram_id (field `id`) làm khóa định danh. KHÔNG dùng username.
 */

/** Payload thô nhận từ Telegram Login Widget (data-onauth). */
export interface TelegramAuthData {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number | string;
  hash: string;
  [key: string]: unknown;
}

/** Thông tin Telegram đã chuẩn hoá để lưu vào users. */
export interface TelegramProfile {
  telegram_id: string;
  telegram_username: string | null;
  telegram_first_name: string | null;
  telegram_last_name: string | null;
  telegram_photo_url: string | null;
}

const MAX_AUTH_AGE_SECONDS = 86400; // 24h

/**
 * Xác thực chữ ký + thời hạn của dữ liệu Telegram Login Widget.
 * @returns TelegramProfile nếu hợp lệ, ném Error nếu giả mạo/hết hạn/thiếu cấu hình.
 */
export function verifyTelegramAuth(data: TelegramAuthData): TelegramProfile {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error('Chưa cấu hình TELEGRAM_BOT_TOKEN trên máy chủ');
  }
  if (!data || !data.hash || data.id == null || data.auth_date == null) {
    throw new Error('Dữ liệu Telegram không hợp lệ');
  }

  // 1) Dựng data_check_string (mọi field trừ hash, sort theo key)
  const { hash, ...fields } = data;
  const dataCheckString = Object.keys(fields)
    .filter((k) => fields[k] !== undefined && fields[k] !== null)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');

  // 2) secret_key = SHA256(bot_token); HMAC-SHA256 chuỗi trên
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // 3) So khớp an toàn (timing-safe)
  const a = Buffer.from(computedHash, 'hex');
  const b = Buffer.from(String(hash), 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('Chữ ký Telegram không hợp lệ (dữ liệu có thể bị giả mạo)');
  }

  // 4) Chống replay — auth_date không quá cũ
  const authDate = Number(data.auth_date);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || nowSec - authDate > MAX_AUTH_AGE_SECONDS) {
    throw new Error('Phiên xác thực Telegram đã hết hạn, vui lòng thử lại');
  }

  return {
    telegram_id: String(data.id),
    telegram_username: data.username ? String(data.username) : null,
    telegram_first_name: data.first_name ? String(data.first_name) : null,
    telegram_last_name: data.last_name ? String(data.last_name) : null,
    telegram_photo_url: data.photo_url ? String(data.photo_url) : null,
  };
}

/** User tối thiểu trả về cho luồng đăng nhập. */
export interface AuthUserRow {
  id: string;
  email: string;
  status: string;
  [key: string]: unknown;
}

/** Tìm user theo telegram_id (chỉ telegram_id, không dùng username). */
export async function findUserByTelegramId(telegramId: string): Promise<AuthUserRow | null> {
  return queryOne<AuthUserRow>(
    `SELECT * FROM users WHERE telegram_id = $1 LIMIT 1`,
    [telegramId]
  );
}

/** Kiểm tra telegram_id đã liên kết với user KHÁC chưa. */
export async function isTelegramIdLinkedToOther(
  telegramId: string,
  exceptUserId: string
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM users WHERE telegram_id = $1 AND id::text <> $2 LIMIT 1`,
    [telegramId, exceptUserId]
  );
  return rows.length > 0;
}

/**
 * Liên kết Telegram vào 1 user hiện có.
 * Đồng thời set telegram_chat_id (= telegram_id với chat riêng) để dùng được kênh
 * thông báo/phê duyệt sẵn có. KHÔNG tự bật telegram_enabled (để user tự chọn).
 */
export async function linkTelegramToUser(
  userId: string,
  profile: TelegramProfile
): Promise<void> {
  // ⚠️ telegram_chat_id dùng placeholder RIÊNG ($7) — KHÔNG tái dùng $1.
  // Lý do: telegram_id (mới, migration 146) là TEXT, nhưng telegram_chat_id (cũ) trên
  // một số DB là BIGINT (cột có sẵn trước migration 032 → ADD COLUMN IF NOT EXISTS bỏ qua).
  // Nếu cùng $1 cho 2 cột khác kiểu, Postgres báo "inconsistent types deduced for parameter $1".
  // Tách placeholder để Postgres suy kiểu độc lập từng vị trí (text→bigint tự cast nếu cần).
  await execute(
    `UPDATE users SET
        telegram_id         = $1,
        telegram_username   = $2,
        telegram_first_name = $3,
        telegram_last_name  = $4,
        telegram_photo_url  = $5,
        telegram_chat_id    = COALESCE(telegram_chat_id, $7),
        telegram_linked_at  = NOW()
     WHERE id::text = $6`,
    [
      profile.telegram_id,
      profile.telegram_username,
      profile.telegram_first_name,
      profile.telegram_last_name,
      profile.telegram_photo_url,
      userId,
      profile.telegram_id,
    ]
  );
}

/** Hủy liên kết Telegram khỏi user (giữ telegram_chat_id để không mất kênh thông báo). */
export async function unlinkTelegram(userId: string): Promise<void> {
  await execute(
    `UPDATE users SET
        telegram_id         = NULL,
        telegram_username   = NULL,
        telegram_first_name = NULL,
        telegram_last_name  = NULL,
        telegram_photo_url  = NULL,
        telegram_linked_at  = NULL
     WHERE id::text = $1`,
    [userId]
  );
}
