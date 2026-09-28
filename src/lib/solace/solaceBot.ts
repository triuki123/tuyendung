/**
 * solaceBot — primitives gọi Telegram Bot API cho BOT SOLACE riêng (SOLACE_BOT_TOKEN).
 * Tách hẳn bot chính. Dùng cho luồng đặt món tương tác (message/callback) + thông báo Solace.
 */
const API = () => `https://api.telegram.org/bot${process.env.SOLACE_BOT_TOKEN}`;

export interface TgButton { text: string; callback_data?: string; url?: string }
export type TgKeyboard = TgButton[][];

function markup(kb?: TgKeyboard) {
  return kb && kb.length ? { reply_markup: { inline_keyboard: kb } } : {};
}

/**
 * Khử ký tự đặc biệt của Markdown (legacy) trong nội dung ĐỘNG do người dùng nhập
 * (ghi chú, tầng, mã, tên...) để không làm vỡ entity → tránh Telegram trả 400.
 */
export function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/[_*`[\]]/g, '');
}

interface TgResult { ok: boolean; description?: string; result?: unknown; error_code?: number }

async function call(method: string, body: Record<string, unknown>): Promise<TgResult> {
  if (!process.env.SOLACE_BOT_TOKEN) { console.error('[solaceBot] SOLACE_BOT_TOKEN missing'); return { ok: false }; }
  try {
    const res = await fetch(`${API()}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => ({ ok: false }))) as TgResult;
    if (!j.ok) console.error(`[solaceBot] ${method} error:`, j.description);
    return j;
  } catch (e) {
    console.error(`[solaceBot] ${method} exception:`, (e as Error).message);
    return { ok: false };
  }
}

/** Lỗi parse Markdown → gửi lại dạng văn bản thuần để KHÔNG bao giờ "nuốt" tin của khách. */
function isParseError(j: TgResult): boolean {
  return !j.ok && /can't parse|parse entities|entity/i.test(j.description ?? '');
}

/** URL ảnh không phải ảnh trực tiếp / Telegram không tải được preview ảnh từ URL. */
function isPhotoUrlError(j: TgResult): boolean {
  return !j.ok && /wrong type of the web page content|failed to get http url content|wrong file identifier|type of file mismatch/i.test(j.description ?? '');
}

export async function sendMessage(chatId: string | number, text: string, kb?: TgKeyboard): Promise<void> {
  const base = { chat_id: chatId, disable_web_page_preview: true, ...markup(kb) };
  const j = await call('sendMessage', { ...base, text, parse_mode: 'Markdown' });
  if (isParseError(j)) await call('sendMessage', { ...base, text });
}

/** Như sendMessage nhưng trả về message_id (để lưu lại, đồng bộ trạng thái đa chat). */
export async function sendMessageReturningId(chatId: string | number, text: string, kb?: TgKeyboard): Promise<number | null> {
  const base = { chat_id: chatId, disable_web_page_preview: true, ...markup(kb) };
  let j = await call('sendMessage', { ...base, text, parse_mode: 'Markdown' });
  if (isParseError(j)) j = await call('sendMessage', { ...base, text });
  const r = j.result as { message_id?: number } | undefined;
  return r?.message_id ?? null;
}

export async function editMessageText(chatId: string | number, messageId: number, text: string, kb?: TgKeyboard): Promise<void> {
  const base = { chat_id: chatId, message_id: messageId, disable_web_page_preview: true, ...markup(kb) };
  const j = await call('editMessageText', { ...base, text, parse_mode: 'Markdown' });
  if (isParseError(j)) await call('editMessageText', { ...base, text });
}

export async function answerCallback(callbackId: string, text?: string, alert = false): Promise<void> {
  await call('answerCallbackQuery', { callback_query_id: callbackId, text: text ?? '', show_alert: alert });
}

/** Gửi ảnh (PNG buffer) — dùng cho mã VietQR. */
export async function sendPhoto(chatId: string | number, png: Buffer, caption?: string, kb?: TgKeyboard): Promise<void> {
  if (!process.env.SOLACE_BOT_TOKEN) { console.error('[solaceBot] SOLACE_BOT_TOKEN missing'); return; }
  try {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    if (caption) { form.append('caption', caption); form.append('parse_mode', 'Markdown'); }
    if (kb && kb.length) form.append('reply_markup', JSON.stringify({ inline_keyboard: kb }));
    form.append('photo', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'vietqr.png');
    const res = await fetch(`${API()}/sendPhoto`, { method: 'POST', body: form });
    const j = await res.json().catch(() => ({}));
    if (!j.ok) console.error('[solaceBot] sendPhoto error:', j.description);
  } catch (e) {
    console.error('[solaceBot] sendPhoto exception:', (e as Error).message);
  }
}

/**
 * Gửi 1 tin broadcast Marketing. Trả về kết quả chi tiết để service thống kê + xử lý
 * trường hợp user đã CHẶN bot (403 "bot was blocked") → đánh dấu opt-out, ngừng gửi.
 * imageUrl (nếu có) gửi dạng ảnh kèm caption; ngược lại gửi text.
 */
export async function sendMarketing(
  chatId: string | number, text: string, imageUrl?: string | null, kb?: TgKeyboard
): Promise<{ ok: boolean; blocked: boolean; description?: string; errorCode?: number }> {
  const base: Record<string, unknown> = { chat_id: chatId, ...markup(kb) };
  let j: TgResult;
  if (imageUrl) {
    j = await call('sendPhoto', { ...base, photo: imageUrl, caption: text, parse_mode: 'Markdown' });
    if (isParseError(j)) j = await call('sendPhoto', { ...base, photo: imageUrl, caption: text });
    // Ảnh URL sai kiểu (trỏ tới webpage/html thay vì file ảnh trực tiếp) → đừng fail cả chiến dịch.
    // Fallback sang text-only để vẫn gửi được nội dung marketing.
    if (isPhotoUrlError(j)) {
      j = await call('sendMessage', { ...base, text, parse_mode: 'Markdown', disable_web_page_preview: true });
      if (isParseError(j)) j = await call('sendMessage', { ...base, text, disable_web_page_preview: true });
    }
  } else {
    j = await call('sendMessage', { ...base, text, parse_mode: 'Markdown', disable_web_page_preview: true });
    if (isParseError(j)) j = await call('sendMessage', { ...base, text, disable_web_page_preview: true });
  }
  const blocked = j.error_code === 403 || /blocked|deactivated|chat not found|kicked/i.test(j.description ?? '');
  return { ok: j.ok, blocked, description: j.description, errorCode: j.error_code };
}

/** Đăng ký webhook cho bot Solace (gọi 1 lần khi triển khai). */
export async function setWebhook(url: string, secret: string): Promise<unknown> {
  return call('setWebhook', { url, secret_token: secret, allowed_updates: ['message', 'callback_query'] });
}

/** Kiểm tra token + thông tin bot (dùng cho debug). */
export async function getBotInfo(): Promise<TgResult> {
  return call('getMe', {});
}

/** Thông tin webhook hiện tại (dùng cho debug). */
export async function getWebhookInfo(): Promise<TgResult> {
  return call('getWebhookInfo', {});
}
