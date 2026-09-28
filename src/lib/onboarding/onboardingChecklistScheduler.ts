/**
 * Scheduler nhắc onboarding submission chưa được xử lý > 2 ngày.
 * Chạy mỗi 10 phút, thực thi trong khung 10:00–10:14 VN.
 */
import { runOnboardingChecklistReminders } from '@/lib/services/onboardingChecklistReminderService';
import { vnHourMinute, resolveSchedulerJob } from '@/lib/scheduler/schedulerTiming';

const INTERVAL_MS = 10 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  try {
    const { hour, minute } = vnHourMinute();
    const job = await resolveSchedulerJob('onboardingChecklist');
    if (hour === job.hour && minute < 15) {
      await runOnboardingChecklistReminders();
    }
  } catch (err) {
    console.error('[OnboardingChecklistScheduler] tick error:', err);
  }
}

export function startOnboardingChecklistScheduler(): void {
  if (timer) return;
  console.log('[OnboardingChecklistScheduler] ▶ Khởi động (interval 10 phút, khung 10h VN)');
  timer = setInterval(() => { tick().catch(console.error); }, INTERVAL_MS);
}

export function stopOnboardingChecklistScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
