/**
 * RSVP nội bộ qua Telegram.
 * - Tạo "đợt" (event_key) với tiêu đề chung.
 * - Với mỗi người: gửi Telegram inline_keyboard [✅ Có tham gia | ❌ Không tham gia].
 * - Callback từ Telegram (rsvp:<id>:yes|no) → update DB + edit tin nhắn.
 * - Ai không có telegram_chat_id → fallback ghi log 'no_channel', không gửi email (ngoài scope v0).
 */
import crypto from 'crypto';
import { query, queryOne, execute } from '@/lib/db';

const TG = process.env.TELEGRAM_BOT_TOKEN;

/** Nhãn nút RSVP mặc định (khi người soạn không tuỳ biến). */
export const DEFAULT_YES_LABEL = '✅ Có tham gia';
export const DEFAULT_NO_LABEL = '❌ Không tham gia';

export interface RsvpRow {
  id: string;
  event_key: string;
  event_title: string;
  template_id: string | null;
  person_id: string | null;
  person_name: string;
  person_email: string | null;
  chat_id: string | null;
  message_id: number | null;
  response: 'pending' | 'yes' | 'no';
  responded_at: string | null;
  note: string | null;
  sent_by: string | null;
  yes_label: string | null;
  no_label: string | null;
  created_at: string;
}

function genId(): string { return 'rsvp_' + crypto.randomBytes(10).toString('hex'); }

