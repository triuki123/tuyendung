/**
 * Scheduler tự động hoá nhận/trả phòng: nhắc check-in, nhắc trả phòng, tự nhả no-show.
 * Chạy mỗi 3 phút trong khung giờ hành chính (đọc từ config 'roomCheckin').
 */
import { runRoomCheckinAutomation } from '@/lib/services/roomCheckinAutomationService';
import { vnHourMinute, resolveSchedulerJob } from '@/lib/scheduler/schedulerTiming';

const INTERVAL_MS = 3 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  try {
    const { hour: h } = vnHourMinute();
    const job = await resolveSchedulerJob('roomCheckin');
    if (h >= job.hour && h <= (job.endHour ?? 21)) {
      await runRoomCheckinAutomation();
    }
  } catch (err) {
    console.error('[RoomCheckinScheduler] tick error:', err);
  }
}

export function startRoomCheckinScheduler(): void {
  if (timer) return;
  console.log('[RoomCheckinScheduler] ▶ Khởi động (interval 3 phút, khung giờ hành chính)');
  timer = setInterval(() => { tick().catch(console.error); }, INTERVAL_MS);
}

export function stopRoomCheckinScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
