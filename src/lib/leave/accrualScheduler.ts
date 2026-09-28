import { runDailyAccrualTick } from '@/lib/services/leaveAccrualService';
import { vnHourMinute, resolveSchedulerJob } from '@/lib/scheduler/schedulerTiming';

/**
 * Scheduler cộng phép năm tự động.
 * Chạy mỗi 30 phút, chỉ thực thi trong khung 7:00–7:29 sáng giờ VN.
 * Mọi phép cộng đều idempotent (unique period_key) nên tick lặp lại vô hại:
 * - Đầu năm: chuyển phép năm cũ + thâm niên + cấp đủ (chính sách yearly_upfront)
 * - Hằng tháng: cộng dần (chính sách monthly)
 * - Sau hạn carryover (mặc định 31/03): trừ phép chuyển năm chưa dùng
 */

const INTERVAL_MS = 30 * 60 * 1000; // 30 phút
let timer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  try {
    const { hour, minute } = vnHourMinute();
    const job = await resolveSchedulerJob('leaveAccrual');
    if (hour === job.hour && minute < 30) {
      await runDailyAccrualTick();
    }
  } catch (err) {
    console.error('[LeaveAccrualScheduler] tick error:', err);
  }
}

export function startLeaveAccrualScheduler(): void {
  if (timer) return;
  console.log('[LeaveAccrualScheduler] ▶ Started (interval 30 min, chạy lúc 7h sáng VN)');
  timer = setInterval(() => {
    tick().catch(console.error);
  }, INTERVAL_MS);
  // Chạy ngay khi khởi động (bỏ qua check giờ) để không bỏ lỡ ngày nào nếu
  // server restart sau 7h — an toàn vì mọi phép cộng đều idempotent.
  runDailyAccrualTick().catch((err) =>
    console.error('[LeaveAccrualScheduler] startup tick error:', err)
  );
}

export function stopLeaveAccrualScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
