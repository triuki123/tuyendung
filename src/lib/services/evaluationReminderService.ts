/**
 * Nhắc đánh giá thử việc / học việc — chạy cùng scheduler 9h/15h VN.
 *
 * Hai nhiệm vụ:
 *  1. Auto-tạo thẻ đánh giá khi nhân viên còn 7 ngày hết thử việc
 *  2. Nhắc C&B/quản lý nếu thẻ sắp đến hạn mà chưa kết luận
 */
import { queryOne } from '@/lib/db';
import {
  createEvaluation,
  findUsersNeedingEvaluation,
  listPendingEvaluationsDue,
  autoArchiveConcludedEvaluations,
  type Evaluation,
} from './evaluationService';
import {
  notifyEmployeeEvaluationCreated,
  notifyWatchersStatusChange,
} from './evaluationWatcherService';
import { getReminderSetting, getHrAutomationConfig, resolveRecipients } from './systemSettingsService';
import { notify } from '@/lib/notifications/engine';

interface RecipientRow {
  id: string;
  name: string;
  telegram_chat_id: string | null;
  telegram_enabled: boolean | null;
}

/** Lấy danh sách C&B / quản lý nhận nhắc — theo quy tắc cấu hình (DEFAULT khớp cũ). */
async function getCBRecipients(): Promise<RecipientRow[]> {
  return resolveRecipients('evaluation');
}

/** Claim slot để chống gửi trùng trong cùng ngày. */
async function claimSlot(
  evaluationId: string,
  milestone: string,
  slot: 'am' | 'pm'
): Promise<boolean> {
  const id = `erl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const row = await queryOne<{ id: string }>(
    `INSERT INTO evaluation_reminder_log (id, evaluation_id, milestone, slot, sent_date)
     VALUES ($1,$2,$3,$4,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
     ON CONFLICT (evaluation_id, sent_date, slot) DO NOTHING RETURNING id`,
    [id, evaluationId, milestone, slot]
  );
  return !!row;
}

/** Milestone dựa trên số ngày còn lại đến hạn đánh giá. */
function decideMilestone(
  daysLeft: number,
  slot: 'am' | 'pm',
  milestones: number[]
): string | null {
  if (milestones.includes(daysLeft)) return slot === 'am' ? `d${daysLeft}` : null;
  if (daysLeft === 0) return `due`;      // gửi cả am + pm
  if (daysLeft < 0) return slot === 'am' ? 'overdue' : null;
  return null;
}

/**
 * Tự sinh thẻ đánh giá cho mọi nhân viên sắp/đã hết thử việc mà CHƯA có thẻ active
 * (kể cả trường hợp thẻ tự động bị xoá nhầm — chạy lại là sinh lại).
 * Dùng chung cho scheduler sáng và nút "Tự sinh bản nháp" trên UI.
 * @param createdBy id người bấm nút (null = scheduler → auto_generated)
 */
export async function autoCreateDueEvaluations(createdBy: string | null): Promise<{
  created: { id: string; employeeName: string }[];
}> {
  const recipients = await getCBRecipients();
  const { evaluationAutoCreateDaysBefore } = await getHrAutomationConfig();
  const usersNeedEval = await findUsersNeedingEvaluation(evaluationAutoCreateDaysBefore);
  const created: { id: string; employeeName: string }[] = [];

  for (const u of usersNeedEval) {
    try {
      const ev = await createEvaluation({
        employee_id: u.id,
        employment_type_id: u.employment_type_id,
        employment_type_name: u.employment_type_name,
        hire_date: u.hire_date,
        probation_end_date: u.probation_end_date,
        status: 'pending_signing',
        auto_generated: createdBy === null,
        created_by: createdBy,
      });

      // Notify nhân viên
      notifyEmployeeEvaluationCreated(ev.id, u.id, u.employment_type_name).catch(() => {});

      // Notify C&B (in-app + Telegram qua engine — nội dung sửa qua UI)
      await notify('evaluation.autoCreated', {
        typeName: u.employment_type_name || 'thử việc',
        employeeName: u.name || 'nhân viên',
        probationEndDate: u.probation_end_date || '',
      }, { recipients: recipients.map(r => r.id), relatedId: ev.id });

      created.push({ id: ev.id, employeeName: u.name || u.email });
      console.log(`[EvalScheduler] Auto-created evaluation ${ev.id} for user ${u.name}`);
    } catch (err) {
      console.error(`[EvalScheduler] Failed to create evaluation for user ${u.id}:`, err);
    }
  }
  return { created };
}

export async function runEvaluationTasks(slot: 'am' | 'pm'): Promise<{
  autoCreated: number;
  reminded: number;
  skipped: number;
}> {
  let autoCreated = 0;
  let reminded = 0;
  let skipped = 0;

  const recipients = await getCBRecipients();
  const { milestones } = await getReminderSetting('evaluation');
  const { evaluationAutoCreateDaysBefore, evaluationLookupDays, evaluationAutoArchiveDays } =
    await getHrAutomationConfig();
  const today = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 10);

  // ── 1. Auto-tạo thẻ đánh giá cho nhân viên sắp hết thử việc ──
  if (slot === 'am') {
    const { created } = await autoCreateDueEvaluations(null);
    autoCreated = created.length;

    // ── 1b. Tự LƯU TRỮ thẻ đã kết luận quá hạn cấu hình (0 = tắt). Idempotent, chạy 1 lần/ngày. ──
    if (evaluationAutoArchiveDays > 0) {
      const archived = await autoArchiveConcludedEvaluations(evaluationAutoArchiveDays);
      if (archived > 0) console.log(`[EvalScheduler] Auto-archived ${archived} thẻ đánh giá đã kết luận (>${evaluationAutoArchiveDays} ngày)`);
    }
  }

  // ── 2. Nhắc C&B/quản lý về các đánh giá sắp đến hạn ──
  const pending = await listPendingEvaluationsDue(evaluationLookupDays);
  for (const ev of pending) {
    if (!ev.probation_end_date) continue;

    const endDate = new Date(ev.probation_end_date);
    const todayDate = new Date(today);
    const daysLeft = Math.round((endDate.getTime() - todayDate.getTime()) / 86400000);

    const milestone = decideMilestone(daysLeft, slot, milestones);
    if (!milestone) continue;

    const claimed = await claimSlot(ev.id, milestone, slot);
    if (!claimed) { skipped++; continue; }

    const state = daysLeft > 0 ? 'before' : daysLeft === 0 ? 'today' : 'overdue';
    await notify('evaluation.due', {
      state,
      typeName: ev.employment_type_name || 'thử việc',
      employeeName: ev.employee_name || 'nhân viên',
      probationEndDate: ev.probation_end_date || '',
      daysLeft, daysOverdue: Math.abs(daysLeft),
    }, { recipients: recipients.map(r => r.id), relatedId: ev.id });
    reminded++;
  }

  return { autoCreated, reminded, skipped };
}
