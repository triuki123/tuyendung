/**
 * Scheduler nhắc hạn Pháp Chế — chỉ slot 'am' (khung sáng theo cấu hình hệ thống).
 * Copy khuôn assetMaintenanceScheduler: setTimeout loop + resolveSchedulerTiming.
 * Nội dung quét ở legalReminderService (mốc nhắc + người nhận đều cấu hình được).
 */
import { runLegalReminders } from '@/lib/services/legalReminderService';
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
      const sent = await runLegalReminders();
      if (sent > 0) console.log(`[LegalReminderScheduler] đã phát ${sent} nhắc hạn pháp chế`);
    }
  } catch (err) {
    console.error('[LegalReminderScheduler] tick error:', err);
  }
  if (running) timer = setTimeout(() => { loop().catch(console.error); }, intervalMin * 60 * 1000);
}

export function startLegalReminderScheduler(): void {
  if (running) return;
  running = true;
  console.log('[LegalReminderScheduler] ▶ Khởi động (khung giờ theo cấu hình hệ thống)');
  loop().catch(console.error);
}

export function stopLegalReminderScheduler(): void {
  running = false;
  if (timer) { clearTimeout(timer); timer = null; }
}
