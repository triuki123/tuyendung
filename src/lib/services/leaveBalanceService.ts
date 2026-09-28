import { query, queryOne } from '@/lib/db';
import type { PoolClient } from 'pg';

export type LeaveTxSource =
  | 'accrual'
  | 'seniority'
  | 'opening'
  | 'manual'
  | 'usage'
  | 'usage_revert'
  | 'carryover_in'
  | 'carryover_expire';

export interface LeaveTransaction {
  id: string;
  user_id: string;
  year: number;
  amount: number;
  source: LeaveTxSource;
  period_key: string | null;
  request_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  // Joined
  created_by_name?: string | null;
}

export interface LeaveYearStats {
  /** Số dư phép năm hiện tại (= tổng ledger của năm) */
  balance: number;
  /** Tổng số ngày đã được cộng trong năm */
  granted: number;
  /** Tổng số ngày phép năm đã dùng trong năm */
  used: number;
  /** Số ngày đã nghỉ trong năm theo từng loại (mọi loại phép, từ đơn approved) */
  byType: Array<{
    leave_type_id: string;
    type_name: string;
    type_color: string;
    total_days: number;
    request_count: number;
  }>;
}

/** Số dư phép năm của 1 user trong 1 năm (= tổng mọi giao dịch ledger). */
export async function getBalance(userId: string, year: number): Promise<number> {
  const row = await queryOne<{ balance: string }>(
    `SELECT COALESCE(SUM(amount), 0) AS balance
     FROM leave_transactions WHERE user_id = $1 AND year = $2`,
    [userId, year]
  );
  return Number(row?.balance ?? 0);
}

/** Thống kê năm: số dư, đã cộng, đã dùng + số ngày nghỉ theo từng loại phép. */
export async function getYearStats(userId: string, year: number): Promise<LeaveYearStats> {
  const sums = await queryOne<{ balance: string; granted: string; used: string }>(
    `SELECT
       COALESCE(SUM(amount), 0) AS balance,
       COALESCE(SUM(amount) FILTER (WHERE amount > 0 AND source <> 'usage_revert'), 0) AS granted,
       COALESCE(GREATEST(0, -SUM(amount) FILTER (WHERE source IN ('usage', 'usage_revert'))), 0) AS used
     FROM leave_transactions WHERE user_id = $1 AND year = $2`,
    [userId, year]
  );

  const byType = await query<{
    leave_type_id: string;
    type_name: string;
    type_color: string;
    total_days: string;
    request_count: string;
  }>(
    `SELECT r.leave_type_id,
       t.name AS type_name, t.color AS type_color,
       SUM(r.total_days) AS total_days,
       COUNT(*) AS request_count
     FROM leave_requests r
     JOIN leave_types t ON t.id = r.leave_type_id
     WHERE r.user_id = $1
       AND r.status = 'approved'
       AND EXTRACT(YEAR FROM r.start_date) = $2
     GROUP BY r.leave_type_id, t.name, t.color, t.sort_order
     ORDER BY t.sort_order ASC`,
    [userId, year]
  );

  return {
    balance: Number(sums?.balance ?? 0),
    granted: Number(sums?.granted ?? 0),
    used: Number(sums?.used ?? 0),
    byType: byType.map((r) => ({
      leave_type_id: r.leave_type_id,
      type_name: r.type_name,
      type_color: r.type_color,
      total_days: Number(r.total_days),
      request_count: Number(r.request_count),
    })),
  };
}

/** Lịch sử giao dịch quỹ phép của 1 user trong 1 năm. */
export async function getTransactions(userId: string, year: number): Promise<LeaveTransaction[]> {
  return query<LeaveTransaction>(
    `SELECT tx.*, u.name AS created_by_name
     FROM leave_transactions tx
     LEFT JOIN users u ON u.id::text = tx.created_by
     WHERE tx.user_id = $1 AND tx.year = $2
     ORDER BY tx.created_at DESC`,
    [userId, year]
  );
}

export interface AllBalanceRow {
  user_id: string;
  user_name: string;
  user_email: string;
  department: string | null;
  company_id: string | null;
  company_name: string | null;
  employment_type_name: string | null;
  balance: number;
  granted: number;
  used: number;
  carry_in: number;
}

/**
 * Bảng số dư toàn nhân sự (trang Cấu Hình của Admin/HCNS).
 * companyId: nếu truyền → chỉ lấy nhân sự công ty đó (Admin); null → toàn hệ thống (Super Admin).
 * granted/used tính NET phần hoàn quỹ (usage_revert) để khớp với thống kê cá nhân.
 */
