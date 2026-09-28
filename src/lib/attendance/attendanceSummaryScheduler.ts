/**
 * Scheduler tổng kết chấm công cuối tháng.
 * Chạy mỗi 30 phút, thực thi ngày 1 của tháng trong khung 08:00–08:29 VN.
 * Gửi thông báo tổng kết tháng trước cho từng nhân viên.
 */
import { runAttendanceSummary } from '@/lib/services/attendanceSummaryService';
import { vnHourMinute, resolveSchedulerJob } from '@/lib/scheduler/schedulerTiming';

const INTERVAL_MS = 30 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  try {
    const { hour, minute } = vnHourMinute();
    const job = await resolveSchedulerJob('attendanceSummary');
    if (hour === job.hour && minute < 30) {
      await runAttendanceSummary();
    }
  } catch (err) {
    console.error('[AttendanceSummaryScheduler] tick error:', err);
  }
}

export function startAttendanceSummaryScheduler(): void {
  if (timer) return;
  console.log('[AttendanceSummaryScheduler] ▶ Khởi động (interval 30 phút, ngày 1 tháng lúc 8h VN)');
  timer = setInterval(() => { tick().catch(console.error); }, INTERVAL_MS);
}

export function stopAttendanceSummaryScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
