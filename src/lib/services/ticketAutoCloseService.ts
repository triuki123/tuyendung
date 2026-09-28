import { query, execute } from '@/lib/db';
import { getTicketConfig } from '@/lib/services/systemSettingsService';

/**
 * Tự động đóng ticket đã "resolved" hoặc "rejected" quá N ngày (cấu hình) mà không có phản hồi.
 * Ghi audit log cho mỗi ticket bị đóng.
 */
export async function runTicketAutoClose(): Promise<{ closed: number }> {
  const { autoCloseDays } = await getTicketConfig();
  const tickets = await query<{ id: string; code: string; title: string }>(
    `SELECT id, code, title
       FROM tickets
      WHERE status IN ('resolved', 'rejected')
        AND updated_at < NOW() - make_interval(days => $1)`,
    [autoCloseDays]
  );

  if (tickets.length === 0) return { closed: 0 };

  for (const t of tickets) {
    await execute(
      `UPDATE tickets SET status = 'closed', updated_at = NOW() WHERE id::text = $1`,
      [t.id]
    );

    const auditId = `tae_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await execute(
      `INSERT INTO ticket_audit_events
         (id, ticket_id, event_type, actor_id, actor_name, metadata, created_at)
       VALUES ($1, $2, 'status_changed', NULL, 'Hệ Thống',
               $3::jsonb, NOW())`,
      [
        auditId,
        t.id,
        JSON.stringify({
          from: 'resolved/rejected',
          to: 'closed',
          reason: `Tự động đóng sau ${autoCloseDays} ngày không có phản hồi`,
        }),
      ]
    );
  }

  console.log(`[TicketAutoClose] Đã đóng ${tickets.length} ticket: ${tickets.map((t) => t.code).join(', ')}`);
  return { closed: tickets.length };
}
