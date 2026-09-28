import { query, execute } from '@/lib/db';
import { notify } from '@/lib/notifications/engine';

function vnToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

type ReminderItem = {
  id: string;
  title: string;
  due_date: string;
  assigned_to: string;
  telegram_chat_id: string | null;
  telegram_enabled: boolean;
  related_type: 'task' | 'ticket';
};

export async function runTaskOverdueReminders(): Promise<{ sent: number; skipped: number }> {
  const today = vnToday();

  const tasks = await query<ReminderItem>(
    `SELECT
       t.id, t.title, t.due_date, t.assigned_to,
       u.telegram_chat_id, u.telegram_enabled,
       'task'::text AS related_type
     FROM tasks t
     JOIN users u ON u.id::text = t.assigned_to::text AND u.status = 'active'
     WHERE t.due_date IS NOT NULL
       AND t.due_date <= $1
       AND t.status NOT IN ('done', 'archived')
       AND t.archived_at IS NULL`,
    [today]
  );

  const tickets = await query<ReminderItem>(
    `SELECT
       t.id::text AS id, t.title, t.due_date, t.assigned_to,
       u.telegram_chat_id, u.telegram_enabled,
       'ticket'::text AS related_type
     FROM tickets t
     JOIN users u ON u.id::text = t.assigned_to::text AND u.status = 'active'
     WHERE t.due_date IS NOT NULL
       AND t.due_date <= $1
       AND t.status NOT IN ('resolved', 'closed')`,
    [today]
  );

  const items = [...tasks, ...tickets];
  let sent = 0;
  let skipped = 0;

  for (const item of items) {
    const ins = await execute(
      `INSERT INTO task_reminder_log (related_id, related_type, sent_date)
       VALUES ($1, $2, $3)
       ON CONFLICT (related_id, related_type, sent_date) DO NOTHING`,
      [item.id, item.related_type, today]
    );
    if ((ins as any).rowCount === 0) { skipped++; continue; }

    const isToday = item.due_date === today;
    const dueFmt = item.due_date.split('-').reverse().join('/');
    const eventKey = item.related_type === 'task' ? 'task.overdue' : 'ticket.overdue';
    await notify(eventKey, {
      state: isToday ? 'today' : 'overdue', itemTitle: item.title, dueFmt,
    }, { recipients: [item.assigned_to], relatedId: item.id });

    sent++;
  }

  console.log(`[TaskOverdueReminder] ${sent} gửi, ${skipped} bỏ qua (${tasks.length} tasks + ${tickets.length} tickets)`);
  return { sent, skipped };
}
