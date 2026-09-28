/**
 * KPI & Đánh Giá — kỳ đánh giá cụ thể của 1 công ty (vd "Quý 3/2026"). Chu kỳ mặc định
 * đọc từ kpi_company_settings (linh hoạt tuần/tháng/quý/năm theo từng công ty).
 */
import crypto from 'crypto';
import { query, queryOne, execute } from '@/lib/db';
import { KpiPeriodType } from './kpiConfigService';

export type KpiCycleStatus = 'draft' | 'active' | 'closed';

export interface KpiCycle {
  id: string;
  company_id: string;
  period_type: KpiPeriodType;
  name: string;
  start_date: string;
  end_date: string;
  status: KpiCycleStatus;
  created_by: string | null;
  created_at: string;
}

export async function listCycles(companyId: string): Promise<KpiCycle[]> {
  return query<KpiCycle>(
    `SELECT * FROM kpi_cycles WHERE company_id = $1 ORDER BY start_date DESC`,
    [companyId]
  );
}

export async function getCycle(cycleId: string, companyId: string): Promise<KpiCycle | null> {
  return queryOne<KpiCycle>(
    `SELECT * FROM kpi_cycles WHERE id = $1 AND company_id = $2`,
    [cycleId, companyId]
  );
}

export async function createCycle(
  companyId: string,
  data: { period_type: KpiPeriodType; name: string; start_date: string; end_date: string },
  createdBy: string
): Promise<KpiCycle> {
  const id = 'kpc_' + crypto.randomBytes(8).toString('hex');
  return (await queryOne<KpiCycle>(
    `INSERT INTO kpi_cycles (id, company_id, period_type, name, start_date, end_date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [id, companyId, data.period_type, data.name, data.start_date, data.end_date, createdBy]
  ))!;
}

export async function setCycleStatus(cycleId: string, companyId: string, status: KpiCycleStatus): Promise<KpiCycle | null> {
  return queryOne<KpiCycle>(
    `UPDATE kpi_cycles SET status = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3 RETURNING *`,
    [status, cycleId, companyId]
  );
}

/** Lỗi thao tác vào kỳ đã ĐÓNG (lưu trữ) — route bắt để trả 409 kèm thông điệp rõ. */
export class KpiCycleClosedError extends Error {
  constructor(msg = 'Kỳ đã đóng (đã lưu trữ) — không thể giao phiếu mới hay chấm lại. Hãy dùng kỳ đang mở.') {
    super(msg);
    this.name = 'KpiCycleClosedError';
  }
}

/** true nếu kỳ đang ở trạng thái closed (đã đóng/lưu trữ). */
export async function isCycleClosed(cycleId: string, companyId: string): Promise<boolean> {
  const row = await queryOne<{ status: string }>(
    `SELECT status FROM kpi_cycles WHERE id = $1 AND company_id = $2`, [cycleId, companyId]);
  return row?.status === 'closed';
}

/** Ném KpiCycleClosedError nếu kỳ đã đóng — dùng chặn giao/chấm/chốt vào kỳ lưu trữ. */
export async function assertCycleOpen(cycleId: string, companyId: string): Promise<void> {
  if (await isCycleClosed(cycleId, companyId)) throw new KpiCycleClosedError();
}

/** Kỳ đã có phiếu (cá nhân hoặc đơn vị) — dùng để chặn sửa/xóa gây mất dữ liệu người đã làm. */
export async function cycleHasAssignments(cycleId: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM kpi_assignments WHERE cycle_id = $1
       UNION ALL
       SELECT 1 FROM kpi_unit_assignments WHERE cycle_id = $1
     ) AS exists`,
    [cycleId]
  );
  return !!row?.exists;
}

/** Sửa tên/ngày/loại kỳ — CHỈ khi kỳ chưa có phiếu nào (tránh đổi kỳ dưới chân người đã làm). */
export async function updateCycle(
  cycleId: string,
  companyId: string,
  data: { name: string; period_type: KpiPeriodType; start_date: string; end_date: string }
): Promise<KpiCycle | null> {
  if (await cycleHasAssignments(cycleId)) {
    throw new Error('Kỳ đã có phiếu KPI — không thể sửa. Hãy tạo kỳ mới nếu cần.');
  }
  return queryOne<KpiCycle>(
    `UPDATE kpi_cycles SET name = $1, period_type = $2, start_date = $3, end_date = $4, updated_at = NOW()
     WHERE id = $5 AND company_id = $6 RETURNING *`,
    [data.name, data.period_type, data.start_date, data.end_date, cycleId, companyId]
  );
}

/** Xóa kỳ — CHỈ khi chưa có phiếu nào (kpi_assignments/kpi_unit_assignments ON DELETE CASCADE
 * theo cycle_id, xóa nhầm kỳ đã có phiếu sẽ xóa sạch dữ liệu người đã tự nhận xét/chấm). */
export async function deleteCycle(cycleId: string, companyId: string): Promise<boolean> {
  if (await cycleHasAssignments(cycleId)) {
    throw new Error('Kỳ đã có phiếu KPI — không thể xóa (sẽ mất dữ liệu người đã làm).');
  }
  const n = await execute(`DELETE FROM kpi_cycles WHERE id = $1 AND company_id = $2`, [cycleId, companyId]);
  return n > 0;
}

/**
 * Kỳ tổng hợp (quý/6 tháng/năm) — liên kết tới các kỳ THÁNG bên trong để tính điểm THAM
 * KHẢO (trung bình các kỳ tháng đã chốt), không tự động cộng vào điểm chính thức của kỳ
 * tổng hợp. Kỳ tổng hợp vẫn tự nhận xét → quản lý chấm → cấp cao chốt như bình thường.
 */
export async function getRollupChildren(parentCycleId: string, companyId: string): Promise<(KpiCycle & { rollup_weight: number | null })[]> {
  return query<KpiCycle & { rollup_weight: number | null }>(
    `SELECT c.*, r.weight AS rollup_weight FROM kpi_cycles c
       JOIN kpi_cycle_rollups r ON r.child_cycle_id = c.id
      WHERE r.parent_cycle_id = $1 AND c.company_id = $2
      ORDER BY c.start_date`,
    [parentCycleId, companyId]
  );
}

/** Gợi ý kỳ con: cùng công ty, không phải chính nó, nằm TRỌN trong khoảng ngày của kỳ tổng hợp. */
export async function suggestRollupCandidates(parentCycleId: string, companyId: string): Promise<KpiCycle[]> {
  const parent = await getCycle(parentCycleId, companyId);
  if (!parent) return [];
  return query<KpiCycle>(
    `SELECT * FROM kpi_cycles
      WHERE company_id = $1 AND id != $2 AND start_date >= $3 AND end_date <= $4
      ORDER BY start_date`,
    [companyId, parentCycleId, parent.start_date, parent.end_date]
  );
}

/**
 * Thay toàn bộ danh sách kỳ con của 1 kỳ tổng hợp (đồng bộ từ form chọn).
 * `weights` (tùy chọn) = map cycleId → % trọng số; kỳ không có trong map lưu weight NULL (chia đều).
 */
export async function setRollupChildren(
  parentCycleId: string,
  companyId: string,
  childCycleIds: string[],
  weights?: Record<string, number | null>
): Promise<void> {
  const parent = await getCycle(parentCycleId, companyId);
  if (!parent) throw new Error('Không tìm thấy kỳ tổng hợp');
  await execute(`DELETE FROM kpi_cycle_rollups WHERE parent_cycle_id = $1`, [parentCycleId]);
  for (const childId of childCycleIds) {
    const w = weights?.[childId];
    const weight = w === undefined || w === null || Number.isNaN(w) ? null : w;
    await execute(
      `INSERT INTO kpi_cycle_rollups (id, parent_cycle_id, child_cycle_id, weight) VALUES ($1, $2, $3, $4)
       ON CONFLICT (parent_cycle_id, child_cycle_id) DO UPDATE SET weight = EXCLUDED.weight`,
      ['kcr_' + crypto.randomBytes(8).toString('hex'), parentCycleId, childId, weight]
    );
  }
}

function monthBounds(year: number, month1to12: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, month1to12 - 1, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(year, month1to12, 0)).toISOString().slice(0, 10); // ngày 0 của tháng sau = ngày cuối tháng này
  return { start, end };
}

