/**
 * Permission Preset Service — quyền mẫu tùy chỉnh.
 * Admin lưu một bộ quyền (module mẹ + con) thành mẫu đặt tên, áp dụng lại cho người dùng.
 */

import { query, queryOne, execute } from '@/lib/db';
import { UserModulePermissions, getDefaultPermissions } from '@/lib/modules';

export interface PermissionPreset {
  id: string;
  name: string;
  description: string | null;
  permissions: UserModulePermissions;
  is_system: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function genId(): string {
  return `pp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** 4 mẫu mặc định theo vai trò (snapshot từ getDefaultPermissions tại thời điểm seed). */
const DEFAULT_PRESETS: { role: 'super_admin' | 'admin' | 'manager' | 'user'; name: string; description: string; sort: number }[] = [
  { role: 'super_admin', name: 'Toàn quyền', description: 'Mẫu mặc định: toàn quyền mọi module', sort: 1 },
  { role: 'admin', name: 'Quản trị', description: 'Mẫu mặc định: quản trị (trừ xóa & cài đặt)', sort: 2 },
  { role: 'manager', name: 'Quản lý', description: 'Mẫu mặc định: quản lý cấp trung', sort: 3 },
  { role: 'user', name: 'Nhân viên', description: 'Mẫu mặc định: chỉ xem', sort: 4 },
];

/** Danh sách mẫu — hệ thống trước (theo sort), rồi mẫu tùy chỉnh (mới nhất trước). */
export async function listPresets(): Promise<PermissionPreset[]> {
  return query<PermissionPreset>(
    `SELECT id, name, description, permissions, is_system, sort_order, created_by, created_at, updated_at
     FROM permission_presets
     ORDER BY is_system DESC, sort_order ASC, created_at DESC`
  );
}

/**
 * Tạo 4 mẫu mặc định (idempotent theo tên). Dùng cho lần khởi tạo & nút "Khôi phục mẫu gốc".
 * Nếu mẫu cùng tên đã tồn tại thì bỏ qua (không ghi đè chỉnh sửa của người dùng).
 */
export async function seedDefaultPresets(createdBy?: string | null): Promise<number> {
  let added = 0;
  for (const d of DEFAULT_PRESETS) {
    const exists = await queryOne<{ id: string }>('SELECT id FROM permission_presets WHERE LOWER(name) = LOWER($1)', [d.name]);
    if (exists) continue;
    await execute(
      `INSERT INTO permission_presets (id, name, description, permissions, is_system, sort_order, created_by)
       VALUES ($1, $2, $3, $4, true, $5, $6)`,
      [genId(), d.name, d.description, JSON.stringify(getDefaultPermissions(d.role)), d.sort, createdBy || null]
    );
    added++;
  }
  return added;
}

/** Seed mặc định CHỈ khi bảng hoàn toàn trống (lần đầu khởi tạo). */
export async function ensureDefaultPresets(): Promise<void> {
  const cnt = await queryOne<{ n: string }>('SELECT COUNT(*) AS n FROM permission_presets');
  if (Number(cnt?.n || 0) === 0) await seedDefaultPresets();
}

/** Tạo mẫu mới từ bộ quyền hiện tại. */
export async function createPreset(input: {
  name: string;
  description?: string | null;
  permissions: UserModulePermissions;
  createdBy?: string | null;
}): Promise<PermissionPreset> {
  const name = input.name.trim();
  if (!name) throw new Error('Thiếu tên mẫu');
  const exists = await queryOne<{ id: string }>('SELECT id FROM permission_presets WHERE LOWER(name) = LOWER($1)', [name]);
  if (exists) throw new Error('Đã có mẫu trùng tên');
  const row = await queryOne<PermissionPreset>(
    `INSERT INTO permission_presets (id, name, description, permissions, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [genId(), name, input.description?.trim() || null, JSON.stringify(input.permissions || {}), input.createdBy || null]
  );
  if (!row) throw new Error('Không tạo được mẫu');
  return row;
}

/** Cập nhật mẫu (đổi tên/mô tả hoặc ghi đè bộ quyền). */
export async function updatePreset(
  id: string,
  input: { name?: string; description?: string | null; permissions?: UserModulePermissions }
): Promise<PermissionPreset | null> {
  const sets: string[] = ['updated_at = NOW()'];
  const params: any[] = [];
  let i = 1;
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error('Tên mẫu không được rỗng');
    const dup = await queryOne<{ id: string }>('SELECT id FROM permission_presets WHERE LOWER(name) = LOWER($1) AND id <> $2', [name, id]);
    if (dup) throw new Error('Đã có mẫu trùng tên');
    sets.push(`name = $${i++}`); params.push(name);
  }
  if (input.description !== undefined) { sets.push(`description = $${i++}`); params.push(input.description?.trim() || null); }
  if (input.permissions !== undefined) { sets.push(`permissions = $${i++}`); params.push(JSON.stringify(input.permissions)); }
  params.push(id);
  return queryOne<PermissionPreset>(
    `UPDATE permission_presets SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    params
  );
}

/** Xóa mẫu. */
export async function deletePreset(id: string): Promise<void> {
  await execute('DELETE FROM permission_presets WHERE id = $1', [id]);
}
