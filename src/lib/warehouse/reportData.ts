import { getWarehouse, listWorkers, type Warehouse } from '@/lib/services/warehouseService';
import {
  getRangeAttendance,
  getRangeApprovedLeaveDays,
  getRangeApprovedAdvances,
  getRangeSessionDetail,
} from '@/lib/services/warehouseAttendanceService';
import { getRangeOutputDetail } from '@/lib/services/warehouseOutputService';
import { buildReportWorkbook } from '@/lib/warehouse/monthlyReportWorkbook';

const fmtDMY = (d: string) => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };

/** Ngày cuối cùng của tháng YYYY-MM */
function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

/** Dựng Excel báo cáo theo KHOẢNG NGÀY bất kỳ */
export async function buildRangeReportBuffer(
  warehouseId: string,
  from: string,
  to: string,
  rangeLabel?: string
): Promise<{ buffer: Buffer; warehouse: Warehouse } | null> {
  const warehouse = await getWarehouse(warehouseId);
  if (!warehouse) return null;
  const [workers, attendance, leaveDays, outputDetail, advances, sessions] = await Promise.all([
    listWorkers(warehouseId),
    getRangeAttendance(warehouseId, from, to),
    getRangeApprovedLeaveDays(warehouseId, from, to),
    getRangeOutputDetail(warehouseId, from, to),
    getRangeApprovedAdvances(warehouseId, from, to),
    getRangeSessionDetail(warehouseId, from, to),
  ]);
  const buffer = buildReportWorkbook({
    warehouseName: warehouse.name,
    from,
    to,
    rangeLabel: rangeLabel || `${fmtDMY(from)} → ${fmtDMY(to)}`,
    workers: workers.map((w) => ({ id: w.id, full_name: w.full_name, cccd: w.cccd, status: w.status })),
    attendance,
    leaveDays,
    outputDetail,
    advances: advances.map((a) => ({ worker_id: a.worker_id, total: Number(a.total) })),
    sessions,
  });
  return { buffer, warehouse };
}

/** Báo cáo tháng = khoảng [ngày 1, ngày cuối tháng] */
export async function buildMonthlyReportBuffer(
  warehouseId: string,
  month: string
): Promise<{ buffer: Buffer; warehouse: Warehouse } | null> {
  const [y, m] = month.split('-');
  return buildRangeReportBuffer(warehouseId, `${month}-01`, lastDayOfMonth(month), `Tháng ${m}/${y}`);
}
