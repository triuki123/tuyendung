/**
 * Scheduler nhắc task/ticket quá hạn hoặc đến hạn hôm nay.
 * Chạy mỗi 10 phút, thực thi trong khung 08:30–08:44 VN (trước giờ làm việc).
 */
import { runTaskOverdueReminders } from '@/lib/services/taskOverdueReminderService';
import { vnHourMinute, resolveSchedulerJob } from '@/lib/scheduler/schedulerTiming';

const INTERVAL_MS = 10 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  try {
    const { hour, minute } = vnHourMinute();
    const job = await resolveSchedulerJob('taskOverdue');
    if (hour === job.hour && minute >= 30 && minute < 45) {
      await runTaskOverdueReminders();
    }
  } catch (err) {
    console.error('[TaskOverdueScheduler] tick error:', err);
  }
}

export function startTaskOverdueScheduler(): void {
  if (timer) return;
  console.log('[TaskOverdueScheduler] ▶ Khởi động (interval 10 phút, khung 8:30 VN)');
  timer = setInterval(() => { tick().catch(console.error); }, INTERVAL_MS);
}

export function stopTaskOverdueScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
