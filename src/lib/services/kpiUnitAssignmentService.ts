/**
 * KPI & Đánh Giá — phiếu đánh giá theo ĐƠN VỊ (phòng ban/bộ phận), song song với phiếu cá
 * nhân. Tự nhận xét = trưởng đơn vị; chuỗi duyệt LINH HOẠT N cấp (Admin tự dựng khi tạo
 * phiếu) — khác phiếu cá nhân vốn cố định 3 tầng self→manager→senior.
 *
 * ⚠️ CÁCH LY CÔNG TY: mọi hàm đọc/ghi đều lọc company_id.
 */
import crypto from 'crypto';
import { query, queryOne, withTransaction } from '@/lib/db';
import { getTemplateWithItems, KpiTargetType } from './kpiTemplateService';
import { computeWeightedRollup } from './kpiAssignmentService';
import { assertCycleOpen } from './kpiCycleService';
import { notify } from '@/lib/notifications/engine';

/** Tên kỳ + tên đơn vị cho biến thông báo — không chặn luồng chính nếu lỗi. */
async function notifyVars(cycleId: string, unitType: KpiUnitType, unitId: string): Promise<{ cycleName: string; unitName: string }> {
  const table = unitType === 'department' ? 'departments' : 'sub_departments';
  const [cycle, unit] = await Promise.all([
    queryOne<{ name: string }>(`SELECT name FROM kpi_cycles WHERE id = $1`, [cycleId]),
    queryOne<{ name: string }>(`SELECT name FROM ${table} WHERE id = $1`, [unitId]),
  ]);
  return { cycleName: cycle?.name || '', unitName: unit?.name || '' };
}

export type KpiUnitType = 'department' | 'sub_department';
export type KpiUnitAssignmentStatus = 'draft' | 'in_approval' | 'concluded';

export interface KpiUnitAssignment {
  id: string;
  cycle_id: string;
  company_id: string;
  unit_type: KpiUnitType;
  unit_id: string;
  template_id: string | null;
  self_reviewer_id: string;
  status: KpiUnitAssignmentStatus;
  self_score: number | null;
  final_score: number | null;
  current_tier: number;
}

export interface KpiUnitApprover {
  id: string;
  unit_assignment_id: string;
  tier_order: number;
  approver_id: string;
  status: 'pending' | 'reviewed';
  score: number | null;
  note: string | null;
}

export interface KpiUnitAssignmentItem {
  id: string;
  unit_assignment_id: string;
  name: string;
  description: string | null;
  weight: number;
  target_type: KpiTargetType;
  target_value: string | null;
  unit: string | null;
  self_actual: string | null;
  self_note: string | null;
  self_score: number | null;
  review_actual: string | null;
  review_note: string | null;
  review_score: number | null;
}

/** Trưởng đơn vị — ưu tiên org_assignments (nguồn sự thật mới), fallback cột manager_id cũ. */
export async function resolveUnitHead(companyId: string, unitType: KpiUnitType, unitId: string): Promise<string | null> {
  const col = unitType === 'department' ? 'department_id' : 'sub_department_id';
  const viaAssignment = await queryOne<{ user_id: string }>(
    `SELECT user_id::text AS user_id FROM org_assignments
      WHERE company_id = $1 AND ${col} = $2 AND org_role = 'head' AND is_active = true
      ORDER BY is_primary DESC LIMIT 1`,
    [companyId, unitId]
  );
  if (viaAssignment) return viaAssignment.user_id;

  const table = unitType === 'department' ? 'departments' : 'sub_departments';
  const viaLegacy = await queryOne<{ manager_id: string | null }>(
    `SELECT manager_id::text AS manager_id FROM ${table} WHERE id = $1`,
    [unitId]
  );
  return viaLegacy?.manager_id ?? null;
}

/** Danh sách user_id thuộc đơn vị (để tính điểm KPI cá nhân trung bình tham khảo). */
export async function getUnitMemberIds(companyId: string, unitType: KpiUnitType, unitId: string): Promise<string[]> {
  const col = unitType === 'department' ? 'department_id' : 'sub_department_id';
  const rows = await query<{ user_id: string }>(
    `SELECT DISTINCT user_id::text AS user_id FROM org_assignments
      WHERE company_id = $1 AND ${col} = $2 AND is_active = true`,
    [companyId, unitId]
  );
  return rows.map((r) => r.user_id);
}

