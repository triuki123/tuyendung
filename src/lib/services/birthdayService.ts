/**
 * birthdayService — tính năng Chúc Mừng Sinh Nhật.
 *
 * - getMonthBirthdays / getTodayBirthdays: lọc nhân sự theo tháng/ngày sinh (mọi năm).
 * - runMonthlyDigest: gửi danh sách sinh nhật trong tháng cho người nhận cấu hình (ngày 1).
 * - runVipReminder: đúng ngày sinh nhật BOD & Leader → nhắc riêng người phụ trách.
 * - sendWish: lưu lời chúc + gửi thẳng Telegram tới người sinh nhật.
 * Chống trùng qua bảng birthday_reminder_log.
 */
import { query, queryOne, execute } from '@/lib/db';
import { notify } from '@/lib/notifications/engine';
import { resolveRecipients, getBirthdayConfig } from '@/lib/services/systemSettingsService';
import { sendTelegramMessageToChat } from '@/lib/services/telegramService';

export interface BirthdayPerson {
  id: string;
  name: string;
  avatar: string | null;
  email: string | null;
  dob_day: number;
  dob_month: number;
  job_title_name: string | null;
  department_name: string | null;
  company_name: string | null;
  is_vip: boolean;
  telegram_chat_id?: string | null;
  telegram_enabled?: boolean | null;
}

const SELECT_BIRTHDAY = (vipTag: string) => `
  SELECT u.id::text AS id, u.name, u.avatar, u.email,
         EXTRACT(DAY   FROM u.date_of_birth)::int AS dob_day,
         EXTRACT(MONTH FROM u.date_of_birth)::int AS dob_month,
         COALESCE(pos.name, jt.title) AS job_title_name,
         d.name AS department_name,
         c.name AS company_name,
         u.telegram_chat_id, u.telegram_enabled,
         EXISTS (
           SELECT 1 FROM user_tags ut JOIN tags t ON t.id = ut.tag_id
            WHERE ut.user_id::text = u.id::text AND lower(t.name) = lower($VIP) AND t.is_active = true
         ) AS is_vip
    FROM users u
    LEFT JOIN positions pos ON pos.id::text = u.position_id::text
  LEFT JOIN job_titles jt ON jt.id::text = u.job_title_id::text
    LEFT JOIN departments d  ON d.id::text = u.department_id::text
    LEFT JOIN companies   c  ON c.id::text = u.company_id::text
   WHERE u.status = 'active' AND u.date_of_birth IS NOT NULL`;

/** Nhân sự sinh nhật trong THÁNG (mặc định tháng hiện tại VN). */
export async function getMonthBirthdays(month?: number): Promise<BirthdayPerson[]> {
  const { vipTagName } = await getBirthdayConfig();
  const m = month ?? Number(new Date().toLocaleString('en-US', { month: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }));
  return query<BirthdayPerson>(
    `${SELECT_BIRTHDAY(vipTagName).replace('$VIP', '$2')}
       AND EXTRACT(MONTH FROM u.date_of_birth)::int = $1
     ORDER BY is_vip DESC, EXTRACT(DAY FROM u.date_of_birth) ASC, u.name`,
    [m, vipTagName]
  );
}

/** Nhân sự sinh nhật HÔM NAY (theo ngày VN). */
export async function getTodayBirthdays(): Promise<BirthdayPerson[]> {
  const { vipTagName } = await getBirthdayConfig();
  const now = new Date();
  const d = Number(now.toLocaleString('en-US', { day: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }));
  const m = Number(now.toLocaleString('en-US', { month: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }));
  return query<BirthdayPerson>(
    `${SELECT_BIRTHDAY(vipTagName).replace('$VIP', '$3')}
       AND EXTRACT(DAY FROM u.date_of_birth)::int = $1
       AND EXTRACT(MONTH FROM u.date_of_birth)::int = $2
     ORDER BY is_vip DESC, u.name`,
    [d, m, vipTagName]
  );
}

/** Chiếm 1 log_key (chống trùng). Trả true nếu đây là lần đầu (được phép gửi). */
async function claimLog(logKey: string): Promise<boolean> {
  const n = await execute(
    `INSERT INTO birthday_reminder_log (log_key) VALUES ($1) ON CONFLICT (log_key) DO NOTHING`,
    [logKey]
  );
  return n > 0;
}

