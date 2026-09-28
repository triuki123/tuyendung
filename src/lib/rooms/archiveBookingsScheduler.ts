/**
 * Scheduler lưu trữ booking phòng họp > 7 ngày.
 * Chạy mỗi 30 phút, thực thi trong khung 02:00–02:29 VN (ban đêm).
 */
import { runArchiveOldBookings } from '@/lib/services/archiveBookingsService';
import { vnHourMinute, resolveSchedulerJob } from '@/lib/scheduler/schedulerTiming';

const INTERVAL_MS = 30 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  try {
    const { hour, minute } = vnHourMinute();
    const job = await resolveSchedulerJob('archiveBookings');
    if (hour === job.hour && minute < 30) {
      await runArchiveOldBookings();
    }
  } catch (err) {
    console.error('[ArchiveBookingsScheduler] tick error:', err);
  }
}

export function startArchiveBookingsScheduler(): void {
  if (timer) return;
  console.log('[ArchiveBookingsScheduler] ▶ Khởi động (interval 30 phút, khung 2h VN)');
  timer = setInterval(() => { tick().catch(console.error); }, INTERVAL_MS);
}

export function stopArchiveBookingsScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
