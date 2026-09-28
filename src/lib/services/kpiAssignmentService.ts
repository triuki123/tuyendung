/**
 * KPI & Đánh Giá — phiếu KPI của 1 nhân viên trong 1 kỳ, luồng 3 tầng:
 * draft → self_review (nhân viên tự nhận xét) → manager_review (quản lý chấm) →
 * senior_review (cấp cao xem lại) → concluded (cấp cao chốt — final_score là điểm CHÍNH THỨC).
 *
 * ⚠️ CÁCH LY CÔNG TY: mọi hàm đọc/ghi đều nhận company_id và lọc cứng trong SQL — kể cả
 * admin cũng không đọc được assignment công ty khác qua service này.
 */
import crypto from 'crypto';
import { query, queryOne, withTransaction } from '@/lib/db';
import { getTemplateWithItems, findBestTemplateForEmployee, KpiTargetType } from './kpiTemplateService';
import { isRankingEnabledForUser } from './kpiConfigService';
import { assertCycleOpen } from './kpiCycleService';
import { notify } from '@/lib/notifications/engine';
import type { PoolClient } from 'pg';

/** Phần TỔNG KẾT phiếu KPI — điểm mạnh / cần cải thiện / mục tiêu kỳ tới / nhu cầu đào tạo. */
export interface KpiSummaryInput {
  strengths?: string | null;
  improvements?: string | null;
  next_goals?: string | null;
  training_needs?: string | null;
}

/** Xếp loại A/B/C/D từ điểm chính thức (0-100). Đồng bộ với kpiGradeFromScore ở client. */
export function kpiGrade(score: number | null | undefined): 'A' | 'B' | 'C' | 'D' | null {
  if (score == null) return null;
  const s = Number(score);
  if (s >= 90) return 'A';
  if (s >= 75) return 'B';
  if (s >= 60) return 'C';
  return 'D';
}

/** Ghi phần tổng kết + xếp loại vào phiếu (chỉ set field được truyền — giữ nguyên field cũ). */
async function applySummary(
  client: PoolClient,
  assignmentId: string,
  summary: KpiSummaryInput | undefined,
  grade: string | null
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`); };
  if (summary) {
    if (summary.strengths !== undefined) add('strengths', summary.strengths ?? null);
    if (summary.improvements !== undefined) add('improvements', summary.improvements ?? null);
    if (summary.next_goals !== undefined) add('next_goals', summary.next_goals ?? null);
    if (summary.training_needs !== undefined) add('training_needs', summary.training_needs ?? null);
  }
  if (grade !== null) add('grade', grade);
  if (!sets.length) return;
  params.push(assignmentId);
  await client.query(`UPDATE kpi_assignments SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
}

/** Tên kỳ + tên nhân viên cho biến thông báo — không chặn luồng chính nếu lỗi. */
async function notifyVars(cycleId: string, employeeId: string): Promise<{ cycleName: string; employeeName: string }> {
  const [cycle, employee] = await Promise.all([
    queryOne<{ name: string }>(`SELECT name FROM kpi_cycles WHERE id = $1`, [cycleId]),
    queryOne<{ name: string }>(`SELECT name FROM users WHERE id = $1`, [employeeId]),
  ]);
  return { cycleName: cycle?.name || '', employeeName: employee?.name || '' };
}

export type KpiAssignmentStatus = 'draft' | 'self_review' | 'manager_review' | 'senior_review' | 'concluded';
export type KpiReviewTier = 'self' | 'manager' | 'senior';

export interface KpiAssignmentItem {
  id: string;
  assignment_id: string;
  name: string;
  description: string | null;
  weight: number;
  target_type: KpiTargetType;
  target_value: string | null;
  unit: string | null;
  self_actual: string | null;
  self_note: string | null;
  self_score: number | null;
  manager_actual: string | null;
  manager_note: string | null;
  manager_score: number | null;
  final_score: number | null;
  sort_order: number;
}

export interface KpiAssignment {
  id: string;
  cycle_id: string;
  company_id: string;
  employee_id: string;
  template_id: string | null;
  manager_id: string | null;
  senior_id: string | null;
  status: KpiAssignmentStatus;
  self_score: number | null;
  manager_score: number | null;
  final_score: number | null;
  ranking_enabled: boolean;
  submitted_self_at: string | null;
  submitted_manager_at: string | null;
  concluded_at: string | null;
  created_at: string;
}

