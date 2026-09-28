/**
 * Tập trung mọi notification của module Task.
 *
 * Mục tiêu: mỗi sự kiện (tạo, đổi trạng thái, comment, subtask, thêm
 * đồng phụ trách) đều phải:
 *   - In-app: insert vào bảng notifications cho TẤT CẢ recipients
 *   - Telegram: gửi cho user có telegram_chat_id (tôn trọng telegram_enabled
 *     nếu cột tồn tại — schema có thể có hoặc không)
 *   - Trừ chính người vừa thực hiện hành động (actor)
 *
 * Recipients của 1 task = primary assignee + co-assignees từ task_assignees +
 * người tạo task (created_by). Dùng hàm getTaskRecipients() bên dưới.
 */
import { query, queryOne } from '@/lib/db';
import { notify } from '@/lib/notifications/engine';

function getPriorityLabel(priority: string): string {
  const m: Record<string, string> = { low: 'Thấp', medium: 'Trung bình', high: 'Cao' };
  return m[priority] || priority;
}
function getStatusLabel(status: string): string {
  const m: Record<string, string> = {
    todo: 'Cần làm', in_progress: 'Đang xử lý', done: 'Hoàn thành', cancelled: 'Đã hủy',
  };
  return m[status] || status;
}

interface Recipient {
  user_id: string;
  telegram_chat_id: string | null;
  name?: string | null;
}

/**
 * Trả về danh sách user cần nhận thông báo cho 1 task:
 *  - primary assignee (tasks.assigned_to)
 *  - co-assignees (task_assignees.user_id)
 *  - người tạo (tasks.created_by) — nếu includeCreator
 * Loại trừ actorId (người vừa thực hiện hành động) và dedupe.
 */
