/**
 * Nhắc Yêu Cầu Tuyển Dụng sắp hết hạn — gửi bộ phận Tuyển Dụng (+ người phụ trách).
 * Mốc nhắc: 5 ngày trước & 1 ngày trước hạn (target_close_date). Mỗi mốc 1 lần (log chống trùng).
 */
import { query, queryOne } from '@/lib/db';
import { getReminderDepartmentIds } from './hrSettingsService';
import { getReminderSetting } from './systemSettingsService';
import { notify } from '@/lib/notifications/engine';

interface DueReq {
  id: string;
  title: string;
  owner_id: string | null;
  owner_name: string | null;
  company_name: string | null;
  close_date: string;
  days_left: number;
}
interface Recipient { id: string; telegram_chat_id: string | null; telegram_enabled: boolean | null }

/** Chọn mốc nhắc theo số ngày còn lại (mốc lấy từ cấu hình hệ thống). */
function milestoneFor(daysLeft: number, milestones: number[]): string | null {
  return milestones.includes(daysLeft) ? `d${daysLeft}` : null;
}

/** Đánh dấu đã nhắc (log). true nếu là lần MỚI. */
async function claimSlot(reqId: string, milestone: string): Promise<boolean> {
  const id = `rrl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const row = await queryOne<{ id: string }>(
    `INSERT INTO requisition_reminder_log (id, requisition_id, milestone, sent_date)
     VALUES ($1, $2, $3, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
     ON CONFLICT (requisition_id, milestone, sent_date) DO NOTHING
     RETURNING id`,
    [id, reqId, milestone]
  );
  return !!row;
}

export async function runRequisitionReminders(): Promise<{ recipients: number; due: number; notified: number; skipped: number }> {
  const { milestones } = await getReminderSetting('requisition');
  const deptIds = await getReminderDepartmentIds();
  const deptRecipients = deptIds.length
    ? await query<Recipient>(
        `SELECT id::text AS id, telegram_chat_id, telegram_enabled
           FROM users WHERE status='active' AND department_id::text = ANY($1::text[])`,
        [deptIds]
      )
    : [];

  const reqs = await query<DueReq>(
    `SELECT r.id, r.title, r.owner_id,
            u.name AS owner_name, co.name AS company_name,
            to_char(r.target_close_date, 'YYYY-MM-DD') AS close_date,
            (r.target_close_date - (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) AS days_left
       FROM requisitions r
       LEFT JOIN companies co ON co.id::text = NULLIF(r.company_id, '')
       LEFT JOIN users u      ON u.id::text  = NULLIF(r.owner_id, '')
      WHERE r.deleted_at IS NULL AND r.status IN ('open','on_hold') AND r.target_close_date IS NOT NULL`
  );

  let notified = 0, skipped = 0, due = 0;

  for (const r of reqs) {
    const milestone = milestoneFor(Number(r.days_left), milestones);
    if (!milestone) continue;
    due++;
    if (!(await claimSlot(r.id, milestone))) { skipped++; continue; }

    // Người nhận = bộ phận Tuyển Dụng + người phụ trách (gộp, không trùng).
    const recipients = [...deptRecipients];
    if (r.owner_id && !recipients.some((x) => x.id === r.owner_id)) {
      const owner = await queryOne<Recipient>(
        `SELECT id::text AS id, telegram_chat_id, telegram_enabled FROM users WHERE id::text = $1 AND status='active'`,
        [r.owner_id]
      );
      if (owner) recipients.push(owner);
    }

    const meta = `${r.company_name ? ` · ${r.company_name}` : ''}${r.owner_name ? ` · PT: ${r.owner_name}` : ' · chưa giao người phụ trách'}`;
    const reqState = r.days_left === 1 ? 'urgent' : 'normal';
    const { sent } = await notify('requisition.deadline', {
      state: reqState, title: r.title, meta, closeDate: r.close_date, daysLeft: r.days_left,
    }, { recipients: recipients.map(rc => rc.id), relatedId: r.id });
    notified += sent;
  }

  console.log(`[ReqReminder] due=${due} notified=${notified} skipped=${skipped} recipients=${deptRecipients.length}`);
  return { recipients: deptRecipients.length, due, notified, skipped };
}