/** Tạo phiếu KPI cho 1 nhân viên trong 1 kỳ — copy chỉ tiêu từ template, snapshot người chấm. */
export async function createAssignment(
  companyId: string,
  data: {
    cycle_id: string;
    employee_id: string;
    template_id?: string | null;
    manager_id?: string | null;
    senior_id?: string | null;
    department_id?: string | null;
    job_title_id?: string | null;
  }
): Promise<KpiAssignment> {
  await assertCycleOpen(data.cycle_id, companyId);
  return withTransaction(async (client) => {
    const id = 'kpa_' + crypto.randomBytes(8).toString('hex');
    const rankingEnabled = await isRankingEnabledForUser(companyId, data.employee_id);

    const { rows } = await client.query(
      `INSERT INTO kpi_assignments (id, cycle_id, company_id, employee_id, template_id, manager_id, senior_id, ranking_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, data.cycle_id, companyId, data.employee_id, data.template_id ?? null, data.manager_id ?? null, data.senior_id ?? null, rankingEnabled]
    );

    if (data.template_id) {
      const tpl = await getTemplateWithItems(data.template_id, companyId);
      let order = 0;
      for (const item of tpl?.items || []) {
        const itemId = 'kai_' + crypto.randomBytes(8).toString('hex');
        await client.query(
          `INSERT INTO kpi_assignment_items (id, assignment_id, name, description, weight, target_type, target_value, unit, category, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [itemId, id, item.name, item.description ?? null, item.weight, item.target_type, item.target_value ?? null, item.unit ?? null, (item as { category?: string | null }).category ?? null, order++]
        );
      }
    }
    return rows[0];
  }).then(async (assignment) => {
    const { cycleName } = await notifyVars(assignment.cycle_id, assignment.employee_id);
    void notify('kpi.assigned', { cycleName }, { recipients: [assignment.employee_id], relatedId: assignment.id }).catch(() => {});
    return assignment;
  });
}

/**
 * Giao KPI hàng loạt cho nhiều nhân viên cùng lúc — mỗi người tự resolve bộ chỉ tiêu phù
 * hợp nhất (chức danh > phòng ban > toàn công ty) + quản lý trực tiếp của họ. Bỏ qua người
 * đã có phiếu trong kỳ này (không tạo trùng).
 */
export async function bulkCreateAssignments(
  companyId: string,
  data: { cycle_id: string; employee_ids: string[] }
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  for (const employeeId of data.employee_ids) {
    const exists = await queryOne(
      `SELECT 1 FROM kpi_assignments WHERE cycle_id = $1 AND employee_id = $2`,
      [data.cycle_id, employeeId]
    );
    if (exists) { skipped++; continue; }

    const info = await queryOne<{ department_id: string | null; sub_department_id: string | null; job_title_id: string | null; manager_id: string | null }>(
      `SELECT COALESCE(oa.department_id, u.department_id) AS department_id,
              COALESCE(oa.sub_department_id, u.sub_department_id) AS sub_department_id,
              COALESCE(oa.job_title_id, u.job_title_id) AS job_title_id,
              COALESCE(oa.manager_id, u.manager_id) AS manager_id
         FROM users u
         LEFT JOIN org_assignments oa ON oa.user_id::text = u.id::text AND oa.company_id::text = $2
              AND oa.is_primary AND oa.is_active
        WHERE u.id::text = $1`,
      [employeeId, companyId]
    );

    const template = await findBestTemplateForEmployee(companyId, info?.department_id ?? null, info?.job_title_id ?? null, info?.sub_department_id ?? null);

    await createAssignment(companyId, {
      cycle_id: data.cycle_id,
      employee_id: employeeId,
      template_id: template?.id ?? null,
      manager_id: info?.manager_id ?? null,
      senior_id: null,
    });
    created++;
  }
  return { created, skipped };
}

