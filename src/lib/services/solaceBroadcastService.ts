/**
 * solaceBroadcastService — module Marketing của Solace.
 * Soạn bài (tiêu đề, nội dung, ảnh, nút link) rồi GỬI tới mọi subscriber bot Solace
 * (người đã /start) qua Telegram. Hỗ trợ gửi ngay hoặc hẹn giờ (scheduler tự phát).
 *
 * Nội dung do admin soạn tự do từng lần → KHÔNG dùng notification template engine;
 * gửi trực tiếp qua primitive sendMarketing() của bot Solace (đúng tầng).
 */
import { query, queryOne, execute } from '@/lib/db';
import { sendMarketing, type TgKeyboard } from '@/lib/solace/solaceBot';
import { listActiveSubscriberChatIds, setSubscriberOptOut } from '@/lib/solace/solaceBotService';

export type BroadcastStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';

export interface Broadcast {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  button_label: string | null;
  button_url: string | null;
  status: BroadcastStatus;
  scheduled_at: string | null;
  total_count: number;
  sent_count: number;
  failed_count: number;
  created_by: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface BroadcastInput {
  title: string;
  content: string;
  imageUrl?: string | null;
  buttonLabel?: string | null;
  buttonUrl?: string | null;
  scheduledAt?: string | null;   // ISO; có giá trị ⇒ hẹn giờ
}

const RATE_DELAY_MS = 40;          // ~25 tin/giây — dưới ngưỡng chống spam của Telegram
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function newId(): string {
  return `bc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Dựng bàn phím 1 nút link nếu có cả nhãn + URL. */
function buildKeyboard(b: Pick<Broadcast, 'button_label' | 'button_url'>): TgKeyboard | undefined {
  if (b.button_label && b.button_url) return [[{ text: b.button_label, url: b.button_url }]];
  return undefined;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────
export async function listBroadcasts(): Promise<Broadcast[]> {
  return query<Broadcast>(
    `SELECT id, title, content, image_url, button_label, button_url, status,
            scheduled_at, total_count, sent_count, failed_count, created_by, created_at, sent_at
       FROM marketing_broadcasts ORDER BY created_at DESC LIMIT 200`
  );
}

export async function getBroadcast(id: string): Promise<Broadcast | null> {
  return queryOne<Broadcast>(
    `SELECT id, title, content, image_url, button_label, button_url, status,
            scheduled_at, total_count, sent_count, failed_count, created_by, created_at, sent_at
       FROM marketing_broadcasts WHERE id = $1`, [id]
  );
}

/** Tạo bài. Có scheduledAt (tương lai) ⇒ 'scheduled', ngược lại 'draft'. */
export async function createBroadcast(input: BroadcastInput, userId: string): Promise<Broadcast> {
  const id = newId();
  const scheduled = input.scheduledAt && new Date(input.scheduledAt).getTime() > Date.now();
  await execute(
    `INSERT INTO marketing_broadcasts
       (id, title, content, image_url, button_label, button_url, status, scheduled_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, input.title, input.content, input.imageUrl ?? null, input.buttonLabel ?? null,
     input.buttonUrl ?? null, scheduled ? 'scheduled' : 'draft',
     scheduled ? input.scheduledAt : null, userId]
  );
  return (await getBroadcast(id))!;
}

/** Sửa bài — chỉ khi còn ở draft/scheduled (đã gửi thì khoá). */
export async function updateBroadcast(id: string, input: BroadcastInput): Promise<Broadcast | null> {
  const cur = await getBroadcast(id);
  if (!cur) return null;
  if (cur.status !== 'draft' && cur.status !== 'scheduled') {
    throw new Error('Bài đã gửi hoặc đang gửi, không sửa được');
  }
  const scheduled = input.scheduledAt && new Date(input.scheduledAt).getTime() > Date.now();
  await execute(
    `UPDATE marketing_broadcasts SET
       title = $2, content = $3, image_url = $4, button_label = $5, button_url = $6,
       status = $7, scheduled_at = $8
     WHERE id = $1`,
    [id, input.title, input.content, input.imageUrl ?? null, input.buttonLabel ?? null,
     input.buttonUrl ?? null, scheduled ? 'scheduled' : 'draft', scheduled ? input.scheduledAt : null]
  );
  return getBroadcast(id);
}

export async function deleteBroadcast(id: string): Promise<void> {
  await execute(`DELETE FROM marketing_broadcasts WHERE id = $1 AND status <> 'sending'`, [id]);
}

// ─── GỬI ─────────────────────────────────────────────────────────────────────
/**
 * Chiếm bài để gửi (nguyên tử): chỉ thành công nếu đang draft/scheduled.
 * Hai luồng (bấm Gửi tay + scheduler) cùng chạy → chỉ MỘT bên chiếm được ⇒ không gửi trùng.
 */
async function claimForSending(id: string): Promise<Broadcast | null> {
  return queryOne<Broadcast>(
    `UPDATE marketing_broadcasts SET status = 'sending'
      WHERE id = $1 AND status IN ('draft', 'scheduled')
      RETURNING id, title, content, image_url, button_label, button_url, status,
                scheduled_at, total_count, sent_count, failed_count, created_by, created_at, sent_at`,
    [id]
  );
}

/**
 * Gửi bài tới mọi subscriber chưa opt-out, có giới hạn tốc độ.
 * User chặn bot (403) → tự đánh dấu opt-out. Cập nhật đếm + chuyển 'sent'.
 * Trả về { total, sent, failed }.
 */
export async function sendBroadcast(id: string): Promise<{ total: number; sent: number; failed: number }> {
  const b = await claimForSending(id);
  if (!b) throw new Error('Bài không tồn tại hoặc đã được gửi');

  const chatIds = await listActiveSubscriberChatIds();
  const kb = buildKeyboard(b);
  let sent = 0, failed = 0;
  let firstError: string | null = null;

  console.log(`[solaceBroadcast] start id=${id} subscribers=${chatIds.length}`);
  await execute(`UPDATE marketing_broadcasts SET total_count = $2 WHERE id = $1`, [id, chatIds.length]);

  for (const chatId of chatIds) {
    try {
      const r = await sendMarketing(chatId, b.content, b.image_url, kb);
      if (r.ok) sent++;
      else {
        failed++;
        if (!firstError) firstError = r.description ?? 'unknown';
        console.warn(`[solaceBroadcast] failed chatId=${chatId} error="${r.description}" code=${r.errorCode}`);
        if (r.blocked) await setSubscriberOptOut(chatId, true);
      }
    } catch (e) {
      failed++;
      if (!firstError) firstError = (e as Error).message;
      console.error('[solaceBroadcast] send error', chatId, (e as Error).message);
    }
    await sleep(RATE_DELAY_MS);
  }
  console.log(`[solaceBroadcast] done id=${id} sent=${sent} failed=${failed} firstError=${firstError}`);

  await execute(
    `UPDATE marketing_broadcasts
        SET status = 'sent', sent_count = $2, failed_count = $3, sent_at = NOW()
      WHERE id = $1`,
    [id, sent, failed]
  );
  return { total: chatIds.length, sent, failed };
}

/**
 * Cho scheduler: lấy id các bài đã hẹn giờ tới hạn (status='scheduled', scheduled_at<=now).
 * Việc chiếm nguyên tử để gửi nằm trong sendBroadcast() nên an toàn khi gọi song song.
 */
export async function listDueScheduledIds(): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM marketing_broadcasts
      WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()
      ORDER BY scheduled_at ASC LIMIT 20`
  );
  return rows.map(r => r.id);
}