/** Điểm KPI cá nhân trung bình của thành viên đơn vị trong CÙNG kỳ — tham khảo, không tự cộng vào điểm đơn vị. */
export async function getTeamAvgIndividualScore(companyId: string, unitType: KpiUnitType, unitId: string, cycleId: string): Promise<{ avg: number | null; count: number }> {
  const memberIds = await getUnitMemberIds(companyId, unitType, unitId);
  if (!memberIds.length) return { avg: null, count: 0 };
  const rows = await query<{ final_score: number }>(
    `SELECT final_score FROM kpi_assignments
      WHERE company_id = $1 AND cycle_id = $2 AND status = 'concluded' AND final_score IS NOT NULL
        AND employee_id = ANY($3::text[])`,
    [companyId, cycleId, memberIds]
  );
  if (!rows.length) return { avg: null, count: 0 };
  const avg = rows.reduce((s, r) => s + Number(r.final_score), 0) / rows.length;
  return { avg: Math.round(avg * 100) / 100, count: rows.length };
}

export async function createUnitAssignment(
  companyId: string,
  data: {
    cycle_id: string;
    unit_type: KpiUnitType;
    unit_id: string;
    template_id?: string | null;
    self_reviewer_id?: string | null;
    approver_ids: string[]; // thứ tự duyệt, tối thiểu 1 người
  }
): Promise<KpiUnitAssignment> {
  if (!data.approver_ids.length) throw new Error('Cần ít nhất 1 người duyệt');
  await assertCycleOpen(data.cycle_id, companyId);

  const selfReviewerId = data.self_reviewer_id || (await resolveUnitHead(companyId, data.unit_type, data.unit_id));
  if (!selfReviewerId) throw new Error('Không xác định được trưởng đơn vị — chọn người tự nhận xét thủ công');

  return withTransaction(async (client) => {
    const id = 'kua_' + crypto.randomBytes(8).toString('hex');
    const { rows } = await client.query(
      `INSERT INTO kpi_unit_assignments (id, cycle_id, company_id, unit_type, unit_id, template_id, self_reviewer_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, data.cycle_id, companyId, data.unit_type, data.unit_id, data.template_id ?? null, selfReviewerId]
    );

    let order = 0;
    for (const approverId of data.approver_ids) {
      order++;
      await client.query(
        `INSERT INTO kpi_unit_approvers (id, unit_assignment_id, tier_order, approver_id)
         VALUES ($1, $2, $3, $4)`,
        ['kap_' + crypto.randomBytes(8).toString('hex'), id, order, approverId]
      );
    }

    if (data.template_id) {
      const tpl = await getTemplateWithItems(data.template_id, companyId);
      let itemOrder = 0;
      for (const item of tpl?.items || []) {
        await client.query(
          `INSERT INTO kpi_unit_assignment_items (id, unit_assignment_id, name, description, weight, target_type, target_value, unit, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          ['kui_' + crypto.randomBytes(8).toString('hex'), id, item.name, item.description ?? null, item.weight, item.target_type, item.target_value ?? null, item.unit ?? null, itemOrder++]
        );
      }
    }
    return rows[0];
  }).then(async (assignment) => {
    const { cycleName, unitName } = await notifyVars(assignment.cycle_id, assignment.unit_type, assignment.unit_id);
    void notify('kpi.unit_self_pending', { cycleName, unitName }, { recipients: [assignment.self_reviewer_id], relatedId: assignment.id }).catch(() => {});
    return assignment;
  });
}

export async function getUnitAssignmentWithDetail(id: string, companyId: string) {
  const a = await queryOne<KpiUnitAssignment>(
    `SELECT * FROM kpi_unit_assignments WHERE id = $1 AND company_id = $2`,
    [id, companyId]
  );
  if (!a) return null;
  const [items, approvers] = await Promise.all([
    query<KpiUnitAssignmentItem>(`SELECT * FROM kpi_unit_assignment_items WHERE unit_assignment_id = $1 ORDER BY sort_order`, [id]),
    query<KpiUnitApprover & { approver_name: string }>(
      `SELECT ap.*, u.name AS approver_name FROM kpi_unit_approvers ap LEFT JOIN users u ON u.id::text = ap.approver_id
        WHERE ap.unit_assignment_id = $1 ORDER BY ap.tier_order`,
      [id]
    ),
  ]);
  return { ...a, items, approvers };
}

/** Phiếu đơn vị mà tôi là trưởng đơn vị (tự nhận xét). */
export async function listUnitAssignmentsAsSelfReviewer(companyId: string, userId: string) {
  return query(
    `SELECT a.*, c.name AS cycle_name,
            CASE a.unit_type WHEN 'department' THEN d.name ELSE sd.name END AS unit_name
       FROM kpi_unit_assignments a
       JOIN kpi_cycles c ON c.id = a.cycle_id
       LEFT JOIN departments d ON a.unit_type = 'department' AND d.id = a.unit_id
       LEFT JOIN sub_departments sd ON a.unit_type = 'sub_department' AND sd.id = a.unit_id
      WHERE a.company_id = $1 AND a.self_reviewer_id = $2
      ORDER BY c.start_date DESC`,
    [companyId, userId]
  );
}

