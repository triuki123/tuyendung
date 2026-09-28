import { query, execute } from '@/lib/db';
import { getReminderSetting } from '@/lib/services/systemSettingsService';
import { notify } from '@/lib/notifications/engine';
import { resolveAttendanceConfigForUser } from '@/lib/services/attendanceSettingsService';

function vnToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export async function runLeaveBalanceReminders(): Promise<{ sent: number; skipped: number }> {
  const today = vnToday();
  const year = parseInt(today.slice(0, 4));

  const todayMs = new Date(today + 'T00:00:00+07:00').getTime();
  const { milestones } = await getReminderSetting('leave_balance');

  // Người dùng đã nhận phép chuyển năm trong năm hiện tại
  const users = await query<{
    user_id: string;
    name: string;
    carryover_days: number;
    telegram_chat_id: string;
    telegram_enabled: boolean;
  }>(
    `SELECT
       u.id                  AS user_id,
       u.name,
       u.telegram_chat_id,
       u.telegram_enabled,
       SUM(lt.amount)        AS carryover_days
     FROM users u
     JOIN leave_transactions lt ON lt.user_id = u.id
       AND lt.year = $1
       AND lt.source = 'carryover_in'
     WHERE u.status = 'active'
     GROUP BY u.id, u.name, u.telegram_chat_id, u.telegram_enabled
     HAVING SUM(lt.amount) > 0`,
    [year]
  );

  let sent = 0;
  let skipped = 0;

  for (const u of users) {
    const config = await resolveAttendanceConfigForUser(u.user_id, today);
    const mmdd = config.annualLeavePolicy.carryoverExpiryMMDD || '03-31';
    const [mm, dd] = mmdd.split('-');
    const expiryDate = `${year}-${mm}-${dd}`;
    const expiryMs = new Date(expiryDate + 'T00:00:00+07:00').getTime();
    const daysUntil = Math.round((expiryMs - todayMs) / 86_400_000);
    if (!config.annualLeavePolicy.enabled || !milestones.includes(daysUntil)) continue;

    const existing = await execute(
      `INSERT INTO leave_balance_reminder_log (user_id, year, milestone_days, sent_date)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, year, milestone_days) DO NOTHING`,
      [u.user_id, year, daysUntil, today]
    );
    if ((existing as any).rowCount === 0) { skipped++; continue; }

    const days = Math.round(Number(u.carryover_days) * 10) / 10;
    const expiryFmt = `${dd}/${mm}/${year}`;
    await notify('leave.balanceExpiring', { daysLeft: daysUntil, days, expiryFmt }, { recipients: [u.user_id] });
    sent++;
  }

  console.log(`[LeaveBalanceReminder] ${sent} gửi, ${skipped} bỏ qua`);
  return { sent, skipped };
}
