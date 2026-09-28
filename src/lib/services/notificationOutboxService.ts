import { query, execute } from '@/lib/db';
import { sendTelegramMessageWithButton, sendTelegramMessageToChat } from './telegramService';

/**
 * notificationOutboxService — "hộp thư đi" cho Telegram.
 *
 * Engine ghi tin vào outbox (enqueue) thay vì gửi thẳng. Worker (outboxScheduler)
 * gọi drainOutbox định kỳ: gửi tin pending tới hạn, hỏng thì tăng attempts + lùi
 * next_attempt_at theo back-off, hết lượt → status='failed'. Nhờ vậy Telegram lỗi
 * mạng tức thời không làm MẤT thông báo.
 */

export interface OutboxTelegram {
  chatId: string;
  text: string;
  buttonLabel?: string | null;
  buttonUrl?: string | null;
  userId?: string | null;
  digestGroup?: string | null;
  digestTitle?: string | null;
  digestLine?: string | null;
  landingUrl?: string | null;
}

/** Đẩy 1 tin Telegram vào hộp thư đi. Ném lỗi nếu bảng chưa tồn tại (caller fallback). */
export async function enqueueTelegram(item: OutboxTelegram): Promise<void> {
  const id = `nob_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  await execute(
    `INSERT INTO notification_outbox
       (id, user_id, channel, chat_id, text, button_label, button_url, digest_group, digest_title, digest_line, landing_url)
     VALUES ($1, $2, 'telegram', $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, item.userId ?? null, item.chatId, item.text, item.buttonLabel ?? null, item.buttonUrl ?? null,
     item.digestGroup ?? null, item.digestTitle ?? null, item.digestLine ?? null, item.landingUrl ?? null]
  );
}

interface OutboxRow {
  id: string;
  user_id: string | null;
  chat_id: string;
  text: string;
  button_label: string | null;
  button_url: string | null;
  attempts: number;
  max_attempts: number;
  digest_group: string | null;
  digest_title: string | null;
  digest_line: string | null;
  landing_url: string | null;
}

const DIGEST_MAX_LINES = 15;
// Trần số tin Telegram mỗi người mỗi lượt drain (chặn dội bom). Vượt → hoãn 1 phút.
const MAX_PER_USER_PER_CYCLE = 8;

// Back-off (phút) theo số lần đã thử: 1', 5', 15', 60', 180'.
const BACKOFF_MIN = [1, 5, 15, 60, 180];

export interface OutboxStats { pending: number; sent: number; failed: number }
export interface OutboxRecent {
  id: string; status: string; chat_id: string; text: string;
  attempts: number; last_error: string | null; created_at: string; sent_at: string | null;
}

/** Đếm theo trạng thái (sent chỉ trong 7 ngày để khỏi phình). */
export async function getOutboxStats(): Promise<OutboxStats> {
  try {
    const rows = await query<{ status: string; n: string }>(
      `SELECT status, COUNT(*)::text AS n FROM notification_outbox
        WHERE status <> 'sent' OR created_at > NOW() - INTERVAL '7 days'
        GROUP BY status`
    );
    const s: OutboxStats = { pending: 0, sent: 0, failed: 0 };
    for (const r of rows) {
      if (r.status === 'pending') s.pending = Number(r.n);
      else if (r.status === 'sent') s.sent = Number(r.n);
      else if (r.status === 'failed') s.failed = Number(r.n);
    }
    return s;
  } catch {
    return { pending: 0, sent: 0, failed: 0 };
  }
}

/** Tin gần đây — ưu tiên thất bại/đang chờ trước. */
export async function listRecentOutbox(limit = 50): Promise<OutboxRecent[]> {
  try {
    return await query<OutboxRecent>(
      `SELECT id, status, chat_id, text, attempts, last_error,
              created_at::text AS created_at, sent_at::text AS sent_at
         FROM notification_outbox
        ORDER BY (status = 'failed') DESC, (status = 'pending') DESC, created_at DESC
        LIMIT $1`,
      [limit]
    );
  } catch {
    return [];
  }
}

/**
 * Dọn dòng cũ để bảng không phình vô hạn (retention).
 *  - đã gửi  > sentDays  ngày → xoá
 *  - thất bại > failedDays ngày → xoá
 * Trả về số dòng đã xoá. Lỗi/bảng chưa có → 0.
 */
export async function pruneOutbox(sentDays = 7, failedDays = 30): Promise<number> {
  try {
    const n = await execute(
      `DELETE FROM notification_outbox
        WHERE (status = 'sent'   AND COALESCE(sent_at, created_at) < NOW() - make_interval(days => $1))
           OR (status = 'failed' AND created_at < NOW() - make_interval(days => $2))`,
      [sentDays, failedDays]
    );
    return n;
  } catch {
    return 0;
  }
}

export interface ReadStat { type: string; total: number; read: number }

/**
 * Tỷ lệ đọc thông báo IN-APP theo loại (N ngày gần nhất). "read" = user đã mở
 * (notifications.read = true). Telegram không có read-receipt nên không tính ở đây.
 */
export async function getNotificationReadStats(days = 30, limit = 20): Promise<ReadStat[]> {
  try {
    return await query<ReadStat>(
      `SELECT type,
              COUNT(*)::int AS total,
              (COUNT(*) FILTER (WHERE read))::int AS read
         FROM notifications
        WHERE created_at > NOW() - make_interval(days => $1)
        GROUP BY type
        ORDER BY total DESC
        LIMIT $2`,
      [days, limit]
    );
  } catch {
    return [];
  }
}

