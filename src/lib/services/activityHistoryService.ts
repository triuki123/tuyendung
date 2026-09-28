import { query } from '@/lib/db';

export interface ActivityEvent {
  id: string;
  type: 'login' | 'audit' | 'task_assigned' | 'task_mention' | 'ticket_assigned' | 'ticket_mention';
  title: string;
  description: string | null;
  related_id: string | null;
  related_url: string | null;
  actor_name: string | null;
  created_at: string;
}

/** Lịch sử hoạt động cá nhân của user */
export async function getUserActivityHistory(
  userId: string,
  options?: { limit?: number; type?: string }
): Promise<ActivityEvent[]> {
  const limit = options?.limit ?? 100;

  // 1. Audit logs do chính user thực hiện
  const auditEvents = await query<ActivityEvent>(
    `SELECT
       al.id,
       'audit'::text   AS type,
       al.action::text AS title,
       al.details::text AS description,
       NULL          AS related_id,
       NULL          AS related_url,
       u.name        AS actor_name,
       al.timestamp  AS created_at
     FROM audit_logs al
     LEFT JOIN users u ON u.id::text = al."performedBy"::text
     WHERE al."userId" = $1
     ORDER BY al.timestamp DESC
     LIMIT $2`,
    [userId, limit]
  );

  // 2. Task được giao cho user
  const taskAssigned = await query<ActivityEvent>(
    `SELECT
       ta.id,
       'task_assigned'::text    AS type,
       t.title::text            AS title,
       'Bạn được giao task này' AS description,
       ta.task_id               AS related_id,
       '/tasks'                 AS related_url,
       creator.name             AS actor_name,
       ta.created_at
     FROM task_assignees ta
     JOIN tasks t ON t.id = ta.task_id
     LEFT JOIN users creator ON creator.id::text = t.created_by::text
     WHERE ta.user_id = $1
     ORDER BY ta.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );

  // 3. Được mention trong task comment
  const taskMentions = await query<ActivityEvent>(
    `SELECT
       tcm.comment_id           AS id,
       'task_mention'::text     AS type,
       t.title::text            AS title,
       tc.content::text         AS description,
       tc.task_id               AS related_id,
       '/tasks'                 AS related_url,
       u.name                   AS actor_name,
       tc.created_at
     FROM task_comment_mentions tcm
     JOIN task_comments tc ON tc.id = tcm.comment_id
     JOIN tasks t ON t.id = tc.task_id
     LEFT JOIN users u ON u.id::text = tc.user_id::text
     WHERE tcm.mentioned_user_id = $1
       AND tc.deleted_at IS NULL
     ORDER BY tc.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );

  // 4. Ticket được giao cho user
  const ticketAssigned = await query<ActivityEvent>(
    `SELECT
       tsh.id,
       'ticket_assigned'::text      AS type,
       tk.title::text               AS title,
       'Ticket được giao cho bạn'   AS description,
       tsh.ticket_id                AS related_id,
       '/tickets'                   AS related_url,
       u.name                       AS actor_name,
       tsh.created_at
     FROM ticket_status_history tsh
     JOIN tickets tk ON tk.id = tsh.ticket_id
     LEFT JOIN users u ON u.id::text = tsh.changed_by::text
     WHERE tk.assigned_to = $1
       AND tsh.new_status = 'in_progress'
     ORDER BY tsh.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );

  // 5. Được mention trong ticket comment
  const ticketMentions = await query<ActivityEvent>(
    `SELECT
       tcm.comment_id           AS id,
       'ticket_mention'::text   AS type,
       tk.title::text           AS title,
       tc.content::text         AS description,
       tc.ticket_id             AS related_id,
       '/tickets'               AS related_url,
       u.name                   AS actor_name,
       tc.created_at
     FROM ticket_comment_mentions tcm
     JOIN ticket_comments tc ON tc.id = tcm.comment_id
     JOIN tickets tk ON tk.id = tc.ticket_id
     LEFT JOIN users u ON u.id::text = tc.user_id::text
     WHERE tcm.mentioned_user_id = $1
       AND tc.deleted_at IS NULL
     ORDER BY tc.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );

  // Gộp và sort theo thời gian giảm dần
  const all = [
    ...auditEvents,
    ...taskAssigned,
    ...taskMentions,
    ...ticketAssigned,
    ...ticketMentions,
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Lọc theo type nếu có
  const filtered = options?.type ? all.filter((e) => e.type === options.type) : all;

  return filtered.slice(0, limit);
}
