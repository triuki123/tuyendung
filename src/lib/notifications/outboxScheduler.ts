/**
 * outboxScheduler — worker drain hộp thư đi Telegram mỗi ~30s.
 * Vòng lặp tự lên lịch; lỗi không làm vỡ tiến trình. DB chưa migrate → drain no-op.
 */
import { drainOutbox, pruneOutbox } from '@/lib/services/notificationOutboxService';

const INTERVAL_MS = 30_000;
const PRUNE_EVERY_MS = 60 * 60 * 1000; // dọn dòng cũ mỗi giờ
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let lastPrune = 0;

async function loop(): Promise<void> {
  if (!running) return;
  try {
    const r = await drainOutbox();
    if (r.failed > 0) console.warn(`[NotifOutbox] sent=${r.sent} failed=${r.failed}`);

    const now = Date.now();
    if (now - lastPrune > PRUNE_EVERY_MS) {
      lastPrune = now;
      const deleted = await pruneOutbox();
      if (deleted > 0) console.log(`[NotifOutbox] prune: xoá ${deleted} dòng cũ`);
    }
  } catch (err) {
    console.error('[NotifOutbox] drain error:', err);
  }
  if (running) timer = setTimeout(() => { loop().catch(console.error); }, INTERVAL_MS);
}

export function startNotificationOutboxScheduler(): void {
  if (running) return;
  running = true;
  console.log('[NotifOutbox] ▶ Khởi động (drain mỗi 30s)');
  loop().catch(console.error);
}

export function stopNotificationOutboxScheduler(): void {
  running = false;
  if (timer) { clearTimeout(timer); timer = null; }
}
