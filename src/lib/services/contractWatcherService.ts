import { query, queryOne } from '@/lib/db';
import { notify } from '@/lib/notifications/engine';
import { getHrNotifyRecipientUserIds } from '@/lib/services/hrSettingsService';
import { getHrAutomationConfig } from '@/lib/services/systemSettingsService';

/** Vai trò người gắn vào HĐ. 'co_handler' = Người Đồng Phụ Trách (dùng cho escalation). */
export type WatcherRole = 'watcher' | 'co_handler';

export interface ContractWatcher {
  id: string;
  contract_id: string;
  user_id: string;
  role: WatcherRole;
  name: string | null;
  email: string | null;
  telegram_chat_id: string | null;
  telegram_enabled: boolean | null;
  added_by: string | null;
  created_at: string;
}

const WATCHER_SELECT = `
  SELECT cw.id, cw.contract_id, cw.user_id::text, cw.role,
         u.name, u.email, u.telegram_chat_id, u.telegram_enabled,
         cw.added_by, cw.created_at
    FROM contract_watchers cw
    LEFT JOIN users u ON u.id::text = cw.user_id
   WHERE cw.contract_id = $1
   ORDER BY cw.created_at ASC`;

export async function listWatchers(contractId: string): Promise<ContractWatcher[]> {
  return query<ContractWatcher>(WATCHER_SELECT, [contractId]);
}