/**
 * Wizard: tạo kỳ Quý/6 Tháng/Năm KÈM tự sinh + liên kết đủ các kỳ Tháng con trong 1 lần bấm —
 * thay vì phải tạo tay từng kỳ Tháng rồi qua panel khác liên kết thủ công. Tháng nào ĐÃ có kỳ
 * sẵn (trùng đúng khoảng ngày) thì tái sử dụng, không tạo trùng. Trọng số để NULL (chia đều),
 * Admin chỉnh lại sau ở panel "Liên Kết Kỳ Tháng" nếu cần.
 */
export async function createRollupCycleWithMonths(
  companyId: string,
  data: { period_type: 'quarter' | 'half_year' | 'year'; name: string; start_date: string; end_date: string },
  createdBy: string
): Promise<{ parent: KpiCycle; monthsCreated: number; monthsLinked: number }> {
  const monthCount = data.period_type === 'quarter' ? 3 : data.period_type === 'half_year' ? 6 : 12;
  const [y0, m0] = data.start_date.split('-').map(Number);

  const parent = await createCycle(companyId, data, createdBy);

  const childIds: string[] = [];
  let monthsCreated = 0;
  for (let i = 0; i < monthCount; i++) {
    const totalMonth = m0 - 1 + i;
    const year = y0 + Math.floor(totalMonth / 12);
    const month = (totalMonth % 12) + 1;
    const { start, end } = monthBounds(year, month);

    let monthCycle = await queryOne<KpiCycle>(
      `SELECT * FROM kpi_cycles WHERE company_id = $1 AND period_type = 'month' AND start_date = $2 AND end_date = $3`,
      [companyId, start, end]
    );
    if (!monthCycle) {
      monthCycle = await createCycle(companyId, {
        period_type: 'month', name: `Tháng ${String(month).padStart(2, '0')} - Năm ${year}`, start_date: start, end_date: end,
      }, createdBy);
      monthsCreated++;
    }
    childIds.push(monthCycle.id);
  }

  await setRollupChildren(parent.id, companyId, childIds);
  return { parent, monthsCreated, monthsLinked: childIds.length };
}
