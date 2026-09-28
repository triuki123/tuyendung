/**
 * Scheduler TỰ ĐỘNG GỬI BẢNG CÔNG về Bộ Phận Chấm Công khi tới hạn nộp.
 *
 * Thay cho luồng cũ (quản lý duyệt & bấm "Gửi"): quản lý giờ CHỈ XEM bảng công.
 * Chạy mỗi 30 phút. Mỗi lượt: duyệt từng công ty (is_active), resolve cấu hình
 * chấm công của công ty đó, tính hạn nộp của kỳ vừa đóng; nếu đã tới hạn thì
 * tự chốt & gửi toàn bộ bảng công của kỳ đó cho các thành viên công ty.
 *
 * An toàn chạy lại: `autoSendSheets` idempotent nhờ điều kiện `sent_to_hr_at IS NULL`.
 * Không cần bảng reminder-log riêng.
 */
import { query } from '@/lib/db';
import { getCompanyMemberUserIds } from '@/lib/services/userCompanyService';
import { resolveAttendanceConfig } from '@/lib/services/attendanceSettingsService';
import { getSheetSubmitDeadline } from '@/lib/services/attendanceAdjustmentService';
import { autoSendSheets } from '@/lib/services/attendanceService';
import { getPayrollPeriodForDate } from '@/lib/config/attendanceConfig';

const INTERVAL_MS = 30 * 60 * 1000;
// Chỉ gửi các kỳ đã tới hạn trong vòng ~35 ngày để không quét vô hạn kỳ cũ.
const RECENCY_MS = 35 * 24 * 60 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;

/** Trừ 1 tháng khỏi (month, year). */
function prevMonth(month: number, year: number): { month: number; year: number } {
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
}

async function tick(): Promise<void> {
  try {
    const now = new Date();
    const todayVN = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }); // YYYY-MM-DD

    const companies = await query<{ id: string }>(
      `SELECT id::text AS id FROM companies WHERE is_active = true`
    );

    for (const { id: companyId } of companies) {
      try {
        const cfg = await resolveAttendanceConfig(companyId, todayVN);
        // Kỳ đang mở theo ngày hôm nay, và kỳ liền trước — kiểm tra cả hai.
        const current = getPayrollPeriodForDate(todayVN, cfg);
        const previous = prevMonth(current.month, current.year);
        const candidates = [previous, current];

        const seen = new Set<string>();
        let members: string[] | null = null;

        for (const p of candidates) {
          const key = `${p.year}-${p.month}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const deadline = await getSheetSubmitDeadline(p.month, p.year, cfg);
          const past = now.getTime() >= deadline.getTime();
          const recent = now.getTime() - deadline.getTime() <= RECENCY_MS;
          if (!past || !recent) continue;

          if (members === null) members = await getCompanyMemberUserIds(companyId);
          if (members.length === 0) break;

          const sent = await autoSendSheets(members, p.month, p.year);
          if (sent > 0) {
            console.log(`[AttendanceAutoSendScheduler] Công ty ${companyId}: tự gửi ${sent} bảng công kỳ ${p.month}/${p.year}`);
          }
        }
      } catch (err) {
        console.error(`[AttendanceAutoSendScheduler] lỗi công ty ${companyId}:`, err);
      }
    }
  } catch (err) {
    console.error('[AttendanceAutoSendScheduler] tick error:', err);
  }
}

export function startAttendanceAutoSendScheduler(): void {
  if (timer) return;
  console.log('[AttendanceAutoSendScheduler] ▶ Khởi động (interval 30 phút, tự gửi bảng công tới hạn nộp)');
  // Chạy 1 lần khi khởi động để bắt kịp kỳ đã tới hạn khi server vừa lên.
  tick().catch(console.error);
  timer = setInterval(() => { tick().catch(console.error); }, INTERVAL_MS);
}

export function stopAttendanceAutoSendScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
