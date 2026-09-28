import { query, queryOne, execute, withTransaction } from '@/lib/db';

export type LeavePaidBy = 'company' | 'insurance' | 'unpaid';
export type LeaveMaxDaysScope = 'per_year' | 'per_occurrence';

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  paid_by: LeavePaidBy;
  deducts_balance: boolean;
  max_days: number | null;
  max_days_scope: LeaveMaxDaysScope;
  allow_hourly: boolean;
  /** Loại này áp dụng được cho luồng Bù công/Bù giờ (vd WFH, Công tác). */
  applies_to_adjustment: boolean;
  /** Cho phép nghỉ theo buổi (Sáng/Chiều). */
  allow_half_day: boolean;
  /** Tính Chủ nhật khi tạo đề xuất nhiều ngày (work-mode như Làm theo ca). */
  count_sunday: boolean;
  color: string;
  is_system: boolean;
  active: boolean;
  sort_order: number;
  /** Danh sách công ty áp dụng. RỖNG = áp dụng cho tất cả công ty (dùng chung). */
  company_ids: string[];
  company_names: string[];
  created_at: string;
  updated_at: string;
}

const SELECT_WITH_COMPANIES = `
  SELECT lt.*,
    COALESCE(array_agg(ltc.company_id::text) FILTER (WHERE ltc.company_id IS NOT NULL), '{}') AS company_ids,
    COALESCE(array_agg(c.name)              FILTER (WHERE c.name IS NOT NULL), '{}')          AS company_names
  FROM leave_types lt
  LEFT JOIN leave_type_companies ltc ON ltc.leave_type_id = lt.id
  LEFT JOIN companies c ON c.id = ltc.company_id`;

/** Lấy 1 loại phép kèm danh sách công ty (sau khi tạo/sửa để trả về). */
async function getOneWithCompanies(id: string): Promise<LeaveType | null> {
  return queryOne<LeaveType>(
    `${SELECT_WITH_COMPANIES} WHERE lt.id = $1 GROUP BY lt.id`,
    [id],
  );
}

export async function getLeaveTypeWithCompanies(id: string): Promise<LeaveType | null> {
  return getOneWithCompanies(id);
}

/** Ghi lại danh sách công ty áp dụng cho 1 loại phép (thay thế toàn bộ). */
async function replaceCompanies(
  client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  leaveTypeId: string,
  companyIds: string[],
): Promise<void> {
  await client.query(`DELETE FROM leave_type_companies WHERE leave_type_id = $1`, [leaveTypeId]);
  for (const cid of companyIds) {
    if (!cid) continue;
    await client.query(
      `INSERT INTO leave_type_companies (leave_type_id, company_id) VALUES ($1, $2::uuid) ON CONFLICT DO NOTHING`,
      [leaveTypeId, cid],
    );
  }
}

/**
 * Lấy danh sách loại phép.
 * activeOnly=true → chỉ loại đang bật.
 * companyId → lọc: loại toàn hệ thống (NULL) + loại riêng của công ty đó.
 * Khi companyId=null và activeOnly=false → trả tất cả (dành cho admin quản lý).
 */
export async function getLeaveTypes(activeOnly = true, companyId?: string | null): Promise<LeaveType[]> {
  const params: unknown[] = [];
  const where = activeOnly ? 'WHERE lt.active = true' : '';

  // Lọc theo công ty: loại không gán công ty nào (dùng chung) HOẶC có gán công ty này.
  let having = '';
  if (companyId) {
    params.push(companyId);
    having = `HAVING count(ltc.company_id) = 0 OR bool_or(ltc.company_id = $${params.length}::uuid)`;
  }

  return query<LeaveType>(
    `${SELECT_WITH_COMPANIES}
     ${where}
     GROUP BY lt.id
     ${having}
     ORDER BY lt.sort_order ASC, lt.name ASC`,
    params,
  );
}

/** Lấy 1 loại phép theo ID. */
export async function getLeaveTypeById(id: string): Promise<LeaveType | null> {
  return queryOne<LeaveType>(`SELECT * FROM leave_types WHERE id = $1`, [id]);
}

/**
 * Loại đang bật + "áp dụng cho Bù công/Bù giờ" — nguồn work-mode cho luồng bù công.
 * companyId: lọc loại dùng chung + riêng công ty đó.
 */
export async function getAdjustmentApplicableTypes(companyId?: string | null): Promise<LeaveType[]> {
  const all = await getLeaveTypes(true, companyId);
  return all.filter((t) => t.applies_to_adjustment);
}