function vnYmd(): { y: number; m: number; d: number } {
  const now = new Date();
  const p = (opt: Intl.DateTimeFormatOptions) => Number(now.toLocaleString('en-US', { ...opt, timeZone: 'Asia/Ho_Chi_Minh' }));
  return { y: p({ year: 'numeric' }), m: p({ month: 'numeric' }), d: p({ day: 'numeric' }) };
}

/** Digest đầu tháng: danh sách sinh nhật trong tháng → người nhận cấu hình. */
export async function runMonthlyDigest(): Promise<{ sent: boolean }> {
  const cfg = await getBirthdayConfig();
  if (!cfg.enabled) return { sent: false };
  const { y, m } = vnYmd();
  if (!(await claimLog(`birthday-digest-${y}-${m}`))) return { sent: false };

  const people = await getMonthBirthdays(m);
  if (people.length === 0) return { sent: false };

  const recipients = await resolveRecipients('birthday');
  if (recipients.length === 0) return { sent: false };

  const list = people
    .map((p) => {
      const date = `${String(p.dob_day).padStart(2, '0')}/${String(p.dob_month).padStart(2, '0')}`;
      const parts = [p.name, p.job_title_name, p.department_name, p.company_name].filter(Boolean).join(' — ');
      return `• ${date} — ${parts}${p.is_vip ? ' ⭐' : ''}`;
    })
    .join('\n');

  await notify('birthday.monthly_digest', { month: m, count: people.length, list }, { recipients: recipients.map((r) => r.id) });
  return { sent: true };
}

/** Nhắc BOD & Leader đúng ngày sinh nhật → người nhận cấu hình (1 lần/người/ngày). */
export async function runVipReminder(): Promise<{ sent: number }> {
  const cfg = await getBirthdayConfig();
  if (!cfg.enabled) return { sent: 0 };
  const { y, m, d } = vnYmd();

  const today = await getTodayBirthdays();
  const vips = today.filter((p) => p.is_vip);
  if (vips.length === 0) return { sent: 0 };

  const recipients = await resolveRecipients('birthday');
  if (recipients.length === 0) return { sent: 0 };
  const recIds = recipients.map((r) => r.id);

  let sent = 0;
  for (const v of vips) {
    if (!(await claimLog(`birthday-vip-${v.id}-${y}-${m}-${d}`))) continue;
    const deptLine = [v.department_name, v.company_name].filter(Boolean).join(' · ');
    await notify('birthday.vip_today', { userName: v.name, deptLine, relatedId: v.id }, { recipients: recIds, relatedId: v.id });
    sent++;
  }
  return { sent };
}

/** Gửi lời chúc tới người sinh nhật → lưu + Telegram thẳng (KHÔNG nhắc người cấu hình). */
export async function sendWish(fromUserId: string, toUserId: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const msg = (message || '').trim();
  if (!msg) return { ok: false, error: 'Lời chúc trống' };
  if (fromUserId === toUserId) return { ok: false, error: 'Không thể tự chúc mình' };

  // Xác nhận người nhận đúng là đang sinh nhật hôm nay
  const today = await getTodayBirthdays();
  const target = today.find((p) => p.id === toUserId);
  if (!target) return { ok: false, error: 'Hôm nay không phải sinh nhật của người này' };

  const fromUser = await queryOne<{ name: string }>(`SELECT name FROM users WHERE id::text = $1`, [fromUserId]);
  const fromName = fromUser?.name || 'Một đồng nghiệp';

  // Lưu (1 lời/người gửi/ngày) — trùng thì coi như đã gửi
  const inserted = await execute(
    `INSERT INTO birthday_wishes (from_user_id, to_user_id, message)
     VALUES ($1, $2, $3) ON CONFLICT (from_user_id, to_user_id, wish_date) DO NOTHING`,
    [fromUserId, toUserId, msg]
  );
  if (inserted === 0) return { ok: false, error: 'Bạn đã gửi lời chúc cho người này hôm nay rồi' };

  // Telegram thẳng tới người sinh nhật
  if (target.telegram_chat_id && target.telegram_enabled !== false) {
    const text = `🎂 *Bạn nhận được một lời chúc sinh nhật!*\n\n💌 *${fromName}*: ${msg}`;
    sendTelegramMessageToChat(text, target.telegram_chat_id).catch((e) => console.error('[birthday] wish telegram error:', e));
  }
  return { ok: true };
}
