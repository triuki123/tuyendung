/**
 * Scheduler tự động đóng ticket resolved/rejected quá 3 ngày.
 * Chạy mỗi 10 phút, thực thi trong khung 17:00–17:09 VN.
 */
import { runTicketAutoClose } from '@/lib/services/ticketAutoCloseService';
import { vnHourMinute, resolveSchedulerJob } from '@/lib/scheduler/schedulerTiming';

const INTERVAL_MS = 10 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  try {
    const { hour, minute } = vnHourMinute();
    const job = await resolveSchedulerJob('ticketAutoClose');
    if (hour === job.hour && minute < 10) {
      await runTicketAutoClose();
    }
  } catch (err) {
    console.error('[TicketAutoCloseScheduler] tick error:', err);
  }
}

export function startTicketAutoCloseScheduler(): void {
  if (timer) return;
  console.log('[TicketAutoCloseScheduler] ▶ Khởi động (interval 10 phút, khung 17:00 VN)');
  timer = setInterval(() => { tick().catch(console.error); }, INTERVAL_MS);
}

export function stopTicketAutoCloseScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
