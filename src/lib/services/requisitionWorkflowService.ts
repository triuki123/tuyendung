import crypto from 'crypto';
import { execute, query, queryOne } from '@/lib/db';
import { logRequisition } from '@/lib/services/requisitionAuditService';

export type WorkflowMilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'skipped';

export interface RequisitionWorkflowMilestone {
  id: string;
  requisition_id: string;
  step_code: string;
  title: string;
  description: string | null;
  owner_label: string | null;
  sla_hours: number | null;
  status: WorkflowMilestoneStatus;
  due_at: string | null;
  completed_at: string | null;
  note: string | null;
  completed_by: string | null;
}

const STEPS = [
  ['verify_request', 'Kiểm tra yêu cầu', 'Đối chiếu JD, định biên, số lượng và thông tin phỏng vấn.', 'Tuyển dụng', 24],
  ['assign_recruiter', 'Phân công chuyên viên', 'Phân công người phụ trách tuyển dụng và kênh tìm nguồn.', 'Trưởng nhóm tuyển dụng', 24],
  ['cv_review', 'Sàng lọc và duyệt CV', 'Sơ tuyển, gọi điện và gửi CV đạt yêu cầu cho đơn vị duyệt.', 'Tuyển dụng / Đơn vị', 48],
  ['interview_plan', 'Chốt lịch phỏng vấn', 'Nhận lịch rảnh trong tối đa 2 ngày và sắp lịch ứng viên trong 24 giờ.', 'Đơn vị / Tuyển dụng', 72],
  ['interview_decision', 'Đánh giá sau phỏng vấn', 'Cập nhật kết quả phỏng vấn và thống nhất mức offer.', 'Hội đồng phỏng vấn', 72],
  ['reference_offer', 'Thẩm tra và gửi offer', 'Reference check, xác nhận offer và cập nhật trạng thái tuyển dụng.', 'Tuyển dụng / HRM', 24],
  ['onboarding_handover', 'Bàn giao onboarding', 'Bàn giao thông tin nhân sự, email, hợp đồng và yêu cầu thiết bị.', 'Tuyển dụng / Hành chính', 72],
] as const;

function addBusinessHours(start: Date, hours: number): Date {
  const result = new Date(start);
  let remaining = hours;
  while (remaining > 0) {
    result.setHours(result.getHours() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result;
}

export async function ensureRequisitionWorkflow(requisitionId: string): Promise<void> {
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM requisition_workflow_milestones WHERE requisition_id = $1 LIMIT 1', [requisitionId],
  );
  if (existing) return;

  const now = new Date();
  for (let index = 0; index < STEPS.length; index += 1) {
    const [stepCode, title, description, ownerLabel, slaHours] = STEPS[index];
    const isFirst = index === 0;
    await execute(
      `INSERT INTO requisition_workflow_milestones
       (id, requisition_id, step_code, title, description, owner_label, sla_hours, status, due_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (requisition_id, step_code) DO NOTHING`,
      [
        `rwm_${crypto.randomBytes(10).toString('hex')}`, requisitionId, stepCode, title, description,
        ownerLabel, slaHours, isFirst ? 'in_progress' : 'pending', isFirst ? addBusinessHours(now, slaHours).toISOString() : null,
      ],
    );
  }
}

export async function listRequisitionWorkflow(requisitionId: string): Promise<RequisitionWorkflowMilestone[]> {
  await ensureRequisitionWorkflow(requisitionId);
  return query<RequisitionWorkflowMilestone>(
    `SELECT id, requisition_id, step_code, title, description, owner_label, sla_hours, status,
            due_at, completed_at, note, completed_by
       FROM requisition_workflow_milestones WHERE requisition_id = $1
       ORDER BY created_at ASC`, [requisitionId],
  );
}

export async function updateRequisitionWorkflowMilestone(
  requisitionId: string, milestoneId: string, input: { status: WorkflowMilestoneStatus; note?: string }, performedBy: string | null,
): Promise<RequisitionWorkflowMilestone | null> {
  const milestone = await queryOne<RequisitionWorkflowMilestone>(
    'SELECT * FROM requisition_workflow_milestones WHERE id = $1 AND requisition_id = $2', [milestoneId, requisitionId],
  );
  if (!milestone) return null;
  if (!['pending', 'in_progress', 'completed', 'blocked', 'skipped'].includes(input.status)) {
    throw new Error('Trạng thái mốc không hợp lệ');
  }
  if (milestone.status === 'pending' && input.status === 'completed') {
    throw new Error('Cần bắt đầu mốc trước khi hoàn tất');
  }
  const completedAt = input.status === 'completed' || input.status === 'skipped' ? new Date().toISOString() : null;
  const updated = await queryOne<RequisitionWorkflowMilestone>(
    `UPDATE requisition_workflow_milestones
        SET status = $1, note = $2, completed_at = $3, completed_by = $4, updated_at = NOW()
      WHERE id = $5 AND requisition_id = $6 RETURNING *`,
    [input.status, input.note?.trim() || null, completedAt, completedAt ? performedBy : null, milestoneId, requisitionId],
  );
  if (updated && (input.status === 'completed' || input.status === 'skipped')) {
    const next = await queryOne<RequisitionWorkflowMilestone>(
      `SELECT * FROM requisition_workflow_milestones
        WHERE requisition_id = $1 AND status = 'pending' ORDER BY created_at ASC LIMIT 1`, [requisitionId],
    );
    if (next) {
      const dueAt = addBusinessHours(new Date(), next.sla_hours || 24).toISOString();
      await execute(
        `UPDATE requisition_workflow_milestones SET status = 'in_progress', due_at = $1, updated_at = NOW() WHERE id = $2`,
        [dueAt, next.id],
      );
    }
  }
  if (updated) {
    await logRequisition({
      requisitionId, action: 'workflow_update', performedBy,
      details: `Quy trình: ${updated.title} → ${input.status === 'completed' ? 'Hoàn tất' : input.status === 'blocked' ? 'Đang chặn' : input.status === 'skipped' ? 'Bỏ qua' : 'Đang xử lý'}.`,
    });
  }
  return updated;
}
