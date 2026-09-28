/**
 * Gắn Hình thức làm việc (employment_types) ↔ Loại hợp đồng (contract_types).
 * Quan hệ nhiều-nhiều qua bảng employment_type_contract_types (migration 177).
 *
 * Dùng để:
 *  - Lọc/gợi ý loại HĐ phù hợp khi C&B tạo hợp đồng cho nhân viên.
 *  - Tự sinh bản nháp HĐ theo các loại đã gắn lúc onboarding.
 */
import { query, queryOne, withTransaction } from '@/lib/db';

/** Lấy danh sách contract_type_id đã gắn cho 1 hình thức làm việc (theo sort_order). */
export async function getContractTypeIdsForEmploymentType(
  employmentTypeId: string
): Promise<string[]> {
  const rows = await query<{ contract_type_id: string }>(
    `SELECT contract_type_id
       FROM employment_type_contract_types
      WHERE employment_type_id = $1
      ORDER BY sort_order ASC`,
    [employmentTypeId]
  );
  return rows.map((r) => r.contract_type_id);
}

/** Lấy contract types (kèm tên) đã gắn — cho UI/onboarding. */
export async function getContractTypesForEmploymentType(
  employmentTypeId: string
): Promise<{ id: string; name: string; code: string | null }[]> {
  return query<{ id: string; name: string; code: string | null }>(
    `SELECT ct.id, ct.name, ct.code
       FROM employment_type_contract_types etct
       JOIN contract_types ct ON ct.id = etct.contract_type_id
      WHERE etct.employment_type_id = $1
      ORDER BY etct.sort_order ASC, ct.name ASC`,
    [employmentTypeId]
  );
}

/** Loại HĐ phù hợp với nhân viên (suy từ hình thức làm việc của nhân viên đó). */
export async function getSuggestedContractTypesForEmployee(
  employeeId: string
): Promise<{ id: string; name: string; code: string | null }[]> {
  const u = await queryOne<{ employment_type_id: string | null }>(
    `SELECT employment_type_id FROM users WHERE id::text = $1`,
    [employeeId]
  );
  if (!u?.employment_type_id) return [];
  return getContractTypesForEmploymentType(u.employment_type_id);
}

/** Replace toàn bộ mapping cho 1 hình thức làm việc (trong 1 transaction). */
export async function setContractTypesForEmploymentType(
  employmentTypeId: string,
  contractTypeIds: string[]
): Promise<void> {
  const unique = Array.from(new Set(contractTypeIds.filter(Boolean)));
  await withTransaction(async (client) => {
    await client.query(
      `DELETE FROM employment_type_contract_types WHERE employment_type_id = $1`,
      [employmentTypeId]
    );
    for (let i = 0; i < unique.length; i++) {
      await client.query(
        `INSERT INTO employment_type_contract_types (employment_type_id, contract_type_id, sort_order)
         VALUES ($1, $2, $3)
         ON CONFLICT (employment_type_id, contract_type_id) DO NOTHING`,
        [employmentTypeId, unique[i], i]
      );
    }
  });
}
