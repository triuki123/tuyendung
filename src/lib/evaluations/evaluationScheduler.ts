/**
 * Scheduler đánh giá thử việc — khung giờ/tần suất theo cấu hình hệ thống.
 * - slot 'am': auto-tạo thẻ + gửi reminder
 * - slot 'pm': gửi reminder cho đánh giá đến hạn hôm nay
 * DB rỗng → DEFAULT 9h/15h/15'/10' (hành vi cũ).
 */
import { runEvaluationTasks } from '@/lib/services/evaluationReminderService';
import { DEFAULT_SCHEDULER } from '@/lib/config/systemConfig';
import { vnHourMinute, resolveSlot, resolveSchedulerTiming } from '@/lib/scheduler/schedulerTiming';

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

async function loop(): Promise<void> {
  if (!running) return;
  let intervalMin = DEFAULT_SCHEDULER.checkIntervalMinutes;
  try {
    const cfg = await resolveSchedulerTiming();
    intervalMin = cfg.checkIntervalMinutes;
    const { hour, minute } = vnHourMinute();
    const slot = resolveSlot(hour, minute, cfg);
    if (slot === 'am') {
      const result = await runEvaluationTasks('am');
      console.log(`[EvaluationScheduler] AM: auto-created=${result.autoCreated}, reminded=${result.reminded}, skipped=${result.skipped}`);
    } else if (slot === 'pm') {
      const result = await runEvaluationTasks('pm');
      console.log(`[EvaluationScheduler] PM: reminded=${result.reminded}, skipped=${result.skipped}`);
    }
  } catch (err) {
    console.error('[EvaluationScheduler] tick error:', err);
  }
  if (running) timer = setTimeout(() => { loop().catch(console.error); }, intervalMin * 60 * 1000);
}

export function startEvaluationScheduler(): void {
  if (running) return;
  running = true;
  console.log('[EvaluationScheduler] ▶ Khởi động (khung giờ theo cấu hình hệ thống)');
  loop().catch(console.error);
}

export function stopEvaluationScheduler(): void {
  running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
