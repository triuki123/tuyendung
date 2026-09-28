/**
 * Scheduler báo cáo tuyển dụng tuần — gửi Telegram Thứ Hai 08:00–08:14 (giờ VN).
 * Dedup bằng lastRunDate (gửi 1 lần/ngày dù tick lặp trong khung).
 */
import { runWeeklyRecruitmentReport } from '@/lib/services/recruitmentReportService';
import { resolveSchedulerJob } from '@/lib/scheduler/schedulerTiming';

const INTERVAL_MS = 10 * 60 * 1000; // 10 phút
let timer: ReturnType<typeof setInterval> | null = null;
let lastRunDate = '';

function vnParts(): { dateKey: string; hour: number; minute: number; weekday: string } {
  const d = new Date();
  const dateKey = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const hm = d.toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false });
  const weekday = d.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short' });
  const [h, m] = hm.split(':').map((x) => parseInt(x, 10));
  return { dateKey, hour: h % 24, minute: m, weekday };
}

async function tick(): Promise<void> {
  try {
    const { dateKey, hour, minute, weekday } = vnParts();
    const job = await resolveSchedulerJob('recruitmentReport');
    if (weekday === 'Mon' && hour === job.hour && minute < 15 && lastRunDate !== dateKey) {
      lastRunDate = dateKey;
      const r = await runWeeklyRecruitmentReport();
      console.log(`[RecruitmentReportScheduler] Gửi báo cáo tuần: ${r.sent}/${r.recipients} người.`);
    }
  } catch (err) {
    console.error('[RecruitmentReportScheduler] tick error:', err);
  }
}

export function startRecruitmentReportScheduler(): void {
  if (timer) return;
  console.log('[RecruitmentReportScheduler] ▶ Khởi động (Thứ Hai 8h VN)');
  timer = setInterval(() => { tick().catch(console.error); }, INTERVAL_MS);
}

export function stopRecruitmentReportScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
