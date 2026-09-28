import { query, execute } from '@/lib/db';
import { notify } from '@/lib/notifications/engine';
import { getModulePermissionHoldersByCompany } from '@/lib/services/notificationsService';

function vnToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export async function runOnboardingChecklistReminders(): Promise<{ sent: number; skipped: number }> {
  const today = vnToday();

  // Submission chưa được xử lý sau 2 ngày
  type SubRow = {
    id: string;
    candidate_name: string;
    candidate_email: string;
    status: string;
    invited_by: string | null;
    invited_by_name: string | null;
    company_id: string | null;
    days_pending: number;
    inviter_telegram_chat_id: string | null;
    inviter_telegram_enabled: boolean;
  };

  const subs = await query<SubRow>(
    `SELECT
       os.id,
       os.candidate_name,
       os.candidate_email,
       os.status,
       os.invited_by,
       os.data->>'company_id' AS company_id,
       u.name     AS invited_by_name,
       u.telegram_chat_id  AS inviter_telegram_chat_id,
       u.telegram_enabled  AS inviter_telegram_enabled,
       EXTRACT(EPOCH FROM (NOW() - os.created_at)) / 86400 AS days_pending
     FROM onboarding_submissions os
     LEFT JOIN users u ON u.id::text = os.invited_by::text
     WHERE os.status IN ('pending', 'submitted', 'confirmed')
       AND os.expires_at > NOW()
       AND os.created_at < NOW() - INTERVAL '2 days'`
  );

  // Không có người mời → nhắc người giữ quyền hr-resources SCOPE theo công ty của
  // hồ sơ (chưa xác định công ty ⇒ chỉ quyền module + super_admin, không bắn mọi admin).
  const fallbackIdsByCompany = new Map<string, string[]>();
  const fallbackRecipients = async (companyId: string | null): Promise<string[]> => {
    const key = companyId || '';
    if (!fallbackIdsByCompany.has(key)) {
      fallbackIdsByCompany.set(
        key,
        await getModulePermissionHoldersByCompany('hr-resources', ['view', 'edit', 'approve'], companyId),
      );
    }
    return fallbackIdsByCompany.get(key)!;
  };

  let sent = 0;
  let skipped = 0;

  for (const sub of subs) {
    const ins = await execute(
      `INSERT INTO onboarding_reminder_log (submission_id, sent_date)
       VALUES ($1, $2)
       ON CONFLICT (submission_id, sent_date) DO NOTHING`,
      [sub.id, today]
    );
    if ((ins as any).rowCount === 0) { skipped++; continue; }

    const daysPending = Math.floor(Number(sub.days_pending));
    const statusLabel =
      sub.status === 'pending' ? 'chờ ứng viên điền form' :
      sub.status === 'submitted' ? 'chờ HR xác nhận' :
      'chờ Admin duyệt';

    // Nhắc người mời; không có thì người giữ quyền hr-resources cùng công ty
    const targetIds = sub.invited_by ? [sub.invited_by] : await fallbackRecipients(sub.company_id);

    await notify('onboarding.checklistOverdue', {
      daysPending, candidateName: sub.candidate_name, candidateEmail: sub.candidate_email, statusLabel,
    }, { recipients: targetIds, relatedId: sub.id });

    sent++;
  }

  console.log(`[OnboardingChecklistReminder] ${sent} gửi, ${skipped} bỏ qua`);
  return { sent, skipped };
}