/** Tạo loại phép mới. company_id=null → toàn hệ thống; có giá trị → riêng công ty đó. */
export async function createLeaveType(data: {
  code: string;
  name: string;
  description?: string;
  paid_by?: LeavePaidBy;
  deducts_balance?: boolean;
  max_days?: number | null;
  max_days_scope?: LeaveMaxDaysScope;
  allow_hourly?: boolean;
  applies_to_adjustment?: boolean;
  allow_half_day?: boolean;
  count_sunday?: boolean;
  color?: string;
  sort_order?: number;
  /** Công ty áp dụng. Rỗng/không truyền = tất cả công ty. */
  company_ids?: string[];
}): Promise<LeaveType> {
  const id = await withTransaction(async (client) => {
    const res = await client.query(
      `INSERT INTO leave_types
         (code, name, description, paid_by, deducts_balance, max_days, max_days_scope, allow_hourly, applies_to_adjustment, allow_half_day, count_sunday, color, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        data.code,
        data.name,
        data.description ?? null,
        data.paid_by ?? 'company',
        data.deducts_balance ?? false,
        data.max_days ?? null,
        data.max_days_scope ?? 'per_year',
        data.allow_hourly ?? true,
        data.applies_to_adjustment ?? false,
        data.allow_half_day ?? false,
        data.count_sunday ?? false,
        data.color ?? '#6366f1',
        data.sort_order ?? 99,
      ],
    );
    const newId = res.rows[0].id as string;
    await replaceCompanies(client, newId, data.company_ids ?? []);
    return newId;
  });
  return (await getOneWithCompanies(id))!;
}

/** Cập nhật loại phép. Loại is_system chỉ cho sửa mô tả/màu/bật-tắt, không đổi cơ chế trừ quỹ. */
export async function updateLeaveType(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    paid_by: LeavePaidBy;
    deducts_balance: boolean;
    max_days: number | null;
    max_days_scope: LeaveMaxDaysScope;
    allow_hourly: boolean;
    applies_to_adjustment: boolean;
    allow_half_day: boolean;
    count_sunday: boolean;
    color: string;
    active: boolean;
    sort_order: number;
    /** Công ty áp dụng. Truyền mảng (kể cả rỗng) = thay thế danh sách; không truyền = giữ nguyên. */
    company_ids: string[];
  }>
): Promise<LeaveType | null> {
  const existing = await getLeaveTypeById(id);
  if (!existing) return null;

  // Tách company_ids ra khỏi patch cột (nó nằm ở bảng nối, không phải cột leave_types)
  const { company_ids, ...rest } = data;
  const patch: Record<string, unknown> = { ...rest };

  // Loại theo luật: khóa các trường nghiệp vụ cốt lõi (phạm vi công ty vẫn cho đổi)
  if (existing.is_system) {
    delete patch.deducts_balance;
    delete patch.paid_by;
    delete patch.max_days;
    delete patch.max_days_scope;
  }
  const keys = Object.keys(patch);
  if (keys.length === 0 && company_ids === undefined) return getOneWithCompanies(id);

  await withTransaction(async (client) => {
    if (keys.length > 0) {
      const assignments = keys.map((k, i) => `"${k}" = $${i + 2}`);
      await client.query(
        `UPDATE leave_types SET ${assignments.join(', ')}, updated_at = NOW() WHERE id = $1`,
        [id, ...keys.map((k) => patch[k])],
      );
    }
    if (company_ids !== undefined) {
      await replaceCompanies(client, id, company_ids);
      await client.query(`UPDATE leave_types SET updated_at = NOW() WHERE id = $1`, [id]);
    }
  });
  return getOneWithCompanies(id);
}

/** Xóa loại phép — chỉ loại không phải hệ thống và chưa có đơn nào dùng; nếu đã dùng thì tắt. */
export async function deleteLeaveType(id: string): Promise<{ deleted: boolean; deactivated: boolean }> {
  const existing = await getLeaveTypeById(id);
  if (!existing) return { deleted: false, deactivated: false };

  const used = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM leave_requests WHERE leave_type_id = $1`,
    [id]
  );

  if (existing.is_system || Number(used?.cnt) > 0) {
    await execute(`UPDATE leave_types SET active = false, updated_at = NOW() WHERE id = $1`, [id]);
    return { deleted: false, deactivated: true };
  }

  const n = await execute(`DELETE FROM leave_types WHERE id = $1`, [id]);
  return { deleted: n > 0, deactivated: false };
}
