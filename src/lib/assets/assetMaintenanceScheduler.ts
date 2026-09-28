/**
 * Scheduler nhắc bảo hành/bảo trì tài sản sắp hết hạn — chỉ slot 'am' (khung
 * sáng theo cấu hình; DB rỗng → DEFAULT 9h/15'/10' = hành vi cũ).
 * Gửi vào các mốc 30/14/7/1 ngày trước ngày hết hạn.
 */
import { runAssetMaintenanceReminders } from '@/lib/services/assetMaintenanceReminderService';
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
      await runAssetMaintenanceReminders();
    }
  } catch (err) {
    console.error('[AssetMaintenanceScheduler] tick error:', err);
  }
  if (running) timer = setTimeout(() => { loop().catch(console.error); }, intervalMin * 60 * 1000);
}

export function startAssetMaintenanceScheduler(): void {
  if (running) return;
  running = true;
  console.log('[AssetMaintenanceScheduler] ▶ Khởi động (khung giờ theo cấu hình hệ thống)');
  loop().catch(console.error);
}

export function stopAssetMaintenanceScheduler(): void {
  running = false;
  if (timer) { clearTimeout(timer); timer = null; }
}
