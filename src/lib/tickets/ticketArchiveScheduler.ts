/**
 * Scheduler tự động lưu trữ ticket đã kết thúc (hoàn thành/hủy/đóng) quá 7 ngày.
 * Chạy mỗi 30 phút, thực thi trong khung 03:00–03:29 VN (sau archive bookings 2h).
 */
import { runTicketAutoArchive } from '@/lib/services/ticketArchiveService';
import { vnHourMinute, resolveSchedulerJob } from '@/lib/scheduler/schedulerTiming';

const INTERVAL_MS = 30 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  try {
    const { hour, minute } = vnHourMinute();
    const job = await resolveSchedulerJob('ticketArchive');
    if (hour === job.hour && minute < 30) {
      await runTicketAutoArchive();
    }
  } catch (err) {
    console.error('[TicketArchiveScheduler] tick error:', err);
  }
}

export function startTicketArchiveScheduler(): void {
  if (timer) return;
  console.log('[TicketArchiveScheduler] ▶ Khởi động (interval 30 phút, khung 03:00 VN)');
  timer = setInterval(() => { tick().catch(console.error); }, INTERVAL_MS);
}

export function stopTicketArchiveScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
