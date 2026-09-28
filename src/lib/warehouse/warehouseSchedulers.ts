import { query, execute } from '@/lib/db';
import { purgeOldPhotos, flagMissingCheckouts } from '@/lib/services/warehouseAttendanceService';
import { buildMonthlyReportBuffer } from '@/lib/warehouse/reportData';

/**
 * Scheduler module Warehouse:
 * 1) Mỗi đêm: purge ảnh chấm công quá photo_retention_days + đánh dấu quên check-out.
 * 2) Ngày 1 hằng tháng: tổng hợp công + sản lượng tháng trước thành Excel,
 *    email tới report_emails của từng kho (chống trùng bằng warehouse_report_log).
 */

const INTERVAL_MS = 30 * 60 * 1000; // 30 phút
let timer: ReturnType<typeof setInterval> | null = null;

function vnNow(): { hour: number; day: number; ym: string; prevYm: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const y = get('year'), m = get('month');
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  return { hour: get('hour') % 24, day: get('day'), ym: `${y}-${String(m).padStart(2, '0')}`, prevYm: prev };
}

async function nightlyMaintenance(): Promise<void> {
  const flagged = await flagMissingCheckouts();
  const purged = await purgeOldPhotos();
  if (flagged || purged) {
    console.log(`[WarehouseScheduler] flagged ${flagged} thiếu check-out, purge ${purged} ảnh cũ`);
  }
}

async function sendMonthlyReports(prevYm: string): Promise<void> {
  const warehouses = await query(
    `SELECT id, name, report_emails FROM warehouses
     WHERE active = TRUE AND cardinality(report_emails) > 0`
  );
  for (const wh of warehouses) {
    // Chống trùng: chỉ gửi nếu insert được log
    const ins = await execute(
      `INSERT INTO warehouse_report_log (warehouse_id, report_month) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [wh.id, prevYm]
    );
    if (ins === 0) continue;
    try {
      const report = await buildMonthlyReportBuffer(wh.id, prevYm);
      if (!report) continue;
      const buffer = report.buffer;
      const { sendEmail } = await import('@/lib/services/emailCenterService');
      await sendEmail({
        to: (wh.report_emails as string[]).join(', '),
        category: 'warehouse-report',
        subject: `[Warehouse] Báo cáo công & sản lượng ${prevYm} — ${wh.name}`,
        html: `<p>Đính kèm báo cáo tổng hợp bảng công và sản lượng tháng <b>${prevYm}</b> của kho <b>${wh.name}</b>.</p>
               <p>Email tự động từ hệ thống Warehouse — AssetFlow.</p>`,
        attachments: [{
          filename: `bao-cao-kho-${prevYm}.xlsx`,
          mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          content: buffer,
        }],
      });
      console.log(`[WarehouseScheduler] Đã gửi báo cáo ${prevYm} cho kho ${wh.name}`);
    } catch (err) {
      // Gửi lỗi → xóa log để lần tick sau thử lại
      await execute(`DELETE FROM warehouse_report_log WHERE warehouse_id = $1 AND report_month = $2`, [wh.id, prevYm]);
      console.error(`[WarehouseScheduler] Lỗi gửi báo cáo kho ${wh.name}:`, err);
    }
  }
}

async function tick(): Promise<void> {
  try {
    const { hour, day, prevYm } = vnNow();
    // Bảo trì đêm: chạy trong khung 1h-3h sáng (idempotent nên chạy lặp không sao)
    if (hour >= 1 && hour < 3) await nightlyMaintenance();
    // Báo cáo tháng: ngày 1-3, khung 7h-11h (log chống trùng)
    if (day >= 1 && day <= 3 && hour >= 7 && hour < 11) await sendMonthlyReports(prevYm);
  } catch (err) {
    console.error('[WarehouseScheduler] tick error:', err);
  }
}

export function startWarehouseScheduler(): void {
  if (timer) return;
  timer = setInterval(() => { tick().catch(console.error); }, INTERVAL_MS);
  console.log('[WarehouseScheduler] started');
}

export function stopWarehouseScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
