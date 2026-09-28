/**
 * Nhắc hạn Pháp Chế — quét giấy phép/văn bản, hợp đồng thương mại, ủy quyền sắp
 * hết hạn + nghĩa vụ tuân thủ đến kỳ, phát qua engine thông báo tập trung.
 *
 * MỌI mốc đều cấu hình được ở /cau-hinh-he-thong → Nhắc nhở (không hardcode):
 * - TRƯỚC HẠN: reminder.legal_document / reminder.legal_contract.
 * - QUÁ HẠN (nhắc lại sau hạn, chặn spam) + TUÂN THỦ (trước hạn nộp, 0 = đúng ngày):
 *   legal.reminderExtra — đọc qua getLegalReminderConfig(), DB rỗng → DEFAULT
 *   [1,7,30] / [7,3,1,0] (đúng hằng số cũ, deploy không đổi hành vi).
 * - Người nhận: quy tắc recipient.legal (mặc định admin/super_admin — cấu hình được).
 * - Chống trùng: legal_reminder_log UNIQUE(entity_type, entity_id, milestone_days, sent_date).
 */
import crypto from 'crypto';
import { query, queryOne } from '@/lib/db';
import { notify } from '@/lib/notifications/engine';
import {
  getReminderSetting, getLegalReminderConfig, resolveRecipients,
} from '@/lib/services/systemSettingsService';
import { listExpiring, listComplianceItems, type LegalComplianceItem } from '@/lib/services/legalService';

function vnToday(): Date {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  return new Date(`${s}T00:00:00Z`);
}

function fmtDateVN(iso: string): string {
  const p = iso.slice(0, 10).split('-');
  return `${p[2]}/${p[1]}/${p[0]}`;
}

