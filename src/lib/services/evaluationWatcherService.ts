import { query, queryOne } from '@/lib/db';
import { notify } from '@/lib/notifications/engine';
import { getModulePermissionHoldersByCompany } from '@/lib/services/notificationsService';

export interface EvaluationWatcher {
  id: string;
  evaluation_id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  added_by: string | null;
  created_at: string;
}

interface WatcherRow extends EvaluationWatcher {
  telegram_chat_id: string | null;
  telegram_enabled: boolean | null;
}

export async function listWatchers(evaluationId: string): Promise<EvaluationWatcher[]> {
  return query<EvaluationWatcher>(
    `SELECT ew.*, u.name AS user_name, u.email AS user_email
       FROM evaluation_watchers ew
       LEFT JOIN users u ON u.id::text = ew.user_id::text
      WHERE ew.evaluation_id = $1
      ORDER BY ew.created_at ASC`,
    [evaluationId]
  );
}

export async function addWatcher(
  evaluationId: string,
  userId: string,
  addedBy: string
): Promise<EvaluationWatcher | null> {
  const id = `evw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await queryOne(
    `INSERT INTO evaluation_watchers (id, evaluation_id, user_id, added_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (evaluation_id, user_id) DO NOTHING`,
    [id, evaluationId, userId, addedBy]
  );
  const row = await queryOne<EvaluationWatcher>(
    `SELECT ew.*, u.name AS user_name, u.email AS user_email
       FROM evaluation_watchers ew
       LEFT JOIN users u ON u.id::text = ew.user_id::text
      WHERE ew.evaluation_id = $1 AND ew.user_id = $2`,
    [evaluationId, userId]
  );
  return row;
}

export async function removeWatcher(evaluationId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `DELETE FROM evaluation_watchers WHERE evaluation_id = $1 AND user_id = $2 RETURNING id`,
    [evaluationId, userId]
  );
  return !!row;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Nháp',
  pending_signing: 'Chờ đánh giá',
  evaluated: 'Đã đánh giá',
  passed: 'Đạt — Chính thức',
  failed: 'Không đạt',
};

/** Thông báo watchers khi trạng thái thay đổi. */
export async function notifyWatchersStatusChange(
  evaluationId: string,
  employeeName: string | null,
  oldStatus: string,
  newStatus: string
): Promise<void> {
  const watchers = await query<WatcherRow>(
    `SELECT ew.user_id, u.name AS user_name, u.telegram_chat_id, u.telegram_enabled
       FROM evaluation_watchers ew
       LEFT JOIN users u ON u.id::text = ew.user_id::text
      WHERE ew.evaluation_id = $1`,
    [evaluationId]
  );
  if (!watchers.length) return;

  const msg = `Đánh giá của ${employeeName || 'nhân viên'} vừa đổi trạng thái: "${STATUS_LABEL[oldStatus] || oldStatus}" → "${STATUS_LABEL[newStatus] || newStatus}".`;
  await notify('evaluation.statusChange', { message: msg }, {
    recipients: watchers.map(w => w.user_id), relatedId: evaluationId,
  });
}

/** Thông báo nhân viên rằng thẻ đánh giá đã được tạo cho họ. */
export async function notifyEmployeeEvaluationCreated(
  evaluationId: string,
  employeeId: string,
  employmentTypeName: string | null
): Promise<void> {
  const typeName = employmentTypeName ?? 'thử việc';
  const msg = `Thẻ đánh giá ${typeName} của bạn đã được tạo. Quản lý sẽ liên hệ để tiến hành đánh giá.`;
  await notify('evaluation.cardCreated', { typeName, message: msg }, { recipients: [employeeId], relatedId: evaluationId });
}

/**
 * Thông báo C&B khi đánh giá kết luận cần xử lý tiếp.
 * kind='pass'      → HĐ chính thức (nhân viên đạt)
 * kind='terminate' → Quy trình Offboarding (nhân viên không đạt, chấm dứt)
 *   linkedId: contractId khi pass, offboardingProcessId khi terminate
 */
export async function notifyCBPassResult(
  evaluationId: string,
  employeeName: string | null,
  linkedId: string | null,
  kind: 'pass' | 'terminate' = 'pass',
  employeeId?: string | null
): Promise<void> {
  // Scope C&B theo công ty của nhân viên được đánh giá — admin/HR công ty khác không nhận.
  const employee = employeeId
    ? await queryOne<{ company_id: string | null }>(
        `SELECT company_id::text AS company_id FROM users WHERE id::text = $1`, [employeeId],
      ).catch(() => null)
    : null;
  const cbIds = await getModulePermissionHoldersByCompany('hr', ['edit'], employee?.company_id ?? null);

  const msg =
    kind === 'pass'
      ? `${employeeName ?? 'Nhân viên'} đã đạt đánh giá thử việc. Hệ thống đã tạo hợp đồng chính thức ở trạng thái nháp. Vui lòng điền đầy đủ thông tin và gửi ký.`
      : `${employeeName ?? 'Nhân viên'} không đạt đánh giá thử việc. Hệ thống đã khởi tạo quy trình Offboarding. Vui lòng vào Nguồn Nhân Lực → Nghỉ Việc để xử lý.`;

  await notify(
    kind === 'pass' ? 'evaluation.concludedPass' : 'evaluation.concludedTerminate',
    { message: msg, contractId: kind === 'pass' ? (linkedId ?? '') : '', offboardingProcessId: kind === 'terminate' ? (linkedId ?? '') : '', evaluationId },
    { recipients: cbIds, relatedId: evaluationId }
  );
}
