/**
 * Scheduler nhắc + tự kết ca Solace.
 * Tick mỗi 30 phút:
 *  - giờ 'solaceShiftReminder' (mặc định 21h): nhắc nếu HÔM NAY có đơn mà chưa kết ca.
 *  - giờ 'solaceShiftAutoClose' (mặc định 3h sáng): tự kết ca NGÀY HÔM TRƯỚC nếu vẫn chưa chốt.
 * Chống trùng theo ngày nằm trong solaceShiftService (solace_reminder_log).
 */
import { remindUnclosedShift, autoCloseIfUnclosed, todayBusinessDate } from '@/lib/services/solaceShiftService';
import { getOperatingConfig } from '@/lib/services/solaceSettingsService';
import { vnHourMinute } from '@/lib/scheduler/schedulerTiming';

const INTERVAL_MS = 30 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;

/** 'YYYY-MM-DD' → ngày hôm trước. */
function prevDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function tick(): Promise<void> {
  try {
    const { hour } = vnHourMinute();
    const cfg = await getOperatingConfig();   // giờ kết ca lấy từ Cấu Hình Quán
    const today = await todayBusinessDate();
    if (hour === cfg.shiftRemindHour) await remindUnclosedShift(today);
    if (cfg.autoCloseShift && hour === cfg.shiftAutoCloseHour) await autoCloseIfUnclosed(prevDate(today));
  } catch (err) {
    console.error('[SolaceShiftReminderScheduler] tick error:', err);
  }
}

export function startSolaceShiftReminderScheduler(): void {
  if (timer) return;
  console.log('[SolaceShiftReminderScheduler] ▶ Khởi động (interval 30 phút)');
  timer = setInterval(() => { tick().catch(console.error); }, INTERVAL_MS);
}

export function stopSolaceShiftReminderScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
