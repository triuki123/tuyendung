/**
 * schedulerTiming — tiện ích dùng chung cho các scheduler Quản Lý Hồ Sơ.
 *
 * Gom logic giờ VN + resolve khung giờ/tần suất từ cấu hình hệ thống
 * (system_settings key 'scheduler.hr'). Khi DB rỗng/chưa migrate → DEFAULT cũ
 * (9h/15h, cửa sổ 15', quét 10') nên hành vi không đổi khi deploy.
 */
import {
  SchedulerConfig, DEFAULT_SCHEDULER, resolveSlot,
  SchedulerJob, SchedulerJobKey, DEFAULT_SCHEDULER_JOBS, mergeSchedulerJob,
} from '@/lib/config/systemConfig';
import { getSchedulerConfig, getSchedulerJob } from '@/lib/services/systemSettingsService';

export { resolveSlot };
export type { SchedulerConfig, SchedulerJob, SchedulerJobKey };

/** Giờ:phút hiện tại theo múi giờ Việt Nam. */
export function vnHourMinute(): { hour: number; minute: number } {
  const s = new Date().toLocaleString('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const [h, m] = s.split(':').map((x) => parseInt(x, 10));
  return { hour: h % 24, minute: m };
}

/** Cấu hình scheduler đã resolve; lỗi (bảng chưa có) → DEFAULT, không bao giờ ném. */
export async function resolveSchedulerTiming(): Promise<SchedulerConfig> {
  try {
    return await getSchedulerConfig();
  } catch {
    return DEFAULT_SCHEDULER;
  }
}

/**
 * Khung giờ chạy của 1 scheduler job (đọc system_settings 'scheduler.job.<key>').
 * Lỗi/bảng chưa có → DEFAULT của job đó, không bao giờ ném. Scheduler gọi mỗi vòng lặp.
 */
export async function resolveSchedulerJob(key: SchedulerJobKey): Promise<SchedulerJob> {
  try {
    return await getSchedulerJob(key);
  } catch {
    return mergeSchedulerJob(key, null);
  }
}

export { DEFAULT_SCHEDULER_JOBS };
