/**
 * Scheduler Sinh Nhật.
 * Chạy mỗi 30 phút (nửa đầu giờ):
 *  - Ngày 1 hằng tháng, đúng giờ digest → gửi danh sách sinh nhật trong tháng.
 *  - Mỗi ngày, đúng giờ daily → nhắc BOD & Leader sinh nhật hôm nay.
 * Chống trùng nằm trong service (birthday_reminder_log).
 */
import { runMonthlyDigest, runVipReminder } from '@/lib/services/birthdayService';
import { vnHourMinute, resolveSchedulerJob } from '@/lib/scheduler/schedulerTiming';

const INTERVAL_MS = 30 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  try {
    const { hour, minute } = vnHourMinute();
    if (minute >= 30) return; // chỉ chạy ở nửa đầu mỗi giờ
    const dayVN = Number(new Date().toLocaleString('en-US', { day: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }));

    const digestJob = await resolveSchedulerJob('birthdayDigest');
    const dailyJob = await resolveSchedulerJob('birthdayDaily');

    if (dayVN === 1 && hour === digestJob.hour) await runMonthlyDigest();
    if (hour === dailyJob.hour) await runVipReminder();
  } catch (err) {
    console.error('[BirthdayScheduler] tick error:', err);
  }
}

export function startBirthdayScheduler(): void {
  if (timer) return;
  console.log('[BirthdayScheduler] ▶ Khởi động (interval 30 phút)');
  timer = setInterval(() => { tick().catch(console.error); }, INTERVAL_MS);
}

export function stopBirthdayScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