export async function getAllBalances(
  year: number,
  opts?: { companyId?: string | null },
): Promise<AllBalanceRow[]> {
  const params: unknown[] = [year];
  let companyFilter = '';
  if (opts?.companyId) {
    params.push(opts.companyId);
    companyFilter = `AND u.company_id::text = $${params.length}`;
  }

  const rows = await query<{
    user_id: string;
    user_name: string;
    user_email: string;
    department: string | null;
    company_id: string | null;
    company_name: string | null;
    employment_type_name: string | null;
    balance: string;
    granted: string;
    used: string;
    carry_in: string;
  }>(
    `SELECT u.id::text AS user_id, u.name AS user_name, u.email AS user_email,
       -- Tên phòng ban: ưu tiên join theo department_id; nếu cột text u.department là
       -- chuỗi dạng UUID (dữ liệu cũ) thì bỏ qua, không hiển thị ra UI.
       COALESCE(
         dep.name,
         CASE WHEN u.department ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-' THEN NULL
              ELSE NULLIF(u.department, '') END
       ) AS department,
       u.company_id::text AS company_id,
       co.name AS company_name,
       et.name AS employment_type_name,
       COALESCE(SUM(tx.amount), 0) AS balance,
       COALESCE(SUM(tx.amount) FILTER (WHERE tx.amount > 0 AND tx.source <> 'usage_revert'), 0) AS granted,
       COALESCE(GREATEST(0, -SUM(tx.amount) FILTER (WHERE tx.source IN ('usage','usage_revert'))), 0) AS used,
       COALESCE(SUM(tx.amount) FILTER (WHERE tx.source = 'carryover_in'), 0) AS carry_in
     FROM users u
     LEFT JOIN employment_types et ON et.id::text = u.employment_type_id::text
     LEFT JOIN companies co ON co.id::text = u.company_id::text
     LEFT JOIN departments dep ON dep.id = u.department_id
     LEFT JOIN leave_transactions tx ON tx.user_id = u.id::text AND tx.year = $1
     WHERE u.status = 'active' ${companyFilter}
     GROUP BY u.id, u.name, u.email, u.department, dep.name, u.company_id, co.name, et.name
     ORDER BY u.name ASC`,
    params,
  );
  return rows.map((r) => ({
    user_id: r.user_id,
    user_name: r.user_name,
    user_email: r.user_email,
    department: r.department,
    company_id: r.company_id,
    company_name: r.company_name,
    employment_type_name: r.employment_type_name,
    balance: Number(r.balance),
    granted: Number(r.granted),
    used: Number(r.used),
    carry_in: Number(r.carry_in),
  }));
}

/**
 * Ghi 1 giao dịch vào sổ quỹ. Nếu có period_key trùng (user + source + period_key)
 * → bỏ qua (idempotent, chống cộng trùng khi scheduler chạy lại).
 * Truyền client khi cần chạy trong transaction lớn hơn.
 */
export async function addTransaction(
  data: {
    user_id: string;
    year: number;
    amount: number;
    source: LeaveTxSource;
    period_key?: string | null;
    request_id?: string | null;
    note?: string | null;
    created_by?: string | null;
  },
  client?: PoolClient
): Promise<boolean> {
  const sql = `INSERT INTO leave_transactions
       (user_id, year, amount, source, period_key, request_id, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (user_id, source, period_key) WHERE period_key IS NOT NULL DO NOTHING`;
  const params = [
    data.user_id,
    data.year,
    data.amount,
    data.source,
    data.period_key ?? null,
    data.request_id ?? null,
    data.note ?? null,
    data.created_by ?? null,
  ];
  if (client) {
    const r = await client.query(sql, params);
    return (r.rowCount ?? 0) > 0;
  }
  const { execute } = await import('@/lib/db');
  const n = await execute(sql, params);
  return n > 0;
}

/** HCNS/Admin điều chỉnh quỹ phép thủ công (cộng hoặc trừ, bắt buộc có lý do). */
export async function adjustBalance(data: {
  user_id: string;
  year: number;
  amount: number;
  note: string;
  created_by: string;
}): Promise<boolean> {
  return addTransaction({
    user_id: data.user_id,
    year: data.year,
    amount: data.amount,
    source: 'manual',
    note: data.note,
    created_by: data.created_by,
  });
}

/**
 * Điều chỉnh quỹ phép HÀNG LOẠT cho nhiều nhân sự (cộng/trừ cùng số ngày + lý do).
 * Dùng khi chuyển đổi hệ thống / cấp phép đầu kỳ. Chạy trong 1 transaction.
 */
export async function adjustBalanceBulk(data: {
  user_ids: string[];
  year: number;
  amount: number;
  note: string;
  created_by: string;
}): Promise<number> {
  const ids = Array.from(new Set(data.user_ids.filter(Boolean)));
  if (ids.length === 0) return 0;
  const { withTransaction } = await import('@/lib/db');
  return withTransaction(async (client) => {
    let n = 0;
    for (const uid of ids) {
      const ok = await addTransaction(
        {
          user_id: uid,
          year: data.year,
          amount: data.amount,
          source: 'manual',
          note: data.note,
          created_by: data.created_by,
        },
        client,
      );
      if (ok) n++;
    }
    return n;
  });
}
