/**
 * Cây đơn vị tổng quát (org_units) — nguồn chân lý MỚI cho cấu trúc tổ chức, sâu tuỳ ý.
 * GIAI ĐOẠN 1: org_units là lớp cấu trúc; các cột legacy (company/department/sub) vẫn được
 * giữ hợp lệ qua RESOLVER khi gán người ⇒ 175 file cũ không đổi hành vi.
 *
 * Quy ước: level_rank nhỏ = cao (1 = cao nhất). id do app sinh (TEXT). Node backfill mang
 * legacy_kind/legacy_id trỏ về hàng companies/departments/sub_departments gốc.
 */
import { query, queryOne, execute } from '@/lib/db';

export interface OrgUnit {
  id: string;
  company_id: string;
  parent_id: string | null;
  level_rank: number;
  name: string;
  code: string | null;
  manager_id: string | null;
  display_order: number;
  is_active: boolean;
  legacy_kind: string | null;
  legacy_id: string | null;
}

export interface OrgUnitLevel {
  id: string;
  company_id: string | null;
  rank: number;
  name: string;
  is_active: boolean;
}

const SELECT_UNIT =
  `id, company_id::text AS company_id, parent_id, level_rank, name, code,
   manager_id::text AS manager_id, display_order, is_active,
   legacy_kind, legacy_id::text AS legacy_id`;

/** Toàn bộ đơn vị đang bật của 1 công ty (client tự dựng cây). */
export async function listUnitsByCompany(companyId: string): Promise<OrgUnit[]> {
  return query<OrgUnit>(
    `SELECT ${SELECT_UNIT} FROM org_units
      WHERE company_id = $1::uuid AND is_active = true
      ORDER BY level_rank ASC, display_order ASC, name ASC`,
    [companyId]
  );
}

// ─── Cấu hình TẦNG ───────────────────────────────────────────────────────────
export async function listLevels(): Promise<OrgUnitLevel[]> {
  return query<OrgUnitLevel>(
    `SELECT id, company_id::text AS company_id, rank, name, is_active
       FROM org_unit_levels WHERE company_id IS NULL AND is_active = true
      ORDER BY rank ASC`
  );
}
export async function createLevel(rank: number, name: string): Promise<void> {
  const id = `oul_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await execute(
    `INSERT INTO org_unit_levels (id, company_id, rank, name) VALUES ($1, NULL, $2, $3)`,
    [id, Math.trunc(rank), name.trim()]
  );
}
export async function updateLevel(id: string, data: Partial<{ rank: number; name: string; is_active: boolean }>): Promise<void> {
  const sets: string[] = []; const params: any[] = [];
  const add = (c: string, v: any) => { params.push(v); sets.push(`${c} = $${params.length}`); };
  if (data.rank !== undefined) add('rank', Math.trunc(data.rank));
  if (data.name !== undefined) add('name', data.name.trim());
  if (data.is_active !== undefined) add('is_active', data.is_active);
  if (!sets.length) return;
  params.push(id);
  await execute(`UPDATE org_unit_levels SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
}
export async function deleteLevel(id: string): Promise<void> {
  await execute(`DELETE FROM org_unit_levels WHERE id = $1`, [id]);
}

