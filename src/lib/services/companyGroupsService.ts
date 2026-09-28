/**
 * Nhóm/Tập đoàn/HĐQT — tầng TRÊN công ty (bảng company_groups, migration 299).
 * Thuần GOM & TRÌNH BÀY: gom công ty dưới một nhóm (nhóm lồng nhau tuỳ ý). KHÔNG chi phối vận
 * hành — chấm công/quyền vẫn theo companies.id. Chỉ super_admin/quyền tổ chức mới sửa.
 */
import { query, queryOne, execute } from '@/lib/db';

export interface CompanyGroup {
  id: string;
  name: string;
  parent_id: string | null;
  description: string | null;
  display_order: number;
  is_active: boolean;
}

export async function listGroups(): Promise<CompanyGroup[]> {
  return query<CompanyGroup>(
    `SELECT id, name, parent_id, description, display_order, is_active
       FROM company_groups WHERE is_active = true
      ORDER BY display_order ASC, name ASC`
  );
}

export async function createGroup(data: { name: string; parent_id?: string | null; description?: string | null }): Promise<CompanyGroup> {
  const id = `cg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await execute(
    `INSERT INTO company_groups (id, name, parent_id, description) VALUES ($1, $2, $3, $4)`,
    [id, data.name.trim(), data.parent_id || null, data.description?.trim() || null]
  );
  return (await queryOne<CompanyGroup>(
    `SELECT id, name, parent_id, description, display_order, is_active FROM company_groups WHERE id = $1`, [id]
  ))!;
}

export async function updateGroup(id: string, data: Partial<{ name: string; parent_id: string | null; description: string | null; display_order: number }>): Promise<void> {
  const sets: string[] = ['updated_at = NOW()']; const params: any[] = [];
  const add = (c: string, v: any) => { params.push(v); sets.push(`${c} = $${params.length}`); };
  if (data.name !== undefined) add('name', data.name.trim());
  if (data.parent_id !== undefined) add('parent_id', data.parent_id || null);
  if (data.description !== undefined) add('description', data.description?.trim() || null);
  if (data.display_order !== undefined) add('display_order', Math.trunc(data.display_order));
  params.push(id);
  await execute(`UPDATE company_groups SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
}

/** Xoá nhóm: gỡ liên kết công ty (group_id=NULL) và nhóm con (parent_id=NULL) rồi ẩn nhóm. */
export async function deleteGroup(id: string): Promise<void> {
  await execute(`UPDATE companies SET group_id = NULL WHERE group_id = $1`, [id]);
  await execute(`UPDATE company_groups SET parent_id = NULL WHERE parent_id = $1`, [id]);
  await execute(`UPDATE company_groups SET is_active = false, updated_at = NOW() WHERE id = $1`, [id]);
}

/** Gán / bỏ gán 1 công ty vào nhóm. */
export async function setCompanyGroup(companyId: string, groupId: string | null): Promise<void> {
  await execute(`UPDATE companies SET group_id = $2 WHERE id = $1::uuid`, [companyId, groupId]);
}
