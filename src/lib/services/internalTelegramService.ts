/**
 * Gửi tin nhắn Telegram nội bộ (thường, KHÔNG hỏi RSVP) — tab Nội Bộ, Trung Tâm Email.
 * Khác event_rsvp/rsvpService: đây là 1 bài đăng đơn giản (tiêu đề nội bộ + nội dung Markdown +
 * ảnh tuỳ chọn), không có nút bấm/callback, không cần lưu phản hồi từng người — chỉ cần log
 * campaign (1 row/lần gửi) để hiện trong lịch sử, theo mẫu marketing_broadcasts (mig 199).
 */
import crypto from 'crypto';
import { query, execute } from '@/lib/db';

const TG = process.env.TELEGRAM_BOT_TOKEN;

export interface InternalTgBroadcastRow {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  target_summary: string | null;
  total_count: number;
  sent_count: number;
  failed_count: number;
  no_channel_count: number;
  created_by: string | null;
  created_at: string;
}

function genId(): string { return 'itgb_' + crypto.randomBytes(10).toString('hex'); }

async function tgApi(method: string, body: any): Promise<any> {
  if (!TG) throw new Error('TELEGRAM_BOT_TOKEN chưa cấu hình');
  const r = await fetch(`https://api.telegram.org/bot${TG}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.description || 'Telegram error');
  return j.result;
}

/** Telegram giới hạn album 2–10 ảnh; caption tối đa 1024 ký tự (gắn vào ảnh đầu). */
export const TG_MAX_IMAGES = 10;

/**
 * Gửi 1 tin Markdown tới 1 chat:
 *  - 0 ảnh  → sendMessage
 *  - 1 ảnh  → sendPhoto (kèm caption nếu có)
 *  - 2..10  → sendMediaGroup (album, caption gắn ảnh đầu nếu có)
 * Cho phép gửi ẢNH KHÔNG CÓ chữ (text rỗng → không gắn caption).
 * Nội dung dài hơn 1024 ký tự caption → gửi thêm 1 tin text phần còn lại (không mất chữ).
 */
async function sendPlainTelegram(chatId: string, text: string, imageUrls: string[]): Promise<void> {
  const imgs = imageUrls.slice(0, TG_MAX_IMAGES);
  const body = text.trim();

  if (imgs.length === 0) {
    if (!body) return; // không ảnh, không chữ → không có gì để gửi
    await tgApi('sendMessage', { chat_id: chatId, text: body.slice(0, 4000), parse_mode: 'Markdown', disable_web_page_preview: false });
    return;
  }

  const caption = body.slice(0, 1024);
  const capFields = caption ? { caption, parse_mode: 'Markdown' } : {};

  if (imgs.length === 1) {
    await tgApi('sendPhoto', { chat_id: chatId, photo: imgs[0], ...capFields });
  } else {
    await tgApi('sendMediaGroup', {
      chat_id: chatId,
      media: imgs.map((url, i) => (i === 0
        ? { type: 'photo', media: url, ...capFields }
        : { type: 'photo', media: url })),
    });
  }

  // Caption bị cắt → gửi nốt phần còn lại để không mất nội dung.
  if (body.length > 1024) {
    await tgApi('sendMessage', { chat_id: chatId, text: body.slice(1024, 1024 + 4000), parse_mode: 'Markdown', disable_web_page_preview: true });
  }
}

interface SendInput {
  title: string;
  content: string;
  /** Danh sách ảnh (0..10). Giữ imageUrl cho tương thích ngược với caller cũ. */
  imageUrls?: string[] | null;
  imageUrl?: string | null;
  personIds: string[];
  targetSummary?: string | null;
  sentBy?: string | null;
}

interface SendResult {
  id: string;
  sent: number;
  failed: number;
  no_channel: number;
}

/** Gửi hàng loạt tin Telegram nội bộ theo danh sách person_id + lưu 1 row lịch sử campaign. */
export async function sendInternalTelegramBroadcast(input: SendInput): Promise<SendResult> {
  const persons = await query<{ id: string; chat_id: string | null }>(
    `SELECT id::text AS id, telegram_chat_id::text AS chat_id FROM users WHERE id::text = ANY($1::text[]) AND status = 'active'`,
    [input.personIds]
  );

  const id = genId();
  // Tiêu đề/nội dung có thể rỗng (vd chỉ gửi ảnh) → chỉ ghép phần nào có, không để dòng trống thừa.
  const titleLine = input.title.trim() ? `*${input.title.trim().replace(/([*_`\[])/g, '\\$1')}*` : '';
  const text = [titleLine, input.content.trim()].filter(Boolean).join('\n\n');
  // Gộp nguồn ảnh: imageUrls (mới) ưu tiên, fallback imageUrl (cũ). Bỏ rỗng, cắt tối đa 10.
  const images = (input.imageUrls?.length ? input.imageUrls : (input.imageUrl ? [input.imageUrl] : []))
    .map((u) => String(u || '').trim())
    .filter(Boolean)
    .slice(0, TG_MAX_IMAGES);

  let sent = 0, failed = 0, no_channel = 0;
  for (const p of persons) {
    if (!p.chat_id) { no_channel++; continue; }
    try {
      await sendPlainTelegram(p.chat_id, text, images);
      sent++;
    } catch (err: any) {
      console.error('sendInternalTelegramBroadcast fail:', p.id, err?.message);
      failed++;
    }
  }

  await execute(
    `INSERT INTO internal_tg_broadcasts (id, title, content, image_url, image_urls, target_summary, total_count, sent_count, failed_count, no_channel_count, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, input.title, input.content, images[0] || null, images.length ? JSON.stringify(images) : null,
     input.targetSummary || null, persons.length, sent, failed, no_channel, input.sentBy || null]
  );

  return { id, sent, failed, no_channel };
}

export async function listInternalTelegramBroadcasts(): Promise<InternalTgBroadcastRow[]> {
  return query<InternalTgBroadcastRow>(
    `SELECT * FROM internal_tg_broadcasts ORDER BY created_at DESC LIMIT 200`
  );
}
