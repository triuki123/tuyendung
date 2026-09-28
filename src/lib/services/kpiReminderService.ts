/**
 * KPI & Đánh Giá — nhắc hạn khi kỳ sắp kết thúc mà phiếu (cá nhân/đơn vị) vẫn còn ở tầng
 * đang chờ ai đó xử lý. Mốc nhắc: 3 ngày và 1 ngày trước kpi_cycles.end_date.
 * Chống trùng qua kpi_reminder_log (mỗi mốc/1 phiếu chỉ gửi đúng 1 lần).
 */
import crypto from 'crypto';
import { query, execute } from '@/lib/db';
import { notify } from '@/lib/notifications/engine';

const MILESTONE_DAYS = [3, 1];

function vnToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function daysUntil(today: string, endDate: string): number {
  const a = new Date(today + 'T00:00:00+07:00').getTime();
  const b = new Date(endDate + 'T00:00:00+07:00').getTime();
  return Math.round((b - a) / 86_400_000);
}

/** true = mới ghi log (chưa nhắc mốc này); false = đã nhắc rồi, bỏ qua. */
async function tryLog(entityType: string, entityId: string, milestoneDays: number, today: string): Promise<boolean> {
  const n = await execute(
    `INSERT INTO kpi_reminder_log (id, entity_type, entity_id, milestone_days, sent_date)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (entity_type, entity_id, milestone_days) DO NOTHING`,
    ['krl_' + crypto.randomBytes(8).toString('hex'), entityType, entityId, milestoneDays, today]
  );
  return n > 0;
}

/** Nhắc phiếu KPI cá nhân đang ở tầng chờ xử lý (draft/manager_review/senior_review). */
async function remindIndividualAssignments(today: string): Promise<number> {
  const rows = await query<{
    id: string; status: string; employee_id: string; manager_id: string | null; senior_id: string | null;
    end_date: string; cycle_name: string; employee_name: string;
  }>(
    `SELECT a.id, a.status, a.employee_id, a.manager_id, a.senior_id, c.end_date::text AS end_date,
            c.name AS cycle_name, u.name AS employee_name
       FROM kpi_assignments a
       JOIN kpi_cycles c ON c.id = a.cycle_id
       JOIN users u ON u.id::text = a.employee_id
      WHERE a.status IN ('draft', 'manager_review', 'senior_review')`
  );

  let sent = 0;
  for (const a of rows) {
    const left = daysUntil(today, a.end_date);
    if (!MILESTONE_DAYS.includes(left)) continue;

    const recipient = a.status === 'draft' ? a.employee_id : a.status === 'manager_review' ? a.manager_id : a.senior_id;
    if (!recipient) continue;

    const roleLabel = a.status === 'draft' ? 'tự nhận xét' : a.status === 'manager_review' ? 'chấm điểm' : 'chốt điểm';
    if (!(await tryLog('assignment', a.id, left, today))) continue;

    await notify('kpi.deadline_reminder', { cycleName: a.cycle_name, daysLeft: left, roleLabel }, { recipients: [recipient], relatedId: a.id });
    sent++;
  }
  return sent;
}

/** Nhắc phiếu KPI đơn vị đang chờ tự nhận xét (trưởng đơn vị) hoặc chờ duyệt (tầng hiện tại). */
async function remindUnitAssignments(today: string): Promise<number> {
  const rows = await query<{
    id: string; status: string; self_reviewer_id: string; current_tier: number;
    end_date: string; cycle_name: string; unit_name: string;
  }>(
    `SELECT a.id, a.status, a.self_reviewer_id, a.current_tier, c.end_date::text AS end_date, c.name AS cycle_name,
            CASE a.unit_type WHEN 'department' THEN d.name ELSE sd.name END AS unit_name
       FROM kpi_unit_assignments a
       JOIN kpi_cycles c ON c.id = a.cycle_id
       LEFT JOIN departments d ON a.unit_type = 'department' AND d.id = a.unit_id
       LEFT JOIN sub_departments sd ON a.unit_type = 'sub_department' AND sd.id = a.unit_id
      WHERE a.status IN ('draft', 'in_approval')`
  );

  let sent = 0;
  for (const a of rows) {
    const left = daysUntil(today, a.end_date);
    if (!MILESTONE_DAYS.includes(left)) continue;

    let recipient: string | null = a.self_reviewer_id;
    let roleLabel = 'tự nhận xét';
    if (a.status === 'in_approval') {
      const ap = await query<{ approver_id: string }>(
        `SELECT approver_id FROM kpi_unit_approvers WHERE unit_assignment_id = $1 AND tier_order = $2`,
        [a.id, a.current_tier]
      );
      recipient = ap[0]?.approver_id ?? null;
      roleLabel = 'duyệt';
    }
    if (!recipient) continue;
    if (!(await tryLog('unit_assignment', a.id, left, today))) continue;

    await notify('kpi.unit_deadline_reminder', { cycleName: a.cycle_name, unitName: a.unit_name, daysLeft: left, roleLabel }, { recipients: [recipient], relatedId: a.id });
    sent++;
  }
  return sent;
}

export async function runKpiDeadlineReminders(): Promise<{ sent: number }> {
  const today = vnToday();
  const [a, b] = await Promise.all([remindIndividualAssignments(today), remindUnitAssignments(today)]);
  const sent = a + b;
  if (sent > 0) console.log(`[KpiReminder] Đã gửi ${sent} nhắc hạn (cá nhân=${a}, đơn vị=${b})`);
  return { sent };
}