export async function getAssignmentWithItems(assignmentId: string, companyId: string) {
  const a = await queryOne<KpiAssignment & {
    employee_name: string; manager_name: string | null; senior_name: string | null;
    cycle_name: string; start_date: string; end_date: string; company_name: string; cycle_status: string;
  }>(
    `SELECT a.*, u.name AS employee_name, mu.name AS manager_name, su.name AS senior_name,
            c.name AS cycle_name, c.start_date, c.end_date, c.status AS cycle_status, co.name AS company_name
       FROM kpi_assignments a
       JOIN users u ON u.id::text = a.employee_id
       LEFT JOIN users mu ON mu.id::text = a.manager_id
       LEFT JOIN users su ON su.id::text = a.senior_id
       JOIN kpi_cycles c ON c.id = a.cycle_id
       JOIN companies co ON co.id = a.company_id
      WHERE a.id = $1 AND a.company_id = $2`,
    [assignmentId, companyId]
  );
  if (!a) return null;
  const items = await query<KpiAssignmentItem>(
    `SELECT * FROM kpi_assignment_items WHERE assignment_id = $1 ORDER BY sort_order`,
    [assignmentId]
  );
  return { ...a, items };
}

/** Danh sách phiếu KPI của chính nhân viên (mọi vai trò dùng để xem "KPI của tôi"). */
export async function listMyAssignments(companyId: string, employeeId: string): Promise<KpiAssignment[]> {
  return query<KpiAssignment>(
    `SELECT a.*, c.name AS cycle_name, c.start_date, c.end_date
       FROM kpi_assignments a JOIN kpi_cycles c ON c.id = a.cycle_id
      WHERE a.company_id = $1 AND a.employee_id = $2
      ORDER BY c.start_date DESC`,
    [companyId, employeeId]
  );
}

/** Danh sách phiếu KPI mà 1 quản lý cần chấm (tầng manager) trong công ty của họ. */
export async function listAssignmentsForManager(companyId: string, managerId: string): Promise<KpiAssignment[]> {
  return query<KpiAssignment>(
    `SELECT a.*, u.name AS employee_name, c.name AS cycle_name
       FROM kpi_assignments a
       JOIN users u ON u.id::text = a.employee_id
       JOIN kpi_cycles c ON c.id = a.cycle_id
      WHERE a.company_id = $1 AND a.manager_id = $2
      ORDER BY c.start_date DESC`,
    [companyId, managerId]
  );
}

/** Danh sách phiếu KPI cần cấp cao chốt (tầng senior) trong công ty của họ. */
export async function listAssignmentsForSenior(companyId: string, seniorId: string): Promise<KpiAssignment[]> {
  return query<KpiAssignment>(
    `SELECT a.*, u.name AS employee_name, c.name AS cycle_name
       FROM kpi_assignments a
       JOIN users u ON u.id::text = a.employee_id
       JOIN kpi_cycles c ON c.id = a.cycle_id
      WHERE a.company_id = $1 AND a.senior_id = $2
      ORDER BY c.start_date DESC`,
    [companyId, seniorId]
  );
}

/** Toàn bộ phiếu KPI của công ty (Admin) — không xem chéo công ty khác. */
export async function listAssignmentsForCompany(companyId: string): Promise<KpiAssignment[]> {
  return query<KpiAssignment>(
    `SELECT a.*, u.name AS employee_name, mu.name AS manager_name, su.name AS senior_name,
            c.name AS cycle_name, c.status AS cycle_status
       FROM kpi_assignments a
       JOIN users u ON u.id::text = a.employee_id
       LEFT JOIN users mu ON mu.id::text = a.manager_id
       LEFT JOIN users su ON su.id::text = a.senior_id
       JOIN kpi_cycles c ON c.id = a.cycle_id
      WHERE a.company_id = $1
      ORDER BY c.start_date DESC, u.name`,
    [companyId]
  );
}

/**
 * Xoá 1 phiếu KPI (kèm chỉ tiêu + lịch sử chấm — CASCADE). Dùng khi giao nhầm.
 * Cách ly công ty bằng company_id. Trả về false nếu không tìm thấy.
 */
