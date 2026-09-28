/**
 * Scheduler nhắc công nợ Solace + cảnh báo tồn kho thấp.
 * Tick mỗi 30 phút; chỉ chạy đúng khung giờ cấu hình (key 'solaceDebtReminder').
 * Chống trùng theo ngày nằm trong solaceReminderService (solace_reminder_log).
 */
import { runSolaceReminders } from '@/lib/services/solaceReminderService';
import { vnHourMinute, resolveSchedulerJob } from '@/lib/scheduler/schedulerTiming';

const INTERVAL_MS = 30 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  try {
    const { hour: h } = vnHourMinute();
    const job = await resolveSchedulerJob('solaceDebtReminder');
    if (h === job.hour) await runSolaceReminders();
  } catch (err) {
    console.error('[SolaceReminderScheduler] tick error:', err);
  }
}

export function startSolaceReminderScheduler(): void {
  if (timer) return;
  console.log('[SolaceReminderScheduler] ▶ Khởi động (interval 30 phút)');
  timer = setInterval(() => { tick().catch(console.error); }, INTERVAL_MS);
}

export function stopSolaceReminderScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
