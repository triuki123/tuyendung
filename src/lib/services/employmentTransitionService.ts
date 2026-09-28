/**
 * employmentTransitionService — "Luồng chuyển tiếp hình thức làm việc sau thử việc".
 * Tách biệt với cấu hình Onboarding (employment_type_contract_types).
 *
 * Mỗi luồng: từ hình thức (vd Thử việc) → đến hình thức (vd Chính thức Toàn thời gian),
 * kèm danh sách loại HĐ sẽ TỰ SINH (nháp) khi đánh giá thử việc ĐẠT.
 */
import { query, queryOne, withTransaction } from '@/lib/db';

export interface TransitionContractType { id: string; name: string; code: string | null; }
export interface EmploymentTransition {
  id: string;
  from_employment_type_id: string;
  from_employment_type_name: string | null;
  to_employment_type_id: string;
  to_employment_type_name: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  contract_types: TransitionContractType[];
}

/** Tất cả luồng (kèm tên hình thức + loại HĐ) — cho UI cấu hình. */
export async function listTransitions(): Promise<EmploymentTransition[]> {
  const rows = await query<Omit<EmploymentTransition, 'contract_types'>>(
    `SELECT t.id, t.from_employment_type_id, ef.name AS from_employment_type_name,
            t.to_employment_type_id, et.name AS to_employment_type_name,
            t.is_active, t.sort_order, t.created_at
       FROM employment_transitions t
       LEFT JOIN employment_types ef ON ef.id = t.from_employment_type_id
       LEFT JOIN employment_types et ON et.id = t.to_employment_type_id
      ORDER BY t.sort_order ASC, t.created_at ASC`
  );
  if (rows.length === 0) return [];
  const cts = await query<{ transition_id: string; id: string; name: string; code: string | null }>(
    `SELECT etct.transition_id, ct.id, ct.name, ct.code
       FROM employment_transition_contract_types etct
       JOIN contract_types ct ON ct.id = etct.contract_type_id
      WHERE etct.transition_id = ANY($1)
      ORDER BY etct.sort_order ASC, ct.name ASC`,
    [rows.map(r => r.id)]
  );
  return rows.map(r => ({
    ...r,
    contract_types: cts.filter(c => c.transition_id === r.id).map(({ id, name, code }) => ({ id, name, code })),
  }));
}

/** Luồng ĐANG BẬT cho 1 hình thức nguồn (vd hình thức thử việc của nhân viên). */
export async function getActiveTransitionsFrom(fromTypeId: string): Promise<EmploymentTransition[]> {
  const all = await listTransitions();
  return all.filter(t => t.from_employment_type_id === fromTypeId && t.is_active);
}

/** Loại HĐ tự sinh cho cặp (from → to). Dùng khi kết luận ĐẠT. */
export async function getTransitionContractTypeIds(fromTypeId: string, toTypeId: string): Promise<string[]> {
  const rows = await query<{ contract_type_id: string }>(
    `SELECT etct.contract_type_id
       FROM employment_transitions t
       JOIN employment_transition_contract_types etct ON etct.transition_id = t.id
      WHERE t.from_employment_type_id = $1 AND t.to_employment_type_id = $2 AND t.is_active
      ORDER BY etct.sort_order ASC`,
    [fromTypeId, toTypeId]
  );
  return rows.map(r => r.contract_type_id);
}

export async function createTransition(data: { from_employment_type_id: string; to_employment_type_id: string }): Promise<string> {
  if (!data.from_employment_type_id || !data.to_employment_type_id) throw new Error('Cần chọn hình thức nguồn và đích');
  if (data.from_employment_type_id === data.to_employment_type_id) throw new Error('Hình thức nguồn và đích phải khác nhau');
  const id = `etr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await query(
    `INSERT INTO employment_transitions (id, from_employment_type_id, to_employment_type_id) VALUES ($1,$2,$3)`,
    [id, data.from_employment_type_id, data.to_employment_type_id]
  );
  return id;
}

export async function updateTransition(
  id: string, data: { to_employment_type_id?: string; is_active?: boolean; contract_type_ids?: string[] }
): Promise<void> {
  await withTransaction(async (client) => {
    if (data.to_employment_type_id !== undefined || data.is_active !== undefined) {
      const sets: string[] = []; const params: unknown[] = []; let i = 1;
      if (data.to_employment_type_id !== undefined) { sets.push(`to_employment_type_id = $${i++}`); params.push(data.to_employment_type_id); }
      if (data.is_active !== undefined) { sets.push(`is_active = $${i++}`); params.push(data.is_active); }
      params.push(id);
      await client.query(`UPDATE employment_transitions SET ${sets.join(', ')} WHERE id = $${i}`, params);
    }
    if (data.contract_type_ids !== undefined) {
      const unique = Array.from(new Set(data.contract_type_ids.filter(Boolean)));
      await client.query(`DELETE FROM employment_transition_contract_types WHERE transition_id = $1`, [id]);
      for (let j = 0; j < unique.length; j++) {
        await client.query(
          `INSERT INTO employment_transition_contract_types (transition_id, contract_type_id, sort_order)
           VALUES ($1,$2,$3) ON CONFLICT (transition_id, contract_type_id) DO NOTHING`,
          [id, unique[j], j]
        );
      }
    }
  });
}

export async function deleteTransition(id: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(`DELETE FROM employment_transitions WHERE id = $1 RETURNING id`, [id]);
  return !!row;
}
