/**
 * Scheduler nhắc phòng họp sắp diễn ra (30 phút trước).
 * Chạy mỗi 5 phút trong giờ hành chính 07:00–21:00 VN để tiết kiệm DB query.
 */
import { runRoomBookingReminders } from '@/lib/services/roomBookingReminderService';
import { vnHourMinute, resolveSchedulerJob } from '@/lib/scheduler/schedulerTiming';

const INTERVAL_MS = 5 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  try {
    const { hour: h } = vnHourMinute();
    const job = await resolveSchedulerJob('roomBookingReminder');
    if (h >= job.hour && h <= (job.endHour ?? 21)) {
      await runRoomBookingReminders();
    }
  } catch (err) {
    console.error('[RoomBookingReminderScheduler] tick error:', err);
  }
}

export function startRoomBookingReminderScheduler(): void {
  if (timer) return;
  console.log('[RoomBookingReminderScheduler] ▶ Khởi động (interval 5 phút, 7h–21h VN)');
  timer = setInterval(() => { tick().catch(console.error); }, INTERVAL_MS);
}

export function stopRoomBookingReminderScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