/** Strip HTML về text đơn giản để hiển thị trong Telegram. */
export function htmlToPlain(html: string): string {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Escape Telegram MarkdownV2 (không dùng vì hay sập; ta dùng HTML mode thay thế). */
function tgEscapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface SendTgOpts { chat_id: string; text: string; reply_markup?: any }
async function tgApi(method: string, body: any): Promise<any> {
  if (!TG) throw new Error('TELEGRAM_BOT_TOKEN chưa cấu hình');
  const r = await fetch(`https://api.telegram.org/bot${TG}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.description || 'Telegram error');
  return j.result;
}

/**
 * Gửi 1 tin RSVP Telegram (inline_keyboard 2 nút yes/no nhãn tuỳ biến).
 * Có imageUrl → gửi dạng ảnh (sendPhoto) + caption; ngược lại gửi text. Trả message_id.
 */
async function sendRsvpTelegram(chatId: string, text: string, rsvpId: string, yesLabel: string, noLabel: string, imageUrl?: string | null): Promise<number> {
  const reply_markup = {
    inline_keyboard: [[
      { text: yesLabel, callback_data: `rsvp:${rsvpId}:yes` },
      { text: noLabel, callback_data: `rsvp:${rsvpId}:no` },
    ]],
  };
  if (imageUrl) {
    // Caption Telegram tối đa 1024 ký tự.
    const res = await tgApi('sendPhoto', {
      chat_id: chatId, photo: imageUrl, caption: text.slice(0, 1024), parse_mode: 'HTML', reply_markup,
    });
    return res.message_id;
  }
  const res = await tgApi('sendMessage', {
    chat_id: chatId, text: text.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true, reply_markup,
  });
  return res.message_id;
}

/** Cập nhật tin sau khi người nhận trả lời — tự nhận diện tin text vs tin ảnh (caption). */
async function editRsvpTelegram(chatId: string, messageId: number, subject: string, statusLine: string) {
  const body = { chat_id: chatId, message_id: messageId, parse_mode: 'HTML' as const };
  const full = `<b>${tgEscapeHtml(subject)}</b>\n\n${statusLine}`;
  try {
    await tgApi('editMessageText', { ...body, text: full });
  } catch {
    // Tin dạng ảnh → sửa caption thay vì text.
    await tgApi('editMessageCaption', { ...body, caption: full.slice(0, 1024) })
      .catch((err) => console.warn('editRsvp fail:', err?.message));
  }
}

interface RsvpBlastInput {
  event_key: string;
  event_title: string;
  template_id?: string | null;
  subject: string;
  html_body: string;                // sẽ được strip HTML
  personIds: string[];              // người được gửi
  sent_by?: string | null;
  yesLabel?: string | null;         // nhãn nút "đồng ý" (mặc định DEFAULT_YES_LABEL)
  noLabel?: string | null;          // nhãn nút "từ chối" (mặc định DEFAULT_NO_LABEL)
  content?: string | null;          // nội dung tin nhắn soạn tay (ưu tiên hơn template body)
  imageUrl?: string | null;         // ảnh kèm (URL công khai để Telegram tải)
}

interface RsvpBlastResult {
  event_key: string;
  sent: number;
  no_channel: number;               // người không có telegram_chat_id
  failed: number;
  ids: string[];                    // rsvp ids đã tạo
}

/** Tạo đợt RSVP + gửi Telegram cho từng người. Bỏ qua ai không có telegram_chat_id. */
export async function sendRsvpBlast(input: RsvpBlastInput): Promise<RsvpBlastResult> {
  const persons = await query<{ id: string; name: string; email: string | null; chat_id: string | null }>(
    `SELECT id::text AS id, name, email, telegram_chat_id::text AS chat_id
       FROM users WHERE id::text = ANY($1::text[]) AND status = 'active'`,
    [input.personIds]
  );
  const yesLabel = (input.yesLabel || '').trim() || DEFAULT_YES_LABEL;
  const noLabel = (input.noLabel || '').trim() || DEFAULT_NO_LABEL;
  // Ưu tiên nội dung soạn tay; nếu trống thì dùng body của template (tương thích ngược).
  const content = (input.content || '').trim();
  const header = content ? input.event_title : input.subject;
  const bodyText = content || htmlToPlain(input.html_body);
  const messageText = `<b>${tgEscapeHtml(header)}</b>\n\n${tgEscapeHtml(bodyText)}`;
  const imageUrl = (input.imageUrl || '').trim() || null;
  const ids: string[] = [];
  let sent = 0, no_channel = 0, failed = 0;
  for (const p of persons) {
    const rsvpId = genId();
    ids.push(rsvpId);
    if (!p.chat_id) {
      await execute(
        `INSERT INTO event_rsvp (id, event_key, event_title, template_id, person_id, person_name, person_email, chat_id, message_id, response, note, sent_by, yes_label, no_label)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,NULL,'pending','no_channel',$8,$9,$10)`,
        [rsvpId, input.event_key, input.event_title, input.template_id || null, p.id, p.name, p.email, input.sent_by || null, yesLabel, noLabel]
      );
      no_channel++;
      continue;
    }
    try {
      const msgId = await sendRsvpTelegram(p.chat_id, messageText, rsvpId, yesLabel, noLabel, imageUrl);
      await execute(
        `INSERT INTO event_rsvp (id, event_key, event_title, template_id, person_id, person_name, person_email, chat_id, message_id, response, sent_by, yes_label, no_label)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,$12)`,
        [rsvpId, input.event_key, input.event_title, input.template_id || null, p.id, p.name, p.email, p.chat_id, msgId, input.sent_by || null, yesLabel, noLabel]
      );
      sent++;
    } catch (err: any) {
      failed++;
      await execute(
        `INSERT INTO event_rsvp (id, event_key, event_title, template_id, person_id, person_name, person_email, chat_id, response, note, sent_by, yes_label, no_label)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10,$11,$12)`,
        [rsvpId, input.event_key, input.event_title, input.template_id || null, p.id, p.name, p.email, p.chat_id, `send_failed: ${err?.message || err}`, input.sent_by || null, yesLabel, noLabel]
      );
    }
  }
  return { event_key: input.event_key, sent, no_channel, failed, ids };
}

/** Xử lý callback từ Telegram: rsvp:<id>:yes|no */
export async function handleRsvpCallback(cbData: string, telegramUserId: string): Promise<{ ok: boolean; toast: string; alert?: boolean }> {
  const m = /^rsvp:([^:]+):(yes|no)$/.exec(cbData);
  if (!m) return { ok: false, toast: 'Yêu cầu không hợp lệ' };
  const [, rsvpId, choice] = m;
  const rsvp = await queryOne<RsvpRow>(`SELECT * FROM event_rsvp WHERE id = $1`, [rsvpId]);
  if (!rsvp) return { ok: false, toast: 'Không tìm thấy RSVP', alert: true };
  // Kiểm tra người bấm chính là người được mời
  if (rsvp.chat_id && rsvp.chat_id !== telegramUserId) {
    return { ok: false, toast: 'Bạn không phải người được mời trong RSVP này', alert: true };
  }
  if (rsvp.response !== 'pending') return { ok: false, toast: 'Bạn đã trả lời rồi', alert: true };
  await execute(
    `UPDATE event_rsvp SET response = $1, responded_at = NOW() WHERE id = $2`,
    [choice, rsvpId]
  );
  const chosenLabel = choice === 'yes'
    ? (rsvp.yes_label || DEFAULT_YES_LABEL)
    : (rsvp.no_label || DEFAULT_NO_LABEL);
  const statusLine = `<b>Đã ghi nhận:</b> ${tgEscapeHtml(rsvp.person_name)} — <i>${tgEscapeHtml(chosenLabel)}</i>`;
  if (rsvp.chat_id && rsvp.message_id) {
    await editRsvpTelegram(rsvp.chat_id, rsvp.message_id, rsvp.event_title, statusLine);
  }
  return { ok: true, toast: `Đã ghi nhận: ${chosenLabel}` };
}

export async function listRsvpByEventKey(eventKey: string): Promise<RsvpRow[]> {
  return query<RsvpRow>(
    `SELECT * FROM event_rsvp WHERE event_key = $1 ORDER BY response, person_name`,
    [eventKey]
  );
}

export async function listRsvpEvents(): Promise<Array<{ event_key: string; event_title: string; total: number; yes: number; no: number; pending: number; created_at: string }>> {
  return query(
    `SELECT event_key,
            MAX(event_title) AS event_title,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE response = 'yes')::int AS yes,
            COUNT(*) FILTER (WHERE response = 'no')::int AS no,
            COUNT(*) FILTER (WHERE response = 'pending')::int AS pending,
            MIN(created_at) AS created_at
       FROM event_rsvp GROUP BY event_key ORDER BY MIN(created_at) DESC LIMIT 100`
  );
}