/** Giành quyền gửi 1 mốc — trả false nếu hôm nay đã gửi mốc này rồi. */
async function claim(entityType: string, entityId: string, milestoneDays: number): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO legal_reminder_log (id, entity_type, entity_id, milestone_days)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (entity_type, entity_id, milestone_days, sent_date) DO NOTHING
     RETURNING id`,
    ['lrl_' + crypto.randomBytes(8).toString('hex'), entityType, entityId, milestoneDays]
  );
  return !!row;
}

/**
 * Chạy 1 lượt quét nhắc. Trả về số thông báo đã phát (để log/test).
 * Được scheduler gọi mỗi slot sáng; gọi tay được khi test.
 */
export async function runLegalReminders(): Promise<number> {
  const resolved = (await resolveRecipients('legal')).map((r) => r.id);
  if (!resolved.length) return 0;   // chưa cấu hình ai nhận → không quét vô ích

  // ⚠️ CHỐNG RÒ: quy tắc người nhận có thể theo ROLE (admin/super_admin), nhưng nội dung
  // nhắc chứa tên giấy phép + công ty — dữ liệu nhạy cảm chỉ dành cho người CÓ RBAC
  // 'legal'. Lọc lại theo module_permissions (đúng nguồn canAccess dùng) trước khi gửi.
  const allowed = await query<{ id: string }>(
    `SELECT id::text AS id FROM users
      WHERE id::text = ANY($1)
        AND module_permissions->'legal' ?| array['view','create','edit','delete']`,
    [resolved]
  );
  const recipients = allowed.map((r) => r.id);
  if (recipients.length < resolved.length) {
    console.log(`[legalReminder] lọc bảo mật: ${resolved.length - recipients.length}/${resolved.length} người nhận bị loại vì không có quyền Pháp Chế`);
  }
  if (!recipients.length) return 0;

  // Đọc cấu hình MỘT LẦN mỗi lượt chạy — đổi trong UI áp dụng từ lượt kế tiếp.
  const extra = await getLegalReminderConfig();

  let sent = 0;
  sent += await remindExpiring(recipients, extra.overdueMilestones);
  sent += await remindCompliance(recipients, extra.complianceMilestones);
  return sent;
}

/** Giấy phép/văn bản + hợp đồng + ủy quyền sắp/đã hết hạn. */
async function remindExpiring(recipients: string[], overdueMilestones: number[]): Promise<number> {
  const [docCfg, contractCfg] = await Promise.all([
    getReminderSetting('legal_document'),
    getReminderSetting('legal_contract'),
  ]);
  const maxWindow = Math.max(...docCfg.milestones, ...contractCfg.milestones, 0);
  const rows = await listExpiring(maxWindow);

  let sent = 0;
  for (const r of rows) {
    // Ủy quyền dùng chung mốc với văn bản (cùng bản chất giấy tờ pháp lý).
    const milestones = r.entity_type === 'contract' ? contractCfg.milestones : docCfg.milestones;
    const d = r.days_left;

    let milestone: number | null = null;
    let state: 'before' | 'overdue' = 'before';
    if (d >= 0 && milestones.includes(d)) {
      milestone = d;
    } else if (d < 0 && overdueMilestones.includes(-d)) {
      milestone = d;              // âm — phân biệt với mốc trước hạn trong log
      state = 'overdue';
    }
    if (milestone === null) continue;

    // Ủy quyền chỉ có template 'before' — quá hạn thì thôi (đã revoke/expire tay).
    if (r.entity_type === 'authorization' && state === 'overdue') continue;

    if (!(await claim(r.entity_type, r.id, milestone))) continue;

    const eventKey =
      r.entity_type === 'contract' ? 'legal.contract.expiring'
      : r.entity_type === 'authorization' ? 'legal.authorization.expiring'
      : 'legal.document.expiring';

    await notify(eventKey, {
      state,
      title: r.title,
      companyName: r.company_name ?? '—',
      expiryDate: fmtDateVN(r.expiry_date),
      daysLeft: Math.max(d, 0),
      daysOverdue: Math.max(-d, 0),
    }, { recipients, relatedId: r.id });
    sent++;
  }
  return sent;
}

/** Kỳ hiện hành của 1 nghĩa vụ + hạn nộp (theo giờ VN). null = kỳ không xác định được. */
export function currentPeriodOf(item: LegalComplianceItem, today: Date): { period: string; due: Date } | null {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth() + 1;
  if (!item.due_day) return null;   // không khai ngày đến hạn → không nhắc được

  const mk = (yy: number, mm: number, dd: number) => {
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    return new Date(Date.UTC(yy, mm - 1, Math.min(dd, last)));
  };

  switch (item.frequency) {
    case 'yearly': {
      if (!item.due_month) return null;
      return { period: String(y), due: mk(y, item.due_month, item.due_day) };
    }
    case 'monthly':
      return { period: `${y}-${String(m).padStart(2, '0')}`, due: mk(y, m, item.due_day) };
    case 'quarterly': {
      // Nộp cho quý TRƯỚC, hạn ở tháng đầu quý sau (1/4/7/10).
      if (![1, 4, 7, 10].includes(m)) return null;
      const prevQ = m === 1 ? 4 : (m - 1) / 3;
      const prevY = m === 1 ? y - 1 : y;
      return { period: `${prevY}-Q${prevQ}`, due: mk(y, m, item.due_day) };
    }
    case 'once':
      return null;
  }
}

/** Nghĩa vụ tuân thủ đến kỳ chưa đánh dấu đã nộp. */
async function remindCompliance(recipients: string[], complianceMilestones: number[]): Promise<number> {
  const items = await listComplianceItems();
  const today = vnToday();
  let sent = 0;

  for (const item of items) {
    const cur = currentPeriodOf(item, today);
    if (!cur) continue;
    if (item.done_periods?.includes(cur.period)) continue;   // kỳ này nộp rồi

    const daysLeft = Math.round((cur.due.getTime() - today.getTime()) / 86_400_000);
    if (!complianceMilestones.includes(daysLeft)) continue;

    if (!(await claim('compliance', item.id, daysLeft))) continue;

    await notify('legal.compliance.due', {
      name: item.name,
      agency: item.agency ? ` (nộp ${item.agency})` : '',
      period: cur.period,
      dueDate: fmtDateVN(cur.due.toISOString()),
    }, { recipients, relatedId: item.id });
    sent++;
  }
  return sent;
}
