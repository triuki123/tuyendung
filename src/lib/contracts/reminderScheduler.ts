/**
 * Scheduler nhắc gia hạn hợp đồng — chạy in-process (giống ZKTeco poller).
 * Mỗi vòng quét đọc cấu hình (khung giờ/tần suất) từ system_settings: trùng
 * khung sáng → slot 'am', khung chiều → 'pm'. DB rỗng → DEFAULT 9h/15h/15'/10'
 * (hành vi cũ). contract_reminder_log đảm bảo không gửi trùng trong cùng khung.
 */
import { runContractReminders } from '@/lib/services/contractReminderService';
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
    if (slot) await runContractReminders(slot);
  } catch (err) {
    console.error('[ContractReminderScheduler] tick error:', err);
  }
  if (running) timer = setTimeout(() => { loop().catch(console.error); }, intervalMin * 60 * 1000);
}

export function startContractReminderScheduler(): void {
  if (running) return;
  running = true;
  console.log('[ContractReminderScheduler] ▶ Khởi động (khung giờ theo cấu hình hệ thống)');
  loop().catch(console.error);
}

export function stopContractReminderScheduler(): void {
  running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