export async function addWatcher(
  contractId: string,
  userId: string,
  addedBy: string,
  contractNumber: string,
  role: WatcherRole = 'watcher'
): Promise<ContractWatcher | null> {
  const id = `cw_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  // Cho phép đổi vai trò nếu user đã có (vd watcher → co_handler).
  const row = await queryOne<{ id: string }>(
    `INSERT INTO contract_watchers (id, contract_id, user_id, role, added_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (contract_id, user_id) DO UPDATE SET role = EXCLUDED.role
     RETURNING id`,
    [id, contractId, userId, role, addedBy]
  );
  if (!row) return null;

  const msg = role === 'co_handler'
    ? `Bạn được phân làm Người Đồng Phụ Trách hợp đồng ${contractNumber}. Bạn sẽ nhận thông báo và được báo cáo nếu hồ sơ chưa hoàn thành.`
    : `Bạn được thêm vào danh sách theo dõi hợp đồng ${contractNumber}. Bạn sẽ nhận thông báo về mọi cập nhật của hợp đồng này.`;
  await notify('contract.watcherAdded', { message: msg }, { recipients: [userId], relatedId: contractId });

  return queryOne<ContractWatcher>(
    `SELECT cw.id, cw.contract_id, cw.user_id::text, cw.role,
            u.name, u.email, u.telegram_chat_id, u.telegram_enabled,
            cw.added_by, cw.created_at
       FROM contract_watchers cw
       LEFT JOIN users u ON u.id::text = cw.user_id
      WHERE cw.id = $1`,
    [id]
  );
}

export async function removeWatcher(contractId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `DELETE FROM contract_watchers WHERE contract_id = $1 AND user_id = $2 RETURNING id`,
    [contractId, userId]
  );
  return !!row;
}

/** Notify tất cả watcher khi trạng thái HĐ thay đổi. */
export async function notifyWatchersStatusChange(
  contractId: string,
  contractNumber: string,
  employeeName: string | null,
  oldStatus: string,
  newStatus: string
): Promise<void> {
  // Người nhận = watchers của HĐ + danh sách cấu hình "Nhận thông báo" (recipient.hr_general)
  const [watchers, configured] = await Promise.all([
    listWatchers(contractId),
    getHrNotifyRecipientUserIds(),
  ]);
  const recipients = Array.from(
    new Set([...watchers.map(w => w.user_id), ...configured].filter(Boolean))
  );
  if (recipients.length === 0) return;

  const STATUS_LABEL: Record<string, string> = {
    draft: 'Nháp', pending_signing: 'Chờ ký', active: 'Hiệu lực',
    renewed: 'Đã gia hạn', terminated: 'Chấm dứt',
  };
  const msg = `Hợp đồng ${contractNumber} của ${employeeName || 'nhân viên'} vừa đổi trạng thái: "${STATUS_LABEL[oldStatus] || oldStatus}" → "${STATUS_LABEL[newStatus] || newStatus}".`;
  await notify('contract.statusChange', { message: msg }, {
    recipients, relatedId: contractId,
  });
}

/** Notify nhân viên khi HĐ chuyển sang pending_signing (cần ký). */
export async function notifyEmployeePendingSigning(
  contractId: string,
  contractNumber: string,
  employeeId: string
): Promise<void> {
  const msg = `Bạn có hợp đồng ${contractNumber} đang chờ ký. Vui lòng xem lại thông tin và liên hệ bộ phận C&B để hoàn thành ký kết.`;
  await notify('contract.pendingSign', { message: msg }, { recipients: [employeeId], relatedId: contractId });
}

/** user_id của các Người Đồng Phụ Trách (co_handler) gắn với HĐ. */
export async function listCoHandlerIds(contractId: string): Promise<string[]> {
  const rows = await query<{ user_id: string }>(
    `SELECT user_id::text AS user_id FROM contract_watchers WHERE contract_id = $1 AND role = 'co_handler'`,
    [contractId]
  );
  return rows.map(r => r.user_id);
}

/**
 * Quản lý của 1 user — Phase 4 cải tổ cơ cấu: lấy từ MỌI phân công active trong
 * org_assignments (kiêm nhiệm → báo lên đủ các quản lý), fallback trưởng đơn vị
 * (org_role='head') của đơn vị họ thuộc, rồi mới tới cột cũ users.manager_id.
 */
async function resolveManagerIds(userId: string): Promise<string[]> {
  // 1. Quản lý khai báo trên các phân công active
  const fromAssignments = await query<{ manager_id: string }>(
    `SELECT DISTINCT manager_id::text AS manager_id
       FROM org_assignments
      WHERE user_id::text = $1 AND is_active AND manager_id IS NOT NULL`,
    [userId]
  );
  if (fromAssignments.length) return fromAssignments.map(r => r.manager_id);

  // 2. Trưởng đơn vị (head) của các đơn vị user thuộc — khai báo tường minh, không suy đoán
  const fromHeads = await query<{ head_id: string }>(
    `SELECT DISTINCT h.user_id::text AS head_id
       FROM org_assignments oa
       JOIN org_assignments h
         ON h.company_id = oa.company_id
        AND h.department_id IS NOT DISTINCT FROM oa.department_id
        AND h.sub_department_id IS NOT DISTINCT FROM oa.sub_department_id
        AND h.org_role = 'head' AND h.is_active AND h.user_id <> oa.user_id
      WHERE oa.user_id::text = $1 AND oa.is_active`,
    [userId]
  );
  if (fromHeads.length) return fromHeads.map(r => r.head_id);

  // 3. Fallback cột cũ (user chưa được backfill phân công)
  const u = await queryOne<{ manager_id: string | null }>(
    `SELECT manager_id::text AS manager_id FROM users WHERE id::text = $1`,
    [userId]
  );
  return u?.manager_id ? [u.manager_id] : [];
}

/**
 * Báo cáo lên cấp trên khi HĐ chưa ký quá số lần nhắc cấu hình.
 * Người nhận = quản lý của nhân sự sở hữu HĐ + quản lý của (các) Người Đồng Phụ Trách.
 * Nội dung nêu rõ số lần đã nhắc + số ngày quá hạn kể từ ngày vào làm (cho thấy mức nghiêm trọng).
 */
async function escalateUnsignedContract(
  contractId: string, contractNumber: string, employeeId: string, reminderCount: number
): Promise<boolean> {
  const emp = await queryOne<{ name: string | null; hire_date: string | null; overdue_days: number | null }>(
    `SELECT name, hire_date::text AS hire_date,
            (CURRENT_DATE - hire_date)::int AS overdue_days
       FROM users WHERE id::text = $1`,
    [employeeId]
  );

  const coHandlerIds = await listCoHandlerIds(contractId);
  const managerLists = await Promise.all([
    resolveManagerIds(employeeId),
    ...coHandlerIds.map(id => resolveManagerIds(id)),
  ]);
  const recipients = Array.from(new Set(managerLists.flat().filter(Boolean)));
  if (recipients.length === 0) return false; // không có cấp trên để báo → để lần nhắc sau thử lại

  // Chiếm mốc escalate (chống báo lặp) — chỉ khi đã chắc có người nhận.
  const claim = await queryOne<{ id: string }>(
    `UPDATE contracts SET escalated_at = NOW() WHERE id = $1 AND escalated_at IS NULL RETURNING id`,
    [contractId]
  );
  if (!claim) return false;

  const empName = emp?.name || 'Nhân viên';
  const overdue = emp?.overdue_days != null && emp.overdue_days > 0
    ? ` Đã quá ${emp.overdue_days} ngày kể từ ngày vào làm (${emp.hire_date}).`
    : '';
  const msg = `🚨 ${empName} chưa hoàn thành hồ sơ nhân sự — hợp đồng ${contractNumber} vẫn CHƯA KÝ sau ${reminderCount} lần nhắc của bộ phận C&B.${overdue} Đề nghị cấp trên đôn đốc nhân sự hoàn tất thủ tục.`;
  await notify('contract.signEscalated', { message: msg }, { recipients, relatedId: contractId });
  return true;
}

/**
 * Buzz nhân viên — nhắc hoàn thành ký hợp đồng. Đếm số lần nhắc (tay + scheduler);
 * khi đủ ngưỡng cấu hình mà HĐ vẫn chưa ký → TỰ BÁO CÁO lên cấp trên (một lần).
 */
export async function remindEmployeeToSign(
  contractId: string,
  contractNumber: string,
  employeeId: string,
  remindedBy: string
): Promise<void> {
  const msg = `Nhắc nhở: Hợp đồng ${contractNumber} của bạn đang chờ ký. Vui lòng liên hệ bộ phận C&B sớm nhất để hoàn thành thủ tục.`;
  await notify('contract.signReminder', { message: msg }, { recipients: [employeeId], relatedId: contractId });

  // Tăng bộ đếm + lấy trạng thái để quyết định escalate (atomic).
  const row = await queryOne<{ reminder_count: number; status: string; already_escalated: boolean }>(
    `UPDATE contracts SET reminder_count = reminder_count + 1
      WHERE id = $1
      RETURNING reminder_count, status, (escalated_at IS NOT NULL) AS already_escalated`,
    [contractId]
  );
  if (!row || row.already_escalated) return;
  if (row.status !== 'pending_signing' && row.status !== 'draft') return;

  const { contractReminderEscalateAfter } = await getHrAutomationConfig();
  const threshold = Number.isInteger(contractReminderEscalateAfter) && contractReminderEscalateAfter >= 1
    ? contractReminderEscalateAfter : 3;
  if (row.reminder_count < threshold) return;

  await escalateUnsignedContract(contractId, contractNumber, employeeId, row.reminder_count);
}
