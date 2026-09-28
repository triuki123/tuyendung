import { query } from '@/lib/db';

/**
 * Tìm kiếm toàn cục (global search) — gộp nhiều loại thực thể vào 1 kết quả.
 * Lọc theo quyền: super_admin/admin/manager xem rộng, user thường chỉ thấy của mình.
 * Read-only, mỗi nhóm LIMIT nhỏ để dropdown gọn.
 */

export type SearchType = 'asset' | 'ticket' | 'user' | 'task' | 'document';

export interface SearchResult {
  type: SearchType;
  id: string;
  label: string;
  sublabel?: string | null;
  url: string;
}

export interface SearchContext {
  userId: string;
  role: string; // super_admin | admin | manager | user
}

const PER_GROUP = 6;

function isPrivileged(role: string): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'manager';
}

/** Tìm tài sản (phần cứng) theo tên/mã. */
async function searchAssets(like: string, ctx: SearchContext): Promise<SearchResult[]> {
  const params: any[] = [like];
  let scope = '';
  if (!isPrivileged(ctx.role)) {
    params.push(ctx.userId);
    scope = `AND a.assigned_to::text = $${params.length}`;
  }
  const rows = await query<any>(
    `SELECT a.id::text AS id, a.code, a.name,
            COALESCE(ac.name, a.category) AS category_name
       FROM assets a
       LEFT JOIN asset_categories ac ON ac.id::text = a.category::text
      WHERE (a.name ILIKE $1 OR a.code ILIKE $1 OR a.serial_number ILIKE $1)
        ${scope}
      ORDER BY a.name ASC
      LIMIT ${PER_GROUP}`,
    params,
  ).catch(() => [] as any[]);
  return rows.map((r) => ({
    type: 'asset' as const,
    id: r.id,
    label: r.name || r.code || 'Tài sản',
    sublabel: [r.code, r.category_name].filter(Boolean).join(' · ') || null,
    url: `/asset-management?assetId=${encodeURIComponent(r.id)}`,
  }));
}

/** Tìm ticket theo tiêu đề/mã. */
async function searchTickets(like: string, ctx: SearchContext): Promise<SearchResult[]> {
  const params: any[] = [like];
  let scope = '';
  if (!isPrivileged(ctx.role)) {
    params.push(ctx.userId);
    scope = `AND (t.created_by::text = $${params.length} OR t.assigned_to::text = $${params.length})`;
  }
  const rows = await query<any>(
    `SELECT t.id::text AS id, t.code, t.title, t.status
       FROM tickets t
      WHERE (t.title ILIKE $1 OR t.code ILIKE $1 OR t.asset_code ILIKE $1)
        ${scope}
      ORDER BY t.created_at DESC NULLS LAST
      LIMIT ${PER_GROUP}`,
    params,
  ).catch(() => [] as any[]);
  return rows.map((r) => ({
    type: 'ticket' as const,
    id: r.id,
    label: r.title || r.code || 'Ticket',
    sublabel: [r.code, r.status].filter(Boolean).join(' · ') || null,
    url: `/tickets/admin?ticketId=${encodeURIComponent(r.id)}`,
  }));
}

/** Tìm người dùng theo tên/email (danh bạ nội bộ — mọi vai trò). */
async function searchUsers(like: string): Promise<SearchResult[]> {
  const rows = await query<any>(
    `SELECT u.id::text AS id, u.name, u.email, u.role
       FROM users u
      WHERE u.status = 'active'
        AND (u.name ILIKE $1 OR u.email ILIKE $1)
      ORDER BY u.name ASC
      LIMIT ${PER_GROUP}`,
    [like],
  ).catch(() => [] as any[]);
  return rows.map((r) => ({
    type: 'user' as const,
    id: r.id,
    label: r.name || r.email || 'Người dùng',
    sublabel: r.email || null,
    url: `/users?userId=${encodeURIComponent(r.id)}`,
  }));
}

/** Tìm công việc theo tiêu đề/mã. */
async function searchTasks(like: string, ctx: SearchContext): Promise<SearchResult[]> {
  const params: any[] = [like];
  let scope = '';
  if (!isPrivileged(ctx.role)) {
    params.push(ctx.userId);
    scope = `AND (tk.assigned_to::text = $${params.length} OR tk.created_by::text = $${params.length})`;
  }
  const rows = await query<any>(
    `SELECT tk.id::text AS id, tk.code, tk.title, tk.status
       FROM tasks tk
      WHERE (tk.title ILIKE $1 OR tk.code ILIKE $1)
        ${scope}
      ORDER BY tk.created_at DESC NULLS LAST
      LIMIT ${PER_GROUP}`,
    params,
  ).catch(() => [] as any[]);
  return rows.map((r) => ({
    type: 'task' as const,
    id: r.id,
    label: r.title || r.code || 'Công việc',
    sublabel: [r.code, r.status].filter(Boolean).join(' · ') || null,
    url: `/tasks?taskId=${encodeURIComponent(r.id)}`,
  }));
}

/** Tìm văn bản theo tiêu đề/số hiệu. */
async function searchDocuments(like: string): Promise<SearchResult[]> {
  const rows = await query<any>(
    `SELECT d.id::text AS id, d.title, d.doc_number, d.doc_type
       FROM documents d
      WHERE d.status = 'active'
        AND (d.title ILIKE $1 OR d.doc_number ILIKE $1)
      ORDER BY d.issued_date DESC NULLS LAST
      LIMIT ${PER_GROUP}`,
    [like],
  ).catch(() => [] as any[]);
  return rows.map((r) => ({
    type: 'document' as const,
    id: r.id,
    label: r.title || r.doc_number || 'Văn bản',
    sublabel: [r.doc_number, r.doc_type].filter(Boolean).join(' · ') || null,
    url: `/tra-cuu/van-ban?docId=${encodeURIComponent(r.id)}`,
  }));
}

/**
 * Chạy song song mọi nhóm tìm kiếm, trả về kết quả đã gộp.
 */
export async function globalSearch(q: string, ctx: SearchContext): Promise<SearchResult[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const like = `%${term}%`;

  const [assets, tickets, users, tasks, documents] = await Promise.all([
    searchAssets(like, ctx),
    searchTickets(like, ctx),
    searchUsers(like),
    searchTasks(like, ctx),
    searchDocuments(like),
  ]);

  return [...assets, ...tickets, ...users, ...tasks, ...documents];
}
