/**
 * Cấp bậc chức vụ (rank) cấu hình được — bảng position_ranks (migration 298).
 * Thay cho danh sách 1–5 hardcode. Số càng nhỏ = càng cao (1 = cao nhất). Người dùng
 * thêm/bớt/đổi nhãn tuỳ ý. `positions.rank` giữ nguyên là số, ánh xạ sang các mức này.
 *
 * Slice hiện tại quản lý danh sách MẶC ĐỊNH TOÀN HỆ THỐNG (company_id IS NULL).
 */
import { query, queryOne, execute } from '@/lib/db';

export interface PositionRank {
  id: string;
  company_id: string | null;
  rank: number;
  label: string;
  description: string | null;
  color: string | null;
  is_active: boolean;
  display_order: number;
  show_in_company: boolean;
}

/** Danh sách cấp bậc đang bật, sắp theo rank tăng dần (1 trước). */
export async function listActiveRanks(): Promise<PositionRank[]> {
  return query<PositionRank>(
    `SELECT id, company_id::text AS company_id, rank, label, description, color, is_active, display_order, show_in_company
       FROM position_ranks
      WHERE company_id IS NULL AND is_active = true
      ORDER BY rank ASC, display_order ASC`
  );
}

/** Toàn bộ (gồm đã ẩn) — cho màn quản lý. */
export async function listAllRanks(): Promise<PositionRank[]> {
  return query<PositionRank>(
    `SELECT id, company_id::text AS company_id, rank, label, description, color, is_active, display_order, show_in_company
       FROM position_ranks
      WHERE company_id IS NULL
      ORDER BY rank ASC, display_order ASC`
  );
}

export async function createRank(data: {
  rank: number; label: string; description?: string | null; color?: string | null;
}): Promise<PositionRank> {
  const id = `prk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await execute(
    `INSERT INTO position_ranks (id, company_id, rank, label, description, color, is_active, display_order)
     VALUES ($1, NULL, $2, $3, $4, $5, true, $2)`,
    [id, Math.trunc(data.rank), data.label.trim(), data.description?.trim() || null, data.color || 'muted']
  );
  return (await queryOne<PositionRank>(
    `SELECT id, company_id::text AS company_id, rank, label, description, color, is_active, display_order, show_in_company
       FROM position_ranks WHERE id = $1`, [id]
  ))!;
}

export async function updateRank(id: string, data: Partial<{
  rank: number; label: string; description: string | null; color: string | null;
  is_active: boolean; show_in_company: boolean;
}>): Promise<void> {
  const sets: string[] = [];
  const params: any[] = [];
  const add = (col: string, val: any) => { params.push(val); sets.push(`${col} = $${params.length}`); };
  if (data.rank !== undefined) { add('rank', Math.trunc(data.rank)); add('display_order', Math.trunc(data.rank)); }
  if (data.label !== undefined) add('label', data.label.trim());
  if (data.description !== undefined) add('description', data.description?.trim() || null);
  if (data.color !== undefined) add('color', data.color);
  if (data.is_active !== undefined) add('is_active', data.is_active);
  if (data.show_in_company !== undefined) add('show_in_company', !!data.show_in_company);
  if (!sets.length) return;
  params.push(id);
  await execute(`UPDATE position_ranks SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
}

/** Xoá hẳn 1 mức. Không chặn theo positions đang dùng — rank chỉ là số, positions vẫn giữ số cũ. */
export async function deleteRank(id: string): Promise<void> {
  await execute(`DELETE FROM position_ranks WHERE id = $1`, [id]);
}
