/**
 * Nhắc gia hạn hợp đồng — gửi cho bộ phận C&B (theo phòng ban cấu hình).
 *
 * Lịch (theo daysLeft = end_date - hôm nay, giờ VN):
 *   30/15/5/1 ngày trước  → 1 lần/ngày (slot 'am')
 *   ngày hết hạn (0)       → 2 lần/ngày (slot 'am' + 'pm')
 *   quá hạn (<0)           → 1 lần/ngày (slot 'am') tới khi HĐ renewed/terminated
 * Chống trùng bằng contract_reminder_log UNIQUE(contract_id, sent_date, slot).
 */
import { query, queryOne } from '@/lib/db';
import { getReminderDepartmentIds } from './hrSettingsService';
import { getReminderSetting } from './systemSettingsService';
import { notify } from '@/lib/notifications/engine';

interface RecipientRow {
  id: string;
  name: string;
  telegram_chat_id: string | null;
  telegram_enabled: boolean | null;
}

interface DueContract {
  id: string;
  contract_number: string;
  employee_name: string | null;
  end_date: string;
  days_left: number;
}

/** Xác định milestone + có gửi ở slot này không. `milestones` lấy từ cấu hình hệ thống. */
function decide(daysLeft: number, slot: 'am' | 'pm', milestones: number[]): { milestone: string } | null {
  if (milestones.includes(daysLeft)) return slot === 'am' ? { milestone: `d${daysLeft}` } : null;
  if (daysLeft === 0) return { milestone: 'expiry' }; // cả am + pm
  if (daysLeft < 0) return slot === 'am' ? { milestone: 'overdue' } : null;
  return null;
}


/** Insert log chống trùng. Trả true nếu là lần gửi MỚI (chưa từng gửi slot này hôm nay). */
async function claimReminderSlot(contractId: string, milestone: string, slot: 'am' | 'pm'): Promise<boolean> {
  const id = `crl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const row = await queryOne<{ id: string }>(
    `INSERT INTO contract_reminder_log (id, contract_id, milestone, slot, sent_date)
     VALUES ($1, $2, $3, $4, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
     ON CONFLICT (contract_id, sent_date, slot) DO NOTHING
     RETURNING id`,
    [id, contractId, milestone, slot]
  );
  return !!row;
}

/**
 * Chạy 1 lượt nhắc cho khung giờ `slot`. Trả về thống kê.
 */
export async function runContractReminders(slot: 'am' | 'pm'): Promise<{
  recipients: number;
  contractsDue: number;
  notified: number;
  skippedDuplicate: number;
}> {
  const { milestones } = await getReminderSetting('contract');
  const deptIds = await getReminderDepartmentIds();
  if (deptIds.length === 0) {
    console.warn('[ContractReminder] Chưa cấu hình phòng ban C&B nhận nhắc — bỏ qua.');
    return { recipients: 0, contractsDue: 0, notified: 0, skippedDuplicate: 0 };
  }

  const recipients = await query<RecipientRow>(
    `SELECT id::text AS id, name, telegram_chat_id, telegram_enabled
       FROM users
      WHERE status = 'active' AND department_id::text = ANY($1::text[])`,
    [deptIds]
  );
  if (recipients.length === 0) {
    console.warn('[ContractReminder] Phòng ban C&B không có user active — bỏ qua.');
    return { recipients: 0, contractsDue: 0, notified: 0, skippedDuplicate: 0 };
  }

  // Hợp đồng active có end_date + số ngày còn lại tính theo giờ VN trong SQL.
  const contracts = await query<DueContract>(
    `SELECT c.id, c.contract_number, u.name AS employee_name,
            to_char(c.end_date, 'YYYY-MM-DD') AS end_date,
            (c.end_date - (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) AS days_left
       FROM contracts c
       LEFT JOIN users u ON u.id::text = c.employee_id
      WHERE c.status = 'active' AND c.end_date IS NOT NULL`
  );

  let contractsDue = 0;
  let notified = 0;
  let skippedDuplicate = 0;

  for (const c of contracts) {
    const d = decide(Number(c.days_left), slot, milestones);
    if (!d) continue;
    contractsDue++;

    const fresh = await claimReminderSlot(c.id, d.milestone, slot);
    if (!fresh) {
      skippedDuplicate++;
      continue;
    }

    const emp = c.employee_name || 'nhân viên';
    const state = c.days_left > 0 ? 'before' : c.days_left === 0 ? 'today' : 'overdue';
    const { sent } = await notify('contract.expiring', {
      state, contractNumber: c.contract_number, employeeName: emp, endDate: c.end_date,
      daysLeft: c.days_left, daysOverdue: Math.abs(c.days_left),
    }, { recipients: recipients.map(r => r.id), relatedId: c.id });
    notified += sent;
  }

  console.log(
    `[ContractReminder] slot=${slot} recipients=${recipients.length} due=${contractsDue} notified=${notified} dup=${skippedDuplicate}`
  );
  return { recipients: recipients.length, contractsDue, notified, skippedDuplicate };
}
