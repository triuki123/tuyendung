/**
 * Scheduler tự động tạo bản nháp thỏa thuận onboarding — chạy in-process
 * (cùng kiểu reminderScheduler). Mỗi ~10 phút kiểm tra giờ VN; khung 09:00–09:14
 * gọi tạo nháp cho nhân sự có hire_date = ngày mai (1 ngày trước khi vào làm).
 *
 * Idempotent ở tầng service (bỏ qua nếu nhân sự đã có hợp đồng cùng loại) nên
 * tick lặp trong cùng khung không tạo trùng.
 */
import { runOnboardingContractDrafts } from '@/lib/services/onboardingContractDraftService';
import { vnHourMinute, resolveSchedulerJob } from '@/lib/scheduler/schedulerTiming';

const INTERVAL_MS = 10 * 60 * 1000; // 10 phút
let timer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  try {
    const { hour, minute } = vnHourMinute();
    const job = await resolveSchedulerJob('onboardingDraft');
    if (hour === job.hour && minute < 15) {
      const r = await runOnboardingContractDrafts();
      if (r.created > 0) {
        console.log(
          `[OnboardingDraftScheduler] Đã tạo ${r.created} bản nháp thỏa thuận cho ${r.hires} nhân sự sắp vào làm (bỏ qua ${r.skipped}).`
        );
      }
    }
  } catch (err) {
    console.error('[OnboardingDraftScheduler] tick error:', err);
  }
}

export function startOnboardingDraftScheduler(): void {
  if (timer) return;
  console.log('[OnboardingDraftScheduler] ▶ Khởi động (interval 10 phút, khung 9h VN)');
  timer = setInterval(() => {
    tick().catch(console.error);
  }, INTERVAL_MS);
}

export function stopOnboardingDraftScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
