import { execute, queryOne, buildInsert } from '@/lib/db';
import { sendTelegramMessageToChat, sendTelegramMessageWithButton } from '@/lib/services/telegramService';

/**
 * Notification trung tâm — MỌI thông báo in-app đều đi qua đây để TỰ ĐỘNG kéo theo
 * Telegram (nếu user đã link + bật `telegram_enabled`).
 *
 * Quy tắc:
 *   - Insert vào bảng `notifications` (in-app).
 *   - Bắn Telegram fire-and-forget (không await; lỗi chỉ log, không vỡ caller).
 *   - Tôn trọng cờ users.telegram_enabled (mặc định TRUE — user có thể tắt nhận).
 *   - Skip Telegram nếu user chưa link `telegram_chat_id`.
 *
 * KHÔNG dùng `await execute(...buildInsert('notifications', ...))` thủ công nữa.
 * Cũng KHÔNG dùng `INSERT INTO notifications` raw. Mọi nơi → gọi notifyUser().
 */

export interface NotifyPayload {
  user_id: string;
  type: string;
  title: string;
  message: string;
  /** Icon hiển thị (tuỳ chọn — đã có default theo type ở client). */
  icon?: string;
  /** Đường dẫn nội bộ để bấm vào xem chi tiết. */
  related_url?: string | null;
  /** ID của entity gốc (ticket/booking/…) nếu có. */
  related_id?: string | null;
  /** Bỏ qua Telegram cho lần này (vd. khi caller tự gửi Telegram phong phú hơn — có
   *  nút action chẳng hạn — không muốn gửi trùng). In-app vẫn được tạo. */
  skipTelegram?: boolean;
}

/**
 * Tạo 1 thông báo cho 1 user (in-app + Telegram).
 * Trả về id notification mới (string) hoặc null nếu fail INSERT.
 */
export async function notifyUser(payload: NotifyPayload): Promise<string | null> {
  if (!payload.user_id) return null;

  // created_at/updated_at là timestamp WITHOUT time zone (giờ VN naive, khớp DEFAULT now()).
  // Trước đây dùng toISOString() (UTC) → thông báo lệch -7h. Ghi giờ VN dạng "YYYY-MM-DD HH:mm:ss".
  const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
  const row = {
    user_id: payload.user_id,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    icon: payload.icon ?? 'bell',
    read: false,
    related_id: payload.related_id ?? null,
    related_url: payload.related_url ?? null,
    created_at: now,
    updated_at: now,
  };

  let notifId: string | null = null;
  try {
    const { text, params } = buildInsert('notifications', row);
    const inserted = await queryOne<{ id: string }>(text, params);
    notifId = inserted?.id ?? null;
  } catch (err) {
    console.error('[notify] insert in-app failed:', err);
    return null;
  }

  if (!payload.skipTelegram) {
    // Fire-and-forget. Telegram chậm/lỗi không được làm vỡ luồng nghiệp vụ.
    void sendTelegramFor(payload).catch(err =>
      console.error('[notify] telegram dispatch failed:', err)
    );
  }
  return notifId;
}

/**
 * Tạo cùng 1 nội dung thông báo cho nhiều user. Dedup user_id rỗng/null.
 */
export async function notifyUsers(userIds: string[], payload: Omit<NotifyPayload, 'user_id'>): Promise<void> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  for (const uid of unique) {
    // eslint-disable-next-line no-await-in-loop
    await notifyUser({ ...payload, user_id: uid });
  }
}

/**
 * Chỉ gửi Telegram (không insert in-app). Dùng cho trường hợp caller đã/muốn tự
 * insert vào `notifications` với cột đặc biệt mà notifyUser chưa hỗ trợ.
 */
export async function notifyTelegramOnly(payload: NotifyPayload): Promise<void> {
  try { await sendTelegramFor(payload); }
  catch (e) { console.error('[notify] telegram-only failed:', e); }
}

async function sendTelegramFor(payload: NotifyPayload): Promise<void> {
  const user = await queryOne<{
    telegram_chat_id: string | null;
    telegram_enabled: boolean | null;
  }>(
    `SELECT telegram_chat_id, telegram_enabled
     FROM users WHERE id::text = $1`,
    [payload.user_id]
  );

  if (!user?.telegram_chat_id) return;          // chưa link Telegram
  if (user.telegram_enabled === false) return;  // user đã tắt

  // Telegram dùng Markdown — escape ký tự đặc biệt trong tiêu đề/message để tránh
  // lỗi parse khiến tin nhắn không gửi được.
  const text = `*${escapeMd(payload.title)}*\n\n${escapeMd(payload.message)}`;

  // Có related_url → kèm nút "Xem chi tiết" (đồng bộ với các thông báo khác).
  // Không có → fallback tin nhắn thuần.
  if (payload.related_url) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://assetflow.fadoai.com';
    const fullUrl = `${appUrl}${payload.related_url}`;
    await sendTelegramMessageWithButton(text, user.telegram_chat_id, 'Xem chi tiết', fullUrl);
  } else {
    await sendTelegramMessageToChat(text, user.telegram_chat_id);
  }
}

function escapeMd(s: string): string {
  // Markdown (cũ) của Telegram chỉ nhạy với `_ * [` — escape vừa đủ.
  return (s ?? '').replace(/([_*\[\]])/g, '\\$1');
}
