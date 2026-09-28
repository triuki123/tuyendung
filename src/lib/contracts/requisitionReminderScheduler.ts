/**
 * Scheduler nhắc Yêu Cầu Tuyển Dụng sắp hết hạn — chạy in-process, chỉ slot 'am'
 * (khung sáng theo cấu hình; DB rỗng → DEFAULT 9h/15'/10' = hành vi cũ).
 * Dedup bằng requisition_reminder_log nên tick lặp trong khung không gửi trùng.
 */
import { runRequisitionReminders } from '@/lib/services/requisitionReminderService';
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
      const r = await runRequisitionReminders();
      if (r.notified > 0) console.log(`[ReqReminderScheduler] Đã nhắc ${r.due} yêu cầu (${r.notified} thông báo).`);
    }
  } catch (err) {
    console.error('[ReqReminderScheduler] tick error:', err);
  }
  if (running) timer = setTimeout(() => { loop().catch(console.error); }, intervalMin * 60 * 1000);
}

export function startRequisitionReminderScheduler(): void {
  if (running) return;
  running = true;
  console.log('[ReqReminderScheduler] ▶ Khởi động (khung giờ theo cấu hình hệ thống)');
  loop().catch(console.error);
}

export function stopRequisitionReminderScheduler(): void {
  running = false;
  if (timer) { clearTimeout(timer); timer = null; }
}
