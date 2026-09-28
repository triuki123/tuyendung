import { query, execute } from '@/lib/db';
import { getReminderSetting, resolveRecipients } from '@/lib/services/systemSettingsService';
import { notify } from '@/lib/notifications/engine';

function vnToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export async function runAssetMaintenanceReminders(): Promise<{ sent: number; skipped: number }> {
  const today = vnToday();
  const todayMs = new Date(today + 'T00:00:00+07:00').getTime();
  const { milestones } = await getReminderSetting('asset_maintenance');

  // Người nhận nhắc tài sản không có người dùng — theo quy tắc cấu hình (DEFAULT khớp cũ)
  const admins = (await resolveRecipients('asset_maintenance')).map(r => ({
    id: r.id,
    telegram_chat_id: r.telegram_chat_id,
    telegram_enabled: !!r.telegram_enabled,
  }));

  type AssetRow = {
    id: string; name: string; code: string;
    warranty_expiry: string | null;
    next_maintenance_date: string | null;
    assigned_to: string | null; assigned_to_name: string | null;
    telegram_chat_id: string | null; telegram_enabled: boolean;
  };

  const assets = await query<AssetRow>(
    `SELECT
       a.id, a.name, a.code, a.warranty_expiry, a.next_maintenance_date,
       a.assigned_to, a.assigned_to_name,
       u.telegram_chat_id, u.telegram_enabled
     FROM assets a
     LEFT JOIN users u ON u.id::text = a.assigned_to::text AND u.status = 'active'
     WHERE a.warranty_expiry IS NOT NULL OR a.next_maintenance_date IS NOT NULL`
  );

  let sent = 0;
  let skipped = 0;

  for (const a of assets) {
    const checks: Array<{ type: 'warranty' | 'maintenance'; date: string; label: string }> = [];
    if (a.warranty_expiry) checks.push({ type: 'warranty', date: a.warranty_expiry, label: 'Bảo hành' });
    if (a.next_maintenance_date) checks.push({ type: 'maintenance', date: a.next_maintenance_date, label: 'Bảo trì' });

    for (const c of checks) {
      const dateMs = new Date(c.date + 'T00:00:00+07:00').getTime();
      const daysUntil = Math.round((dateMs - todayMs) / 86_400_000);
      if (!milestones.includes(daysUntil)) continue;

      const ins = await execute(
        `INSERT INTO asset_reminder_log (asset_id, reminder_type, milestone_days, sent_date)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (asset_id, reminder_type, milestone_days, sent_date) DO NOTHING`,
        [a.id, c.type, daysUntil, today]
      );
      if ((ins as any).rowCount === 0) { skipped++; continue; }

      const dateFmt = c.date.split('-').reverse().join('/');
      const targetIds: string[] = [];
      if (a.assigned_to) targetIds.push(a.assigned_to);
      for (const adm of admins) if (!targetIds.includes(adm.id)) targetIds.push(adm.id);

      await notify('asset.maintenanceDue', {
        reminderType: c.label, reminderTypeLower: c.label.toLowerCase(),
        daysUntil, assetCode: a.code, assetName: a.name, dateFmt,
      }, { recipients: targetIds, relatedId: a.id });

      sent++;
    }
  }

  console.log(`[AssetMaintenanceReminder] ${sent} gửi, ${skipped} bỏ qua`);
  return { sent, skipped };
}
