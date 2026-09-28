import { query, queryOne, buildUpdateById, withTransaction } from '@/lib/db';

export type ContractStatus = 'draft' | 'pending_signing' | 'active' | 'renewed' | 'terminated';

export interface Contract {
  id: string;
  employee_id: string;
  contract_type_id: string | null;
  employment_type_id: string | null;
  contract_number: string;
  sign_date: string | null;
  start_date: string | null;
  end_date: string | null;
  salary_info: string | null;
  notes: string | null;
  status: ContractStatus;
  previous_contract_id: string | null;
  reminder_count?: number;
  escalated_at?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  employee_name?: string | null;
  employee_email?: string | null;
  contract_type_name?: string | null;
  employment_type_name?: string | null;
  employee_job_title?: string | null;
  attachment_count?: number;
  employee_department_id?: string | null;
  employee_department_name?: string | null;
  employee_company_id?: string | null;
  employee_company_name?: string | null;
}

const SELECT_WITH_JOINS = `
  SELECT c.*,
         u.name       AS employee_name,
         u.email      AS employee_email,
         ct.name      AS contract_type_name,
         et.name      AS employment_type_name,
         p.name       AS employee_job_title,
         d.id::text   AS employee_department_id,
         d.name       AS employee_department_name,
         co.id::text  AS employee_company_id,
         co.name      AS employee_company_name,
         (SELECT COUNT(*) FROM contract_attachments a
            WHERE a.contract_id = c.id AND a.deleted_at IS NULL) AS attachment_count
    FROM contracts c
    LEFT JOIN users u           ON u.id::text = c.employee_id
    LEFT JOIN contract_types ct ON ct.id = c.contract_type_id
    LEFT JOIN employment_types et ON et.id = c.employment_type_id
    LEFT JOIN positions p       ON p.id = u.position_id
    LEFT JOIN departments d     ON d.id::text = u.department_id::text
    LEFT JOIN companies co      ON co.id::text = d.company_id::text`;

export interface ContractFilter {
  employee_id?: string;
  contract_type_id?: string;
  status?: ContractStatus | ContractStatus[];
  /** Chỉ HĐ active có end_date trong N ngày tới (sắp hết hạn). */
  expiringWithinDays?: number;
  /** Chỉ HĐ đã hết hạn (end_date < hôm nay, status = active). */
  overdue?: boolean;
  /** Chỉ HĐ vô thời hạn (end_date IS NULL, status = active). */
  indefinite?: boolean;
  /** Lọc theo phòng ban của nhân viên. */
  department_id?: string;
  /** Lọc theo công ty của nhân viên. */
  company_id?: string;
  /** Giới hạn tập employee_id được xem (cho lọc theo quyền). */
  allowedEmployeeIds?: string[] | null;
  /** Ẩn hợp đồng nháp — dùng cho view nhân viên (chỉ C&B mới thấy nháp). */
  excludeDraft?: boolean;
}

