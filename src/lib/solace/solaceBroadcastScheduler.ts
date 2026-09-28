/**
 * Scheduler phát bài Marketing đã HẸN GIỜ của Solace.
 * Tick mỗi phút: lấy bài tới hạn rồi gửi. Chống trùng nhờ chiếm nguyên tử trong sendBroadcast().
 */
import { listDueScheduledIds, sendBroadcast } from '@/lib/services/solaceBroadcastService';

const INTERVAL_MS = 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return;          // tránh chồng tick khi 1 đợt gửi kéo dài
  running = true;
  try {
    const ids = await listDueScheduledIds();
    for (const id of ids) {
      try { await sendBroadcast(id); }
      catch (e) { console.error('[SolaceBroadcastScheduler] send error', id, (e as Error).message); }
    }
  } catch (err) {
    console.error('[SolaceBroadcastScheduler] tick error:', err);
  } finally {
    running = false;
  }
}

export function startSolaceBroadcastScheduler(): void {
  if (timer) return;
  console.log('[SolaceBroadcastScheduler] ▶ Khởi động (interval 1 phút)');
  timer = setInterval(() => { tick().catch(console.error); }, INTERVAL_MS);
}

export function stopSolaceBroadcastScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