export async function deleteAssignment(id: string, companyId: string): Promise<boolean> {
  const { execute } = await import('@/lib/db');
  const n = await execute(`DELETE FROM kpi_assignments WHERE id = $1 AND company_id = $2`, [id, companyId]);
  return n > 0;
}

/** Trạng thái + người liên quan của 1 phiếu — nhẹ, để kiểm tra quyền xoá không cần tải cả items. */
export async function getAssignmentMeta(id: string, companyId: string): Promise<{ status: string; manager_id: string | null; senior_id: string | null; employee_id: string } | null> {
  return queryOne(
    `SELECT status, manager_id, senior_id, employee_id FROM kpi_assignments WHERE id = $1 AND company_id = $2`,
    [id, companyId]
  );
}

function weightedScore(items: { weight: number; score: number | null }[]): number | null {
  const scored = items.filter((i) => i.score !== null && i.score !== undefined);
  if (!scored.length) return null;
  const totalWeight = scored.reduce((s, i) => s + Number(i.weight), 0);
  if (totalWeight <= 0) return null;
  const sum = scored.reduce((s, i) => s + Number(i.weight) * Number(i.score), 0);
  return Math.round((sum / totalWeight) * 100) / 100;
}

/** Nhân viên nộp tự nhận xét: điền actual/note/score từng chỉ tiêu, chuyển trạng thái sang manager_review. */
export async function submitSelfReview(
  assignmentId: string,
  companyId: string,
  employeeId: string,
  items: { id: string; actual?: string | null; note?: string | null; score?: number | null; achieved?: boolean | null }[]
): Promise<KpiAssignment | null> {
  return withTransaction(async (client) => {
    const { rows: aRows } = await client.query(
      `SELECT * FROM kpi_assignments WHERE id = $1 AND company_id = $2 AND employee_id = $3`,
      [assignmentId, companyId, employeeId]
    );
    const assignment = aRows[0];
    if (!assignment) return null;
    await assertCycleOpen(assignment.cycle_id, companyId);

    for (const it of items) {
      await client.query(
        `UPDATE kpi_assignment_items SET self_actual = $1, self_note = $2, self_score = $3, self_achieved = $4
         WHERE id = $5 AND assignment_id = $6`,
        [it.actual ?? null, it.note ?? null, it.score ?? null, it.achieved ?? null, it.id, assignmentId]
      );
    }
    const { rows: itemRows } = await client.query(
      `SELECT weight, self_score AS score FROM kpi_assignment_items WHERE assignment_id = $1`,
      [assignmentId]
    );
    const selfScore = weightedScore(itemRows);

    const { rows } = await client.query(
      `UPDATE kpi_assignments SET status = 'manager_review', self_score = $1, submitted_self_at = NOW(), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [selfScore, assignmentId]
    );
    await client.query(
      `INSERT INTO kpi_reviews (id, assignment_id, tier, reviewer_id, score, note)
       VALUES ($1, $2, 'self', $3, $4, NULL)`,
      ['kpr_' + crypto.randomBytes(8).toString('hex'), assignmentId, employeeId, selfScore]
    );
    return rows[0];
  }).then(async (assignment) => {
    if (!assignment) return assignment;
    if (assignment.manager_id) {
      const { cycleName, employeeName } = await notifyVars(assignment.cycle_id, assignment.employee_id);
      void notify('kpi.manager_pending', { cycleName, employeeName }, { recipients: [assignment.manager_id], relatedId: assignment.id }).catch(() => {});
    }
    return assignment;
  });
}

/** Quản lý chấm điểm từng chỉ tiêu, chuyển trạng thái sang senior_review. */
export async function submitManagerReview(
  assignmentId: string,
  companyId: string,
  managerId: string,
  items: { id: string; actual?: string | null; note?: string | null; score?: number | null; achieved?: boolean | null }[],
  note?: string,
  summary?: KpiSummaryInput
): Promise<KpiAssignment | null> {
  return withTransaction(async (client) => {
    const { rows: aRows } = await client.query(
      `SELECT * FROM kpi_assignments WHERE id = $1 AND company_id = $2 AND manager_id = $3`,
      [assignmentId, companyId, managerId]
    );
    const assignment = aRows[0];
    if (!assignment) return null;
    await assertCycleOpen(assignment.cycle_id, companyId);

    for (const it of items) {
      await client.query(
        `UPDATE kpi_assignment_items SET manager_actual = $1, manager_note = $2, manager_score = $3, manager_achieved = $4
         WHERE id = $5 AND assignment_id = $6`,
        [it.actual ?? null, it.note ?? null, it.score ?? null, it.achieved ?? null, it.id, assignmentId]
      );
    }
    const { rows: itemRows } = await client.query(
      `SELECT weight, manager_score AS score FROM kpi_assignment_items WHERE assignment_id = $1`,
      [assignmentId]
    );
    const managerScore = weightedScore(itemRows);

    // Nếu phiếu không có cấp cao (senior_id null) → quản lý là tầng chốt cuối luôn.
    const nextStatus = assignment.senior_id ? 'senior_review' : 'concluded';
    const grade = nextStatus === 'concluded' ? kpiGrade(managerScore) : null;
    await applySummary(client, assignmentId, summary, grade);
    const { rows } = await client.query(
      `UPDATE kpi_assignments SET status = $1, manager_score = $2, final_score = CASE WHEN $1 = 'concluded' THEN $2 ELSE final_score END,
              submitted_manager_at = NOW(), concluded_at = CASE WHEN $1 = 'concluded' THEN NOW() ELSE concluded_at END, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [nextStatus, managerScore, assignmentId]
    );
    await client.query(
      `INSERT INTO kpi_reviews (id, assignment_id, tier, reviewer_id, score, note)
       VALUES ($1, $2, 'manager', $3, $4, $5)`,
      ['kpr_' + crypto.randomBytes(8).toString('hex'), assignmentId, managerId, managerScore, note ?? null]
    );
    return rows[0];
  }).then(async (assignment) => {
    if (!assignment) return assignment;
    const { cycleName, employeeName } = await notifyVars(assignment.cycle_id, assignment.employee_id);
    if (assignment.status === 'senior_review' && assignment.senior_id) {
      void notify('kpi.senior_pending', { cycleName, employeeName }, { recipients: [assignment.senior_id], relatedId: assignment.id }).catch(() => {});
    } else if (assignment.status === 'concluded') {
      void notify('kpi.concluded', { cycleName, finalScore: assignment.final_score ?? '' }, { recipients: [assignment.employee_id], relatedId: assignment.id }).catch(() => {});
    }
    return assignment;
  });
}