/** Danh sách hợp đồng theo filter. */
export async function listContracts(filter: ContractFilter = {}): Promise<Contract[]> {
  const where: string[] = [];
  const params: any[] = [];

  if (filter.employee_id) {
    params.push(filter.employee_id);
    where.push(`c.employee_id = $${params.length}`);
  }
  if (filter.contract_type_id) {
    params.push(filter.contract_type_id);
    where.push(`c.contract_type_id = $${params.length}`);
  }
  if (filter.status) {
    if (Array.isArray(filter.status)) {
      const start = params.length + 1;
      filter.status.forEach((s) => params.push(s));
      where.push(`c.status IN (${filter.status.map((_, i) => `$${start + i}`).join(',')})`);
    } else {
      params.push(filter.status);
      where.push(`c.status = $${params.length}`);
    }
  }
  if (typeof filter.expiringWithinDays === 'number') {
    params.push(filter.expiringWithinDays);
    where.push(
      `c.status = 'active' AND c.end_date IS NOT NULL
       AND c.end_date <= (CURRENT_DATE + ($${params.length} || ' days')::interval)
       AND c.end_date >= CURRENT_DATE`
    );
  }
  if (filter.overdue) {
    where.push(`c.status = 'active' AND c.end_date IS NOT NULL AND c.end_date < CURRENT_DATE`);
  }
  if (filter.indefinite) {
    where.push(`c.status = 'active' AND c.end_date IS NULL`);
  }
  if (filter.department_id) {
    params.push(filter.department_id);
    where.push(`d.id::text = $${params.length}`);
  }
  if (filter.company_id) {
    params.push(filter.company_id);
    where.push(`co.id::text = $${params.length}`);
  }
  if (filter.allowedEmployeeIds) {
    if (filter.allowedEmployeeIds.length === 0) return [];
    params.push(filter.allowedEmployeeIds);
    where.push(`c.employee_id = ANY($${params.length}::text[])`);
  }
  if (filter.excludeDraft) {
    where.push(`c.status != 'draft'`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return query<Contract>(
    `${SELECT_WITH_JOINS} ${whereSql} ORDER BY c.end_date ASC NULLS LAST, c.created_at DESC`,
    params
  );
}

export async function getContractById(id: string): Promise<Contract | null> {
  return queryOne<Contract>(`${SELECT_WITH_JOINS} WHERE c.id = $1`, [id]);
}

/** Lấy cả chuỗi gia hạn (theo previous_contract_id) của 1 hợp đồng. */
export async function getContractChain(id: string): Promise<Contract[]> {
  return query<Contract>(
    `WITH RECURSIVE chain AS (
       SELECT id, previous_contract_id FROM contracts WHERE id = $1
       UNION ALL
       SELECT c.id, c.previous_contract_id FROM contracts c
       INNER JOIN chain ch ON c.previous_contract_id = ch.id OR c.id = ch.previous_contract_id
     )
     ${SELECT_WITH_JOINS.replace('FROM contracts c', 'FROM contracts c INNER JOIN chain ON chain.id = c.id')}
     ORDER BY c.start_date ASC NULLS FIRST, c.created_at ASC`,
    [id]
  );
}

export async function createContract(data: {
  employee_id: string;
  contract_type_id?: string | null;
  employment_type_id?: string | null;
  contract_number: string;
  sign_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  salary_info?: string | null;
  notes?: string | null;
  status?: ContractStatus;
  previous_contract_id?: string | null;
  created_by?: string | null;
}): Promise<Contract> {
  const id = `ctr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const row = await queryOne<Contract>(
    `INSERT INTO contracts
       (id, employee_id, contract_type_id, employment_type_id, contract_number, sign_date, start_date,
        end_date, salary_info, notes, status, previous_contract_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      id,
      data.employee_id,
      data.contract_type_id ?? null,
      data.employment_type_id ?? null,
      data.contract_number.trim(),
      data.sign_date ?? null,
      data.start_date ?? null,
      data.end_date ?? null,
      data.salary_info ?? null,
      data.notes ?? null,
      data.status ?? 'active',
      data.previous_contract_id ?? null,
      data.created_by ?? null,
    ]
  );
  return row as Contract;
}

export async function updateContract(
  id: string,
  data: Partial<{
    contract_type_id: string | null;
    employment_type_id: string | null;
    contract_number: string;
    sign_date: string | null;
    start_date: string | null;
    end_date: string | null;
    salary_info: string | null;
    notes: string | null;
    status: ContractStatus;
  }>
): Promise<Contract | null> {
  const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const k of [
    'contract_type_id', 'employment_type_id', 'contract_number', 'sign_date', 'start_date',
    'end_date', 'salary_info', 'notes', 'status',
  ] as const) {
    if (data[k] !== undefined) updateData[k] = data[k];
  }
  const { text, params } = buildUpdateById('contracts', id, updateData);
  const updated = await queryOne<Contract>(text, params);
  if (!updated) return null;
  // Refetch with joins to populate employee_name, department, etc.
  return queryOne<Contract>(`${SELECT_WITH_JOINS} WHERE c.id = $1`, [updated.id]);
}

export async function deleteContract(id: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `DELETE FROM contracts WHERE id = $1 RETURNING id`,
    [id]
  );
  return !!row;
}

/**
 * Gia hạn: tạo hợp đồng MỚI kế thừa (previous_contract_id = id cũ) và đánh dấu
 * hợp đồng cũ status='renewed'. Chạy trong transaction để nhất quán.
 */
export async function renewContract(
  oldId: string,
  data: {
    contract_number: string;
    contract_type_id?: string | null;
    employment_type_id?: string | null;
    sign_date?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    salary_info?: string | null;
    notes?: string | null;
    created_by?: string | null;
  }
): Promise<Contract> {
  return withTransaction(async (client) => {
    const old = await client.query<Contract>(`SELECT * FROM contracts WHERE id = $1`, [oldId]);
    if (old.rows.length === 0) throw new Error('Không tìm thấy hợp đồng cần gia hạn');
    const prev = old.rows[0];

    const id = `ctr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const created = await client.query<Contract>(
      `INSERT INTO contracts
         (id, employee_id, contract_type_id, employment_type_id, contract_number, sign_date, start_date,
          end_date, salary_info, notes, status, previous_contract_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11,$12)
       RETURNING *`,
      [
        id,
        prev.employee_id,
        data.contract_type_id ?? prev.contract_type_id,
        data.employment_type_id ?? prev.employment_type_id,
        data.contract_number.trim(),
        data.sign_date ?? null,
        data.start_date ?? null,
        data.end_date ?? null,
        data.salary_info ?? prev.salary_info,
        data.notes ?? null,
        oldId,
        data.created_by ?? null,
      ]
    );

    await client.query(
      `UPDATE contracts SET status = 'renewed', updated_at = NOW() WHERE id = $1`,
      [oldId]
    );

    const newContract = created.rows[0];
    // Refetch with joins to populate employee_name, department, etc.
    const withJoins = await queryOne<Contract>(
      `${SELECT_WITH_JOINS} WHERE c.id = $1`,
      [newContract.id]
    );
    return withJoins || newContract;
  });
}

/**
 * Hợp đồng đang active, có end_date — dùng cho scheduler nhắc gia hạn.
 * Trả kèm tên nhân viên để soạn nội dung nhắc.
 */
export async function listActiveContractsWithEnd(): Promise<Contract[]> {
  return query<Contract>(
    `${SELECT_WITH_JOINS}
      WHERE c.status = 'active' AND c.end_date IS NOT NULL
      ORDER BY c.end_date ASC`
  );
}
