/**
 * Scheduler nhắc hạn KPI (cá nhân + đơn vị) sắp hết kỳ — chỉ slot 'am' (khung sáng theo
 * cấu hình hệ thống; DB rỗng → DEFAULT 9h/15'/10' = hành vi cũ).
 */
import { runKpiDeadlineReminders } from '@/lib/services/kpiReminderService';
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
    if (resolveSlot(hour, minute, cfg) === 'am') {
      await runKpiDeadlineReminders();
    }
  } catch (err) {
    console.error('[KpiReminderScheduler] tick error:', err);
  }
  if (running) timer = setTimeout(() => { loop().catch(console.error); }, intervalMin * 60 * 1000);
}

export function startKpiReminderScheduler(): void {
  if (running) return;
  running = true;
  console.log('[KpiReminderScheduler] ▶ Khởi động (khung giờ theo cấu hình hệ thống)');
  loop().catch(console.error);
}

export function stopKpiReminderScheduler(): void {
  running = false;
  if (timer) { clearTimeout(timer); timer = null; }
}