export async function getTaskRecipients(
  taskId: string,
  opts: { includeCreator?: boolean; excludeActorId?: string | null } = {}
): Promise<Recipient[]> {
  const includeCreator = opts.includeCreator !== false; // default true
  const excludeActorId = opts.excludeActorId ?? null;

  const task = await queryOne<{ assigned_to: string | null; created_by: string | null }>(
    `SELECT assigned_to, created_by FROM tasks WHERE id = $1`,
    [taskId]
  );
  if (!task) return [];

  const ids = new Set<string>();
  if (task.assigned_to) ids.add(String(task.assigned_to));
  if (includeCreator && task.created_by) ids.add(String(task.created_by));

  const coAssignees = await query<{ user_id: string }>(
    `SELECT user_id FROM task_assignees WHERE task_id = $1`,
    [taskId]
  );
  for (const r of coAssignees) ids.add(String(r.user_id));

  if (excludeActorId) ids.delete(String(excludeActorId));
  if (ids.size === 0) return [];

  const rows = await query<Recipient>(
    `SELECT id::text AS user_id, "telegram_chat_id", name
       FROM users
      WHERE id::text = ANY($1::text[])
        AND status = 'active'`,
    [Array.from(ids)]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Sự kiện: TẠO TASK MỚI
// ---------------------------------------------------------------------------

/**
 * Notify khi tạo task: gửi cho primary assignee + tất cả co-assignees (trừ creator).
 * Telegram + in-app.
 */
export async function notifyTaskCreated(task: any, actorId?: string | null): Promise<void> {
  try {
    const recipients = await getTaskRecipients(task.id, {
      includeCreator: false, // creator chính là actor
      excludeActorId: actorId || task.created_by,
    });
    if (recipients.length === 0) return;

    const dueDate = task.due_date ? new Date(task.due_date).toLocaleDateString('vi-VN') : 'Chưa đặt';
    await notify('task.assigned', {
      code: task.code || task.task_code || '', title: task.title, priority: getPriorityLabel(task.priority),
      dueDate, createdBy: task.created_by_name || 'N/A',
    }, { recipients: recipients.map(r => r.user_id), relatedId: task.id });
  } catch (err) {
    console.error('[notifyTaskCreated] error:', err);
  }
}

// ---------------------------------------------------------------------------
// Sự kiện: ĐỔI TRẠNG THÁI
// ---------------------------------------------------------------------------

export async function notifyTaskStatusChanged(
  task: any,
  oldStatus: string,
  actorId: string | null,
  actorName?: string | null
): Promise<void> {
  try {
    if (oldStatus === task.status) return;
    const recipients = await getTaskRecipients(task.id, {
      includeCreator: true,
      excludeActorId: actorId,
    });
    if (recipients.length === 0) return;

    const tgStatus: Record<string, string> = {
      todo: '📌 Chưa Bắt Đầu', in_progress: '🟡 Đang Thực Hiện', done: '✅ Hoàn Thành', cancelled: '⚫ Đã Hủy',
    };
    const tgPriority: Record<string, string> = { low: '🟢 Thấp', medium: '🟡 Trung Bình', high: '🔴 Cao' };
    await notify('task.statusChanged', {
      code: task.code || task.task_code || '', title: task.title,
      oldLabel: getStatusLabel(oldStatus), newLabel: getStatusLabel(task.status),
      oldStatusTg: tgStatus[oldStatus] || oldStatus, newStatusTg: tgStatus[task.status] || task.status,
      priorityTg: tgPriority[task.priority] || task.priority, changedBy: actorName || 'Hệ thống',
    }, { recipients: recipients.map(r => r.user_id), relatedId: task.id });
  } catch (err) {
    console.error('[notifyTaskStatusChanged] error:', err);
  }
}

// ---------------------------------------------------------------------------
// Sự kiện: COMMENT MỚI
// ---------------------------------------------------------------------------

export async function notifyTaskCommented(
  task: any,
  commentExcerpt: string,
  actorId: string | null,
  actorName?: string | null
): Promise<void> {
  try {
    const recipients = await getTaskRecipients(task.id, {
      includeCreator: true,
      excludeActorId: actorId,
    });
    if (recipients.length === 0) return;

    const excerpt = (commentExcerpt || '').slice(0, 150);
    await notify('task.commented', {
      code: task.code || '', title: task.title, actorName: actorName || 'Người dùng', excerpt,
    }, { recipients: recipients.map(r => r.user_id), relatedId: task.id });
  } catch (err) {
    console.error('[notifyTaskCommented] error:', err);
  }
}

// ---------------------------------------------------------------------------
// Sự kiện: THÊM SUBTASK
// ---------------------------------------------------------------------------

export async function notifyTaskSubtaskAdded(
  task: any,
  subtaskTitle: string,
  actorId: string | null,
  actorName?: string | null
): Promise<void> {
  try {
    const recipients = await getTaskRecipients(task.id, {
      includeCreator: true,
      excludeActorId: actorId,
    });
    if (recipients.length === 0) return;

    await notify('task.subtaskAdded', {
      code: task.code || '', taskTitle: task.title, subtaskTitle, actorName: actorName || 'Người dùng',
    }, { recipients: recipients.map(r => r.user_id), relatedId: task.id });
  } catch (err) {
    console.error('[notifyTaskSubtaskAdded] error:', err);
  }
}

// ---------------------------------------------------------------------------
// Sự kiện: THÊM CO-ASSIGNEE SAU KHI TẠO
// ---------------------------------------------------------------------------

export async function notifyCoAssigneeAdded(
  task: any,
  newAssigneeUserId: string,
  actorId: string | null,
  actorName?: string | null
): Promise<void> {
  try {
    if (!newAssigneeUserId || newAssigneeUserId === actorId) return;
    const user = await queryOne<Recipient>(
      `SELECT id::text AS user_id, "telegram_chat_id", name
         FROM users WHERE id = $1 AND status = 'active'`,
      [newAssigneeUserId]
    );
    if (!user) return;

    const dueDate = task.due_date ? new Date(task.due_date).toLocaleDateString('vi-VN') : 'Chưa đặt';
    await notify('task.coAssigned', {
      code: task.code || '', title: task.title, priority: getPriorityLabel(task.priority),
      dueDate, actorName: actorName || 'người dùng',
    }, { recipients: [user.user_id], relatedId: task.id });
  } catch (err) {
    console.error('[notifyCoAssigneeAdded] error:', err);
  }
}
