/**
 * bookingBot — primitives gọi Telegram Bot API cho BOT CHÍNH "FADO Notification"
 * (TELEGRAM_BOT_TOKEN), phục vụ luồng hội thoại /booking. Hỗ trợ inline keyboard
 * tuỳ ý (khác các helper cũ trong telegramService chỉ gửi 1 nút URL / xoá nút).
 */
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = () => `https://api.telegram.org/bot${TOKEN}`;

export interface TgButton { text: string; callback_data?: string; url?: string }
export type TgKeyboard = TgButton[][];

function markup(kb?: TgKeyboard) {
  return kb && kb.length ? { reply_markup: { inline_keyboard: kb } } : {};
}

/** Khử ký tự Markdown trong nội dung động (tên phòng/mục đích người nhập). */
export function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/[_*`[\]]/g, '');
}

interface TgResult { ok: boolean; description?: string; result?: unknown }

async function call(method: string, body: Record<string, unknown>): Promise<TgResult> {
  if (!TOKEN) { console.error('[bookingBot] TELEGRAM_BOT_TOKEN missing'); return { ok: false }; }
  try {
    const res = await fetch(`${API()}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => ({ ok: false }))) as TgResult;
    if (!j.ok) console.error(`[bookingBot] ${method} error:`, j.description);
    return j;
  } catch (e) {
    console.error(`[bookingBot] ${method} exception:`, (e as Error).message);
    return { ok: false };
  }
}

function isParseError(j: TgResult): boolean {
  return !j.ok && /can't parse|parse entities|entity/i.test(j.description ?? '');
}

export async function sendMessage(chatId: string | number, text: string, kb?: TgKeyboard): Promise<void> {
  const base = { chat_id: chatId, disable_web_page_preview: true, ...markup(kb) };
  const j = await call('sendMessage', { ...base, text, parse_mode: 'Markdown' });
  if (isParseError(j)) await call('sendMessage', { ...base, text });
}

export async function editMessageText(chatId: string | number, messageId: number, text: string, kb?: TgKeyboard): Promise<void> {
  const base = { chat_id: chatId, message_id: messageId, disable_web_page_preview: true, ...markup(kb) };
  const j = await call('editMessageText', { ...base, text, parse_mode: 'Markdown' });
  if (isParseError(j)) await call('editMessageText', { ...base, text });
}

export async function answerCallback(callbackId: string, text?: string, alert = false): Promise<void> {
  await call('answerCallbackQuery', { callback_query_id: callbackId, text: text?.slice(0, 200) ?? '', show_alert: alert });
}

/** Đăng ký lệnh menu của bot (idempotent) — để /booking hiện trong menu Telegram. */
export async function setBookingCommands(): Promise<void> {
  await call('setMyCommands', {
    commands: [{ command: 'booking', description: 'Đặt phòng họp' }],
  });
}

/**
 * (Re)đăng ký webhook bot chính để CHẮC CHẮN nhận cả 'message' (cho /booking) lẫn
 * 'callback_query' (cho duyệt). Idempotent — chạy lại không hại.
 */
export async function registerMainWebhook(url: string, secret?: string): Promise<TgResult> {
  const body: Record<string, unknown> = {
    url,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
  };
  if (secret) body.secret_token = secret;
  return call('setWebhook', body);
}

export async function getWebhookInfo(): Promise<TgResult> {
  return call('getWebhookInfo', {});
}

/**
 * Tự đảm bảo webhook bot chính nhận cả message + callback_query, và lệnh /booking
 * có trong menu — gọi lúc server khởi động (idempotent). Bỏ qua nếu thiếu token.
 * KHÔNG phá luồng duyệt: vẫn cùng URL/secret, allowed_updates vẫn gồm callback_query.
 */
export async function ensureBookingWebhook(): Promise<void> {
  if (!TOKEN) return;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://assetflow.fadoai.com';
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || undefined;
  try {
    await registerMainWebhook(`${appUrl}/api/telegram/webhook`, secret);
    await setBookingCommands();
    console.log('✅ Booking bot webhook + commands registered');
  } catch (e) {
    console.error('ensureBookingWebhook error:', (e as Error).message);
  }
}