/** Đẩy lại 1 tin failed về pending để worker thử lại. */
export async function retryOutboxItem(id: string): Promise<void> {
  await execute(
    `UPDATE notification_outbox
        SET status='pending', attempts=0, last_error=NULL, next_attempt_at=NOW()
      WHERE id=$1 AND status='failed'`,
    [id]
  );
}

function oneLine(s: string): string {
  return (s || '').replace(/[*_`]/g, '').split('\n')[0].slice(0, 120);
}

/** Hoãn các dòng 1 phút (không tính là 1 lần thử) — dùng cho rate-limit. */
async function deferItems(ids: string[]): Promise<void> {
  await execute(`UPDATE notification_outbox SET next_attempt_at = NOW() + make_interval(mins => 1) WHERE id = ANY($1)`, [ids]);
}

/** Tăng attempts cho 1 dòng: hết lượt → failed; chưa → lùi next_attempt_at theo back-off. */
async function bumpAttempt(id: string, attempts: number, maxAttempts: number, err: string): Promise<void> {
  const next = attempts + 1;
  if (next >= maxAttempts) {
    await execute(`UPDATE notification_outbox SET status='failed', attempts=$2, last_error=$3 WHERE id=$1`, [id, next, err]);
  } else {
    const mins = BACKOFF_MIN[Math.min(next - 1, BACKOFF_MIN.length - 1)];
    await execute(
      `UPDATE notification_outbox SET attempts=$2, last_error=$3, next_attempt_at = NOW() + make_interval(mins => $4) WHERE id=$1`,
      [id, next, err, mins]
    );
  }
}

/** Gửi các tin pending tới hạn. Gộp tin cùng (người nhận × digest_group) thành 1 tin. */
export async function drainOutbox(limit = 100): Promise<{ sent: number; failed: number }> {
  let rows: OutboxRow[];
  try {
    rows = await query<OutboxRow>(
      `SELECT id, user_id, chat_id, text, button_label, button_url, attempts, max_attempts,
              digest_group, digest_title, digest_line, landing_url
         FROM notification_outbox
        WHERE status = 'pending' AND next_attempt_at <= NOW()
        ORDER BY next_attempt_at ASC
        LIMIT $1`,
      [limit]
    );
  } catch {
    return { sent: 0, failed: 0 }; // bảng chưa migrate
  }

  let sent = 0;
  let failed = 0;
  // Rate-limit: đếm số tin đã gửi cho mỗi người trong lượt này.
  const perUser = new Map<string, number>();
  const overCap = (u: string | null) => !!u && (perUser.get(u) ?? 0) >= MAX_PER_USER_PER_CYCLE;
  const bumpUser = (u: string | null) => { if (u) perUser.set(u, (perUser.get(u) ?? 0) + 1); };

  // Phân loại: gộp được (digest_group + user_id) vs gửi lẻ.
  const groups = new Map<string, OutboxRow[]>();
  const singles: OutboxRow[] = [];
  for (const r of rows) {
    if (r.digest_group && r.user_id) {
      const k = `${r.user_id}|${r.digest_group}`;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
    } else {
      singles.push(r);
    }
  }

  // Nhóm ≥2 → gộp 1 tin tóm tắt; nhóm 1 phần tử → gửi lẻ.
  for (const items of groups.values()) {
    if (items.length < 2) { singles.push(items[0]); continue; }
    const head = items[0];
    if (overCap(head.user_id)) { await deferItems(items.map(i => i.id)); continue; }
    const shown = items.slice(0, DIGEST_MAX_LINES);
    const extra = items.length - shown.length;
    const body =
      `*${head.digest_title || 'Thông báo'}* (${items.length})\n\n` +
      shown.map(i => `• ${oneLine(i.digest_line || i.text)}`).join('\n') +
      (extra > 0 ? `\n• … và ${extra} mục khác` : '');
    const ids = items.map(i => i.id);
    try {
      if (head.landing_url) await sendTelegramMessageWithButton(body, head.chat_id, 'Xem tất cả', head.landing_url);
      else await sendTelegramMessageToChat(body, head.chat_id);
      await execute(`UPDATE notification_outbox SET status='sent', sent_at=NOW(), attempts=attempts+1 WHERE id = ANY($1)`, [ids]);
      bumpUser(head.user_id);
      sent += items.length;
    } catch (e) {
      const err = ((e as Error).message ?? 'unknown').slice(0, 500);
      for (const i of items) await bumpAttempt(i.id, i.attempts, i.max_attempts, err);
      failed += items.length;
    }
  }

  // Gửi lẻ.
  for (const r of singles) {
    if (overCap(r.user_id)) { await deferItems([r.id]); continue; }
    try {
      if (r.button_label && r.button_url) await sendTelegramMessageWithButton(r.text, r.chat_id, r.button_label, r.button_url);
      else await sendTelegramMessageToChat(r.text, r.chat_id);
      await execute(`UPDATE notification_outbox SET status='sent', sent_at=NOW(), attempts=attempts+1 WHERE id=$1`, [r.id]);
      bumpUser(r.user_id);
      sent++;
    } catch (e) {
      const err = ((e as Error).message ?? 'unknown').slice(0, 500);
      await bumpAttempt(r.id, r.attempts, r.max_attempts, err);
      failed++;
    }
  }

  return { sent, failed };
}