/**
 * Cấp cao chốt điểm cuối cùng — final_score là điểm CHÍNH THỨC, có thể ghi đè điểm quản lý.
 * Không sửa self_score/manager_score gốc (giữ nguyên vết ở kpi_reviews để tra cứu).
 */
export async function concludeSeniorReview(
  assignmentId: string,
  companyId: string,
  seniorId: string,
  finalScore: number,
  note?: string,
  summary?: KpiSummaryInput
): Promise<KpiAssignment | null> {
  return withTransaction(async (client) => {
    const { rows: aRows } = await client.query(
      `SELECT * FROM kpi_assignments WHERE id = $1 AND company_id = $2 AND senior_id = $3`,
      [assignmentId, companyId, seniorId]
    );
    if (!aRows[0]) return null;
    await assertCycleOpen(aRows[0].cycle_id, companyId);

    await applySummary(client, assignmentId, summary, kpiGrade(finalScore));
    const { rows } = await client.query(
      `UPDATE kpi_assignments SET status = 'concluded', final_score = $1, concluded_at = NOW(), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [finalScore, assignmentId]
    );
    await client.query(
      `INSERT INTO kpi_reviews (id, assignment_id, tier, reviewer_id, score, note)
       VALUES ($1, $2, 'senior', $3, $4, $5)`,
      ['kpr_' + crypto.randomBytes(8).toString('hex'), assignmentId, seniorId, finalScore, note ?? null]
    );
    return rows[0];
  }).then(async (assignment) => {
    if (!assignment) return assignment;
    const { cycleName } = await notifyVars(assignment.cycle_id, assignment.employee_id);
    void notify('kpi.concluded', { cycleName, finalScore }, { recipients: [assignment.employee_id], relatedId: assignment.id }).catch(() => {});
    return assignment;
  });
}

/**
 * Điểm THAM KHẢO cho phiếu kỳ tổng hợp (quý/6 tháng/năm) — trung bình các phiếu cá nhân
 * ĐÃ CHỐT của cùng nhân viên trong các kỳ THÁNG được liên kết (kpi_cycle_rollups). Không tự
 * động cộng vào điểm chính thức — chỉ hiển thị cho người tự nhận xét/chấm/chốt tham khảo.
 */
export async function getRollupReference(
  companyId: string,
  employeeId: string,
  parentCycleId: string
): Promise<{ avg: number | null; count: number; breakdown: { cycle_name: string; final_score: number; weight: number }[] }> {
  const children = await query<{ child_cycle_id: string; weight: number | null }>(
    `SELECT child_cycle_id, weight FROM kpi_cycle_rollups WHERE parent_cycle_id = $1`,
    [parentCycleId]
  );
  if (!children.length) return { avg: null, count: 0, breakdown: [] };
  const weightById = new Map(children.map((c) => [c.child_cycle_id, c.weight]));
  const childIds = children.map((c) => c.child_cycle_id);

  const rows = await query<{ cycle_id: string; cycle_name: string; final_score: number }>(
    `SELECT a.cycle_id, c.name AS cycle_name, a.final_score
       FROM kpi_assignments a JOIN kpi_cycles c ON c.id = a.cycle_id
      WHERE a.company_id = $1 AND a.employee_id = $2 AND a.cycle_id = ANY($3::text[])
        AND a.status = 'concluded' AND a.final_score IS NOT NULL
      ORDER BY c.start_date`,
    [companyId, employeeId, childIds]
  );
  return computeWeightedRollup(rows, weightById);
}

/**
 * Trung bình CÓ trọng số của các kỳ tháng đã chốt. Chuẩn hoá trọng số theo đúng các kỳ hiện có
 * (kỳ chưa chốt bị loại → trọng số phần còn lại tự co giãn về tổng 100%). Nếu MỌI kỳ đều chưa đặt
 * trọng số (NULL) ⇒ về đúng trung bình cộng cũ.
 */
function computeWeightedRollup(
  rows: { cycle_id: string; cycle_name: string; final_score: number }[],
  weightById: Map<string, number | null>
): { avg: number | null; count: number; breakdown: { cycle_name: string; final_score: number; weight: number }[] } {
  if (!rows.length) return { avg: null, count: 0, breakdown: [] };
  const anyWeighted = rows.some((r) => {
    const w = weightById.get(r.cycle_id);
    return w !== null && w !== undefined && Number(w) > 0;
  });
  // Trọng số hiệu dụng: đã đặt thì dùng, chưa đặt (NULL) coi = 1 (chia đều) khi không có kỳ nào đặt.
  const effWeight = (id: string): number => {
    const w = weightById.get(id);
    if (anyWeighted) return w === null || w === undefined ? 0 : Number(w);
    return 1; // không kỳ nào đặt trọng số → chia đều
  };
  const totalW = rows.reduce((s, r) => s + effWeight(r.cycle_id), 0);
  const breakdown = rows.map((r) => ({
    cycle_name: r.cycle_name,
    final_score: Number(r.final_score),
    weight: totalW > 0 ? Math.round((effWeight(r.cycle_id) / totalW) * 1000) / 10 : 0,
  }));
  const avg = totalW > 0
    ? rows.reduce((s, r) => s + Number(r.final_score) * effWeight(r.cycle_id), 0) / totalW
    : null;
  return { avg: avg === null ? null : Math.round(avg * 100) / 100, count: rows.length, breakdown };
}
export { computeWeightedRollup };

export async function getReviewHistory(assignmentId: string, companyId: string) {
  const owns = await queryOne(`SELECT 1 FROM kpi_assignments WHERE id = $1 AND company_id = $2`, [assignmentId, companyId]);
  if (!owns) return [];
  return query(
    `SELECT r.*, u.name AS reviewer_name FROM kpi_reviews r
       LEFT JOIN users u ON u.id::text = r.reviewer_id
      WHERE r.assignment_id = $1 ORDER BY r.created_at`,
    [assignmentId]
  );
}
