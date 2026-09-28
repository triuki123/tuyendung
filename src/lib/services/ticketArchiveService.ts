import { query, execute } from '@/lib/db';
import { getTicketConfig } from '@/lib/services/systemSettingsService';

/**
 * Tự động lưu trữ ticket đã kết thúc quá N ngày (cấu hình).
 *
 * Trạng thái kết thúc gồm: completed/resolved (hoàn thành), rejected (hủy),
 * closed (đã đóng). Mốc tính theo `updated_at` (lần cập nhật trạng thái gần nhất).
 * Đánh dấu `archived_at` để ẩn khỏi danh sách chính. Ghi audit event cho mỗi ticket.
 */
export async function runTicketAutoArchive(): Promise<{ archived: number }> {
  const { autoArchiveDays } = await getTicketConfig();
  const tickets = await query<{ id: string; code: string; status: string }>(
    `SELECT id, code, status
       FROM tickets
      WHERE archived_at IS NULL
        AND status IN ('completed', 'resolved', 'rejected', 'closed')
        AND updated_at < NOW() - make_interval(days => $1)`,
    [autoArchiveDays]
  );

  if (tickets.length === 0) return { archived: 0 };

  for (const t of tickets) {
    await execute(
      `UPDATE tickets SET archived_at = NOW() WHERE id::text = $1`,
      [t.id]
    );

    const auditId = `tae_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await execute(
      `INSERT INTO ticket_audit_events
         (id, ticket_id, event_type, actor_id, actor_name, metadata, created_at)
       VALUES ($1, $2, 'archived', 'system', 'Hệ Thống', $3::jsonb, NOW())`,
      [
        auditId,
        t.id,
        JSON.stringify({
          status: t.status,
          reason: `Tự động lưu trữ sau ${autoArchiveDays} ngày kết thúc`,
        }),
      ]
    );
  }

  console.log(
    `[TicketAutoArchive] Đã lưu trữ ${tickets.length} ticket: ${tickets.map((t) => t.code).join(', ')}`
  );
  return { archived: tickets.length };
}