// ─── CRUD đơn vị ─────────────────────────────────────────────────────────────
export async function createUnit(data: {
  company_id: string; parent_id: string | null; level_rank: number; name: string;
  code?: string | null; manager_id?: string | null;
}): Promise<OrgUnit> {
  const id = `ou_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await execute(
    `INSERT INTO org_units (id, company_id, parent_id, level_rank, name, code, manager_id)
     VALUES ($1, $2::uuid, $3, $4, $5, $6, $7::uuid)`,
    [id, data.company_id, data.parent_id, Math.trunc(data.level_rank), data.name.trim(),
     data.code?.trim() || null, data.manager_id || null]
  );
  return (await queryOne<OrgUnit>(`SELECT ${SELECT_UNIT} FROM org_units WHERE id = $1`, [id]))!;
}

export async function updateUnit(id: string, data: Partial<{
  parent_id: string | null; level_rank: number; name: string; code: string | null;
  manager_id: string | null; display_order: number;
}>): Promise<void> {
  const sets: string[] = ['updated_at = NOW()']; const params: any[] = [];
  const add = (c: string, v: any, cast = '') => { params.push(v); sets.push(`${c} = $${params.length}${cast}`); };
  if (data.parent_id !== undefined) add('parent_id', data.parent_id);
  if (data.level_rank !== undefined) add('level_rank', Math.trunc(data.level_rank));
  if (data.name !== undefined) add('name', data.name.trim());
  if (data.code !== undefined) add('code', data.code?.trim() || null);
  if (data.manager_id !== undefined) add('manager_id', data.manager_id || null, '::uuid');
  if (data.display_order !== undefined) add('display_order', Math.trunc(data.display_order));
  params.push(id);
  await execute(`UPDATE org_units SET ${sets.join(', ')} WHERE id = $${params.length}`, params);

  // Dual-write NGƯỢC tên/manager về legacy nếu node có gốc legacy (giữ 2 nơi khớp).
  const u = await queryOne<{ legacy_kind: string | null; legacy_id: string | null }>(
    `SELECT legacy_kind, legacy_id::text AS legacy_id FROM org_units WHERE id = $1`, [id]
  );
  if (u?.legacy_id && (data.name !== undefined || data.manager_id !== undefined)) {
    const tbl = u.legacy_kind === 'company' ? 'companies' : u.legacy_kind === 'department' ? 'departments' : u.legacy_kind === 'sub' ? 'sub_departments' : null;
    if (tbl) {
      const s: string[] = []; const p: any[] = [];
      if (data.name !== undefined) { p.push(data.name.trim()); s.push(`name = $${p.length}`); }
      if (data.manager_id !== undefined && tbl !== 'companies') { p.push(data.manager_id || null); s.push(`manager_id = $${p.length}::uuid`); }
      if (s.length) { p.push(u.legacy_id); await execute(`UPDATE ${tbl} SET ${s.join(', ')} WHERE id = $${p.length}::uuid`, p); }
    }
  }
}

/** Xoá đơn vị. Chặn khi còn con hoặc còn người đang gán (an toàn). */
export async function deleteUnit(id: string): Promise<{ ok: boolean; error?: string }> {
  const kids = await queryOne<{ n: string }>(`SELECT COUNT(*)::text AS n FROM org_units WHERE parent_id = $1 AND is_active = true`, [id]);
  if (Number(kids?.n || 0) > 0) return { ok: false, error: 'Đơn vị còn đơn vị con — hãy xoá/di chuyển con trước' };
  const people = await queryOne<{ n: string }>(`SELECT COUNT(*)::text AS n FROM users WHERE org_unit_id = $1 AND status = 'active'`, [id]);
  if (Number(people?.n || 0) > 0) return { ok: false, error: 'Đơn vị còn nhân sự đang gán — hãy chuyển người trước' };
  await execute(`UPDATE org_units SET is_active = false, updated_at = NOW() WHERE id = $1`, [id]);
  return { ok: true };
}

/**
 * RESOLVER legacy: từ 1 đơn vị, tính (company_id, department_id, sub_department_id) hợp lệ =
 * tổ tiên GẦN NHẤT có gốc legacy tương ứng. Đơn vị tầng sâu (không map trực tiếp) sẽ rơi về
 * bộ phận/phòng tổ tiên gần nhất; nếu không có thì để null (coi như cấp công ty).
 */
export async function resolveLegacyForUnit(unitId: string): Promise<{
  company_id: string | null; department_id: string | null; sub_department_id: string | null;
}> {
  const rows = await query<{ legacy_kind: string | null; legacy_id: string | null; company_id: string }>(
    `WITH RECURSIVE chain AS (
       SELECT id, parent_id, company_id, legacy_kind, legacy_id, 0 AS depth
         FROM org_units WHERE id = $1
       UNION ALL
       SELECT o.id, o.parent_id, o.company_id, o.legacy_kind, o.legacy_id, c.depth + 1
         FROM org_units o JOIN chain c ON o.id = c.parent_id
        WHERE c.depth < 30
     )
     SELECT company_id::text AS company_id, legacy_kind, legacy_id::text AS legacy_id FROM chain ORDER BY depth ASC`,
    [unitId]
  );
  if (!rows.length) return { company_id: null, department_id: null, sub_department_id: null };
  const company_id = rows[0].company_id;
  const sub = rows.find(r => r.legacy_kind === 'sub')?.legacy_id ?? null;
  const dept = rows.find(r => r.legacy_kind === 'department')?.legacy_id ?? null;
  return { company_id, department_id: dept, sub_department_id: sub };
}

/**
 * Gán 1 người vào đơn vị: ghi users.org_unit_id + dual-write cột legacy theo resolver ⇒ chấm
 * công/phân quyền/duyệt (đọc cột legacy) vẫn đúng dù người ở tầng sâu.
 */
export async function assignUserToUnit(userId: string, unitId: string): Promise<void> {
  const legacy = await resolveLegacyForUnit(unitId);
  await execute(
    `UPDATE users SET org_unit_id = $2,
        company_id = COALESCE($3::uuid, company_id),
        department_id = $4::uuid,
        sub_department_id = $5::uuid,
        updated_at = NOW()
      WHERE id = $1`,
    [userId, unitId, legacy.company_id, legacy.department_id, legacy.sub_department_id]
  );
}

/** Người đang gán trực tiếp vào 1 đơn vị (cho UI). */
export async function listUnitMembers(unitId: string): Promise<{ id: string; name: string; avatar: string | null }[]> {
  return query(
    `SELECT id::text AS id, name, avatar FROM users WHERE org_unit_id = $1 AND status = 'active' ORDER BY name`,
    [unitId]
  );
}