/** Phiếu đơn vị đang chờ TÔI duyệt (đúng tầng hiện tại). */
export async function listUnitAssignmentsForApprover(companyId: string, userId: string) {
  return query(
    `SELECT a.*, c.name AS cycle_name,
            CASE a.unit_type WHEN 'department' THEN d.name ELSE sd.name END AS unit_name
       FROM kpi_unit_assignments a
       JOIN kpi_cycles c ON c.id = a.cycle_id
       JOIN kpi_unit_approvers ap ON ap.unit_assignment_id = a.id AND ap.tier_order = a.current_tier AND ap.approver_id = $2 AND ap.status = 'pending'
       LEFT JOIN departments d ON a.unit_type = 'department' AND d.id = a.unit_id
       LEFT JOIN sub_departments sd ON a.unit_type = 'sub_department' AND sd.id = a.unit_id
      WHERE a.company_id = $1 AND a.status = 'in_approval'
      ORDER BY c.start_date DESC`,
    [companyId, userId]
  );
}

export async function listUnitAssignmentsForCompany(companyId: string) {
  return query(
    `SELECT a.*, c.name AS cycle_name, u.name AS self_reviewer_name,
            CASE a.unit_type WHEN 'department' THEN d.name ELSE sd.name END AS unit_name
       FROM kpi_unit_assignments a
       JOIN kpi_cycles c ON c.id = a.cycle_id
       JOIN users u ON u.id::text = a.self_reviewer_id
       LEFT JOIN departments d ON a.unit_type = 'department' AND d.id = a.unit_id
       LEFT JOIN sub_departments sd ON a.unit_type = 'sub_department' AND sd.id = a.unit_id
      WHERE a.company_id = $1
      ORDER BY c.start_date DESC`,
    [companyId]
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

/** Trưởng đơn vị nộp tự nhận xét — chuyển sang tầng duyệt đầu tiên. */
export async function submitUnitSelfReview(
  id: string,
  companyId: string,
  userId: string,
  items: { id: string; actual?: string | null; note?: string | null; score?: number | null }[]
): Promise<KpiUnitAssignment | null> {
  return withTransaction(async (client) => {
    const { rows: aRows } = await client.query(
      `SELECT * FROM kpi_unit_assignments WHERE id = $1 AND company_id = $2 AND self_reviewer_id = $3 AND status = 'draft'`,
      [id, companyId, userId]
    );
    if (!aRows[0]) return null;

    for (const it of items) {
      await client.query(
        `UPDATE kpi_unit_assignment_items SET self_actual = $1, self_note = $2, self_score = $3
         WHERE id = $4 AND unit_assignment_id = $5`,
        [it.actual ?? null, it.note ?? null, it.score ?? null, it.id, id]
      );
    }
    const { rows: itemRows } = await client.query(`SELECT weight, self_score AS score FROM kpi_unit_assignment_items WHERE unit_assignment_id = $1`, [id]);
    const selfScore = weightedScore(itemRows);

    const { rows: approverRows } = await client.query(`SELECT COUNT(*) AS n FROM kpi_unit_approvers WHERE unit_assignment_id = $1`, [id]);
    const hasApprovers = Number(approverRows[0]?.n || 0) > 0;

    const { rows } = await client.query(
      `UPDATE kpi_unit_assignments SET status = 'in_approval', self_score = $1, current_tier = $2, submitted_self_at = NOW(), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [selfScore, hasApprovers ? 1 : 0, id]
    );
    await client.query(
      `INSERT INTO kpi_unit_reviews (id, unit_assignment_id, tier_order, reviewer_id, score, note) VALUES ($1, $2, 0, $3, $4, NULL)`,
      ['kur_' + crypto.randomBytes(8).toString('hex'), id, userId, selfScore]
    );
    return rows[0];
  }).then(async (assignment) => {
    if (!assignment || assignment.current_tier < 1) return assignment;
    const ap = await queryOne<{ approver_id: string }>(
      `SELECT approver_id FROM kpi_unit_approvers WHERE unit_assignment_id = $1 AND tier_order = $2`,
      [assignment.id, assignment.current_tier]
    );
    if (ap) {
      const { cycleName, unitName } = await notifyVars(assignment.cycle_id, assignment.unit_type, assignment.unit_id);
      void notify('kpi.unit_approve_pending', { cycleName, unitName, tier: assignment.current_tier }, { recipients: [ap.approver_id], relatedId: assignment.id }).catch(() => {});
    }
    return assignment;
  });
}

/** 1 tầng duyệt xử lý phiếu — nếu là tầng cuối thì chốt điểm chính thức luôn. */
export async function approveUnitTier(
  id: string,
  companyId: string,
  userId: string,
  items: { id: string; actual?: string | null; note?: string | null; score?: number | null }[],
  note?: string
): Promise<KpiUnitAssignment | null> {
  return withTransaction(async (client) => {
    const { rows: aRows } = await client.query(
      `SELECT * FROM kpi_unit_assignments WHERE id = $1 AND company_id = $2 AND status = 'in_approval'`,
      [id, companyId]
    );
    const assignment = aRows[0];
    if (!assignment) return null;

    const { rows: apRows } = await client.query(
      `SELECT * FROM kpi_unit_approvers WHERE unit_assignment_id = $1 AND tier_order = $2 AND approver_id = $3 AND status = 'pending'`,
      [id, assignment.current_tier, userId]
    );
    if (!apRows[0]) return null;

    for (const it of items) {
      await client.query(
        `UPDATE kpi_unit_assignment_items SET review_actual = $1, review_note = $2, review_score = $3
         WHERE id = $4 AND unit_assignment_id = $5`,
        [it.actual ?? null, it.note ?? null, it.score ?? null, it.id, id]
      );
    }
    const { rows: itemRows } = await client.query(`SELECT weight, review_score AS score FROM kpi_unit_assignment_items WHERE unit_assignment_id = $1`, [id]);
    const tierScore = weightedScore(itemRows);

    await client.query(
      `UPDATE kpi_unit_approvers SET status = 'reviewed', score = $1, note = $2, reviewed_at = NOW() WHERE id = $3`,
      [tierScore, note ?? null, apRows[0].id]
    );
    await client.query(
      `INSERT INTO kpi_unit_reviews (id, unit_assignment_id, tier_order, reviewer_id, score, note) VALUES ($1, $2, $3, $4, $5, $6)`,
      ['kur_' + crypto.randomBytes(8).toString('hex'), id, assignment.current_tier, userId, tierScore, note ?? null]
    );

    const { rows: maxRows } = await client.query(`SELECT MAX(tier_order) AS max_tier FROM kpi_unit_approvers WHERE unit_assignment_id = $1`, [id]);
    const isLastTier = assignment.current_tier >= Number(maxRows[0]?.max_tier || 0);

    const { rows } = await client.query(
      `UPDATE kpi_unit_assignments SET
         status = CASE WHEN $1 THEN 'concluded' ELSE 'in_approval' END,
         current_tier = CASE WHEN $1 THEN current_tier ELSE current_tier + 1 END,
         final_score = CASE WHEN $1 THEN $2 ELSE final_score END,
         concluded_at = CASE WHEN $1 THEN NOW() ELSE concluded_at END,
         updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [isLastTier, tierScore, id]
    );
    return rows[0];
  }).then(async (assignment) => {
    if (!assignment) return assignment;
    const { cycleName, unitName } = await notifyVars(assignment.cycle_id, assignment.unit_type, assignment.unit_id);
    if (assignment.status === 'concluded') {
      void notify('kpi.unit_concluded', { cycleName, unitName, finalScore: assignment.final_score ?? '' }, { recipients: [assignment.self_reviewer_id], relatedId: assignment.id }).catch(() => {});
    } else {
      const ap = await queryOne<{ approver_id: string }>(
        `SELECT approver_id FROM kpi_unit_approvers WHERE unit_assignment_id = $1 AND tier_order = $2`,
        [assignment.id, assignment.current_tier]
      );
      if (ap) {
        void notify('kpi.unit_approve_pending', { cycleName, unitName, tier: assignment.current_tier }, { recipients: [ap.approver_id], relatedId: assignment.id }).catch(() => {});
      }
    }
    return assignment;
  });
}

/**
 * Điểm THAM KHẢO cho phiếu đơn vị ở kỳ tổng hợp (quý/6 tháng/năm) — trung bình các phiếu
 * đơn vị ĐÃ CHỐT của cùng đơn vị trong các kỳ THÁNG được liên kết (kpi_cycle_rollups).
 */
export async function getUnitRollupReference(
  companyId: string,
  unitType: KpiUnitType,
  unitId: string,
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
       FROM kpi_unit_assignments a JOIN kpi_cycles c ON c.id = a.cycle_id
      WHERE a.company_id = $1 AND a.unit_type = $2 AND a.unit_id = $3 AND a.cycle_id = ANY($4::text[])
        AND a.status = 'concluded' AND a.final_score IS NOT NULL
      ORDER BY c.start_date`,
    [companyId, unitType, unitId, childIds]
  );
  return computeWeightedRollup(rows, weightById);
}

export async function getUnitReviewHistory(id: string, companyId: string) {
  const owns = await queryOne(`SELECT 1 FROM kpi_unit_assignments WHERE id = $1 AND company_id = $2`, [id, companyId]);
  if (!owns) return [];
  return query(
    `SELECT r.*, u.name AS reviewer_name FROM kpi_unit_reviews r
       LEFT JOIN users u ON u.id::text = r.reviewer_id
      WHERE r.unit_assignment_id = $1 ORDER BY r.created_at`,
    [id]
  );
}
