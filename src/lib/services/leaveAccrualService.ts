import { query, queryOne, execute, withTransaction } from '@/lib/db';
import { addTransaction } from './leaveBalanceService';
import { resolveAttendanceConfig } from './attendanceSettingsService';
import type { AnnualLeavePolicyConfig } from '@/lib/config/attendanceConfig';

export interface PolicyCompany {
  id: string;
  name: string;
}

export interface LeaveAccrualPolicy {
  id: string;
  name: string;
  employment_type_id: string | null;
  base_days_per_year: number;
  accrual_frequency: 'monthly' | 'yearly_upfront';
  prorate_new_hires: boolean;
  seniority_bonus_days: number;
  seniority_every_years: number;
  carryover_max_days: number;
  carryover_expiry_mmdd: string;
  accrual_day: number;
  valid_from: string | null;
  valid_until: string | null;
  allow_negative: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  employment_type_name?: string | null;
  companies?: PolicyCompany[];
}

interface AccrualUser {
  id: string;
  name: string;
  hire_date: string | null;
  left_date: string | null;
  employment_type_id: string | null;
  company_id: string | null;
}

async function resolveAnnualPolicy(
  user: AccrualUser,
  onDate: string,
): Promise<AnnualLeavePolicyConfig | null> {
  const config = await resolveAttendanceConfig(user.company_id, onDate);
  return config.annualLeavePolicy.enabled ? config.annualLeavePolicy : null;
}

/** Lấy tất cả chính sách (kèm tên hình thức lao động + danh sách công ty). */
export async function getPolicies(companyId?: string | null): Promise<LeaveAccrualPolicy[]> {
  const params: unknown[] = companyId ? [companyId] : [];
  const having = companyId
    ? 'HAVING count(lpc.company_id) = 0 OR bool_or(lpc.company_id = $1::uuid)'
    : '';
  return query<LeaveAccrualPolicy>(
    `SELECT p.*, et.name AS employment_type_name,
       COALESCE(
         JSON_AGG(JSON_BUILD_OBJECT('id', lpc.company_id::text, 'name', c.name))
         FILTER (WHERE c.id IS NOT NULL),
         '[]'::json
       ) AS companies
     FROM leave_accrual_policies p
     LEFT JOIN employment_types et ON et.id = p.employment_type_id
     LEFT JOIN leave_policy_companies lpc ON lpc.policy_id = p.id
     LEFT JOIN companies c ON c.id = lpc.company_id
     GROUP BY p.id, et.name
     ${having}
     ORDER BY p.employment_type_id NULLS FIRST, p.name ASC`,
    params
  );
}

export async function getPolicyById(id: string): Promise<LeaveAccrualPolicy | null> {
  const policies = await query<LeaveAccrualPolicy>(
    `SELECT p.*, et.name AS employment_type_name,
       COALESCE(
         JSON_AGG(JSON_BUILD_OBJECT('id', lpc.company_id::text, 'name', c.name))
         FILTER (WHERE c.id IS NOT NULL),
         '[]'::json
       ) AS companies
     FROM leave_accrual_policies p
     LEFT JOIN employment_types et ON et.id = p.employment_type_id
     LEFT JOIN leave_policy_companies lpc ON lpc.policy_id = p.id
     LEFT JOIN companies c ON c.id = lpc.company_id
     WHERE p.id = $1
     GROUP BY p.id, et.name`,
    [id]
  );
  return policies[0] ?? null;
}

/** Cập nhật chính sách (kèm gán công ty nếu có). */
export async function updatePolicy(
  id: string,
  data: Partial<{
    name: string;
    base_days_per_year: number;
    accrual_frequency: 'monthly' | 'yearly_upfront';
    prorate_new_hires: boolean;
    seniority_bonus_days: number;
    seniority_every_years: number;
    carryover_max_days: number;
    carryover_expiry_mmdd: string;
    accrual_day: number;
    valid_from: string | null;
    valid_until: string | null;
    allow_negative: boolean;
    active: boolean;
    company_ids: string[];
  }>
): Promise<LeaveAccrualPolicy | null> {
  const { company_ids, ...rest } = data;
  return withTransaction(async (client) => {
    const keys = Object.keys(rest);
    if (keys.length > 0) {
      const assignments = keys.map((k, i) => `"${k}" = $${i + 2}`);
      await client.query(
        `UPDATE leave_accrual_policies SET ${assignments.join(', ')}, updated_at = NOW() WHERE id = $1`,
        [id, ...keys.map((k) => (rest as Record<string, unknown>)[k])]
      );
    }
    if (company_ids !== undefined) {
      await client.query(`DELETE FROM leave_policy_companies WHERE policy_id = $1`, [id]);
      for (const cid of company_ids) {
        await client.query(
          `INSERT INTO leave_policy_companies (policy_id, company_id) VALUES ($1, $2::uuid) ON CONFLICT DO NOTHING`,
          [id, cid]
        );
      }
    }
    return queryOne<LeaveAccrualPolicy>(
      `SELECT p.*, et.name AS employment_type_name,
         COALESCE(JSON_AGG(JSON_BUILD_OBJECT('id', lpc.company_id::text, 'name', c.name)) FILTER (WHERE c.id IS NOT NULL), '[]'::json) AS companies
       FROM leave_accrual_policies p
       LEFT JOIN employment_types et ON et.id = p.employment_type_id
       LEFT JOIN leave_policy_companies lpc ON lpc.policy_id = p.id
       LEFT JOIN companies c ON c.id = lpc.company_id
       WHERE p.id = $1 GROUP BY p.id, et.name`,
      [id]
    );
  });
}

/** Tạo chính sách mới. */
export async function createPolicy(data: {
  name: string;
  employment_type_id: string | null;
  base_days_per_year: number;
  accrual_frequency?: 'monthly' | 'yearly_upfront';
  seniority_bonus_days?: number;
  seniority_every_years?: number;
  carryover_max_days?: number;
  carryover_expiry_mmdd?: string;
  accrual_day?: number;
  valid_from?: string | null;
  valid_until?: string | null;
  company_ids?: string[];
}): Promise<LeaveAccrualPolicy> {
  const { company_ids = [], ...rest } = data;
  return withTransaction(async (client) => {
    const idRow = await client.query<{ id: string }>(
      `INSERT INTO leave_accrual_policies
         (name, employment_type_id, base_days_per_year, accrual_frequency, seniority_bonus_days, seniority_every_years, carryover_max_days, carryover_expiry_mmdd, accrual_day, valid_from, valid_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [
        rest.name,
        rest.employment_type_id,
        rest.base_days_per_year,
        rest.accrual_frequency ?? 'monthly',
        rest.seniority_bonus_days ?? 1,
        rest.seniority_every_years ?? 5,
        rest.carryover_max_days ?? 99,
        rest.carryover_expiry_mmdd ?? '03-31',
        rest.accrual_day ?? 1,
        (rest as Record<string, unknown>).valid_from ?? null,
        (rest as Record<string, unknown>).valid_until ?? null,
      ]
    );
    const newId = idRow.rows[0].id;
    for (const cid of company_ids) {
      await client.query(
        `INSERT INTO leave_policy_companies (policy_id, company_id) VALUES ($1, $2::uuid) ON CONFLICT DO NOTHING`,
        [newId, cid]
      );
    }
    return queryOne<LeaveAccrualPolicy>(
      `SELECT p.*, et.name AS employment_type_name,
         COALESCE(JSON_AGG(JSON_BUILD_OBJECT('id', lpc.company_id::text, 'name', c.name)) FILTER (WHERE c.id IS NOT NULL), '[]'::json) AS companies
       FROM leave_accrual_policies p
       LEFT JOIN employment_types et ON et.id = p.employment_type_id
       LEFT JOIN leave_policy_companies lpc ON lpc.policy_id = p.id
       LEFT JOIN companies c ON c.id = lpc.company_id
       WHERE p.id = $1 GROUP BY p.id, et.name`,
      [newId]
    ) as Promise<LeaveAccrualPolicy>;
  });
}

/** Xóa chính sách (cascade xóa cả gán công ty). */
export async function deletePolicy(id: string): Promise<boolean> {
  const result = await execute(`DELETE FROM leave_accrual_policies WHERE id = $1`, [id]);
  return result > 0;
}

/**
 * Tìm chính sách áp dụng cho 1 hình thức lao động:
 * ưu tiên chính sách riêng của hình thức đó, fallback về chính sách mặc định (NULL).
 */
/**
 * Chọn chính sách phép năm cho 1 nhân viên theo thứ tự ưu tiên:
 *  1. Đúng công ty + đúng hình thức lao động
 *  2. Đúng công ty (chính sách công ty áp dụng mọi hình thức — employment_type_id NULL)
 *  3. Chính sách chung (không gán công ty) + đúng hình thức lao động
 *  4. Chính sách chung, không phân biệt hình thức
 * Chính sách KHÔNG gán công ty nào = áp dụng cho tất cả công ty (chung).
 */
function resolvePolicy(
  policies: LeaveAccrualPolicy[],
  employmentTypeId: string | null,
  companyId: string | null
): LeaveAccrualPolicy | null {
  const active = policies.filter((p) => p.active);
  const inCompany = (p: LeaveAccrualPolicy) =>
    !!companyId && (p.companies ?? []).some((c) => c.id === companyId);
  const noCompany = (p: LeaveAccrualPolicy) => (p.companies ?? []).length === 0;

  // 1. Công ty + hình thức lao động
  if (companyId && employmentTypeId) {
    const m = active.find((p) => inCompany(p) && p.employment_type_id === employmentTypeId);
    if (m) return m;
  }
  // 2. Công ty (chính sách áp dụng mọi hình thức trong công ty đó)
  if (companyId) {
    const m = active.find((p) => inCompany(p) && p.employment_type_id === null);
    if (m) return m;
  }
  // 3. Chính sách chung + hình thức lao động
  if (employmentTypeId) {
    const m = active.find((p) => noCompany(p) && p.employment_type_id === employmentTypeId);
    if (m) return m;
  }
  // 4. Chính sách chung
  return active.find((p) => noCompany(p) && p.employment_type_id === null) ?? null;
}

/** Nhân sự active đủ điều kiện xét cộng phép. */
async function getAccrualUsers(): Promise<AccrualUser[]> {
  return query<AccrualUser>(
    `SELECT id::text AS id, name,
       to_char(hire_date, 'YYYY-MM-DD') AS hire_date,
       to_char(left_date, 'YYYY-MM-DD') AS left_date,
       employment_type_id,
       company_id::text AS company_id
     FROM users WHERE status = 'active'`,
    []
  );
}

/** Số năm thâm niên tròn tính đến 01/01 của năm `year`. */
function seniorityYearsAt(hireDate: string, year: number): number {
  const hire = new Date(hireDate + 'T00:00:00');
  const anchor = new Date(`${year}-01-01T00:00:00`);
  if (anchor <= hire) return 0;
  let years = anchor.getFullYear() - hire.getFullYear();
  const anniversary = new Date(hire);
  anniversary.setFullYear(hire.getFullYear() + years);
  if (anniversary > anchor) years--;
  return Math.max(0, years);
}

export interface AccrualRunResult {
  granted: number;
  skipped: number;
}

/**
 * Cộng phép tháng (chính sách monthly): mỗi user được base/12 ngày cho tháng `month`.
 * Tham số `todayDay` để kiểm tra accrual_day — chỉ cộng khi ngày hôm nay >= ngày cấu hình.
 * Idempotent qua period_key 'YYYY-MM' — chạy lại không cộng trùng.
 */
export async function runMonthlyAccrual(year: number, month: number, todayDay?: number): Promise<AccrualRunResult> {
  const users = await getAccrualUsers();
  const mm = String(month).padStart(2, '0');
  const monthStart = `${year}-${mm}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const effectiveDay = Math.min(todayDay ?? lastDay, lastDay);
  const onDate = `${year}-${mm}-${String(effectiveDay).padStart(2, '0')}`;

  let granted = 0;
  let skipped = 0;
  for (const u of users) {
    const policy = await resolveAnnualPolicy(u, onDate);
    if (!policy || Number(policy.baseDaysPerYear) <= 0) {
      skipped++;
      continue;
    }
    // Chưa đến ngày cộng phép cấu hình trong tháng → bỏ qua (sẽ cộng vào ngày đúng)
    const grantDay = Math.min(Number(policy.accrualDay || 1), lastDay);
    if (todayDay !== undefined && grantDay > todayDay) { skipped++; continue; }
    if (u.left_date && u.left_date < monthStart) { skipped++; continue; }

    const amount = Math.round((Number(policy.baseDaysPerYear) / 12) * 100) / 100;
    const inserted = await addTransaction({
      user_id: u.id,
      year,
      amount,
      source: 'accrual',
      period_key: `${year}-${mm}`,
      note: `Cộng phép tháng ${month}/${year} theo Quy tắc chấm công`,
    });
    if (inserted) granted++;
    else skipped++;
  }
  return { granted, skipped };
}

/** Cấp đủ phép đầu năm (chính sách yearly_upfront), prorate theo tháng vào làm. */
export async function runYearlyUpfront(year: number): Promise<AccrualRunResult> {
  const policies = await getPolicies();
  const users = await getAccrualUsers();

  let granted = 0;
  let skipped = 0;
  for (const u of users) {
    const policy = resolvePolicy(policies, u.employment_type_id, u.company_id);
    if (!policy || policy.accrual_frequency !== 'yearly_upfront' || Number(policy.base_days_per_year) <= 0) {
      skipped++;
      continue;
    }
    let amount = Number(policy.base_days_per_year);
    if (policy.prorate_new_hires && u.hire_date && u.hire_date.startsWith(String(year))) {
      const hireMonth = Number(u.hire_date.slice(5, 7));
      amount = Math.round(amount * ((12 - hireMonth + 1) / 12) * 100) / 100;
    }
    if (u.hire_date && Number(u.hire_date.slice(0, 4)) > year) { skipped++; continue; }

    const inserted = await addTransaction({
      user_id: u.id,
      year,
      amount,
      source: 'accrual',
      period_key: `${year}`,
      note: `Cấp phép năm ${year} (${policy.name})`,
    });
    if (inserted) granted++;
    else skipped++;
  }
  return { granted, skipped };
}

/** Cộng thâm niên Điều 114: +bonus cho mỗi `every` năm làm việc, ghi 1 lần đầu năm. */
export async function runSeniorityGrant(year: number): Promise<AccrualRunResult> {
  const users = await getAccrualUsers();

  let granted = 0;
  let skipped = 0;
  for (const u of users) {
    const policy = await resolveAnnualPolicy(u, `${year}-01-01`);
    if (!policy || !u.hire_date || Number(policy.seniorityBonusDays) <= 0) { skipped++; continue; }

    const years = seniorityYearsAt(u.hire_date, year);
    const steps = Math.floor(years / Number(policy.seniorityEveryYears || 5));
    if (steps <= 0) { skipped++; continue; }

    const amount = steps * Number(policy.seniorityBonusDays);
    const inserted = await addTransaction({
      user_id: u.id,
      year,
      amount,
      source: 'seniority',
      period_key: `${year}`,
      note: `Thâm niên ${years} năm: +${amount} ngày (Điều 114 BLLĐ)`,
    });
    if (inserted) granted++;
    else skipped++;
  }
  return { granted, skipped };
}

/** Mang số dư dương của năm trước sang năm mới (giới hạn carryover_max_days). */
export async function runCarryoverIn(year: number): Promise<AccrualRunResult> {
  const users = await getAccrualUsers();

  let granted = 0;
  let skipped = 0;
  for (const u of users) {
    const policy = await resolveAnnualPolicy(u, `${year}-01-01`);
    const cap = Number(policy?.carryoverMaxDays ?? 0);
    if (!policy || cap <= 0) { skipped++; continue; }

    const row = await queryOne<{ balance: string }>(
      `SELECT COALESCE(SUM(amount), 0) AS balance FROM leave_transactions
       WHERE user_id = $1 AND year = $2`,
      [u.id, year - 1]
    );
    const prevBalance = Number(row?.balance ?? 0);
    if (prevBalance <= 0) { skipped++; continue; }

    const amount = Math.min(prevBalance, cap);
    const inserted = await addTransaction({
      user_id: u.id,
      year,
      amount,
      source: 'carryover_in',
      period_key: `${year}`,
      note: `Phép năm ${year - 1} chuyển sang (tối đa ${cap} ngày, hết hạn ${policy.carryoverExpiryMMDD.replace('-', '/')})`,
    });
    if (inserted) granted++;
    else skipped++;
  }
  return { granted, skipped };
}

/**
 * Hết hạn phép chuyển năm: sau ngày carryover_expiry_mmdd, phần phép mang sang
 * chưa dùng tới sẽ bị trừ (phép dùng từ đầu năm trừ vào phần mang sang trước — FIFO).
 */
export async function runCarryoverExpiry(year: number, todayMMDD: string): Promise<AccrualRunResult> {
  const users = await getAccrualUsers();

  let granted = 0;
  let skipped = 0;
  for (const u of users) {
    const policy = await resolveAnnualPolicy(u, `${year}-${todayMMDD}`);
    if (!policy || Number(policy.carryoverMaxDays) <= 0) { skipped++; continue; }
    if (todayMMDD < policy.carryoverExpiryMMDD) { skipped++; continue; }

    const carried = await queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM leave_transactions
       WHERE user_id = $1 AND year = $2 AND source = 'carryover_in'`,
      [u.id, year]
    );
    const carriedAmount = Number(carried?.total ?? 0);
    if (carriedAmount <= 0) { skipped++; continue; }

    const expiryDate = `${year}-${policy.carryoverExpiryMMDD}`;
    const used = await queryOne<{ total: string }>(
      `SELECT COALESCE(ABS(SUM(tx.amount)), 0) AS total FROM leave_transactions tx
       LEFT JOIN leave_requests r ON r.id = tx.request_id
       WHERE tx.user_id = $1 AND tx.year = $2 AND tx.source = 'usage'
         AND (r.start_date IS NULL OR r.start_date <= $3::date)`,
      [u.id, year, expiryDate]
    );
    const expire = Math.max(0, carriedAmount - Number(used?.total ?? 0));
    if (expire <= 0) { skipped++; continue; }

    const inserted = await addTransaction({
      user_id: u.id,
      year,
      amount: -expire,
      source: 'carryover_expire',
      period_key: `${year}`,
      note: `Phép chuyển từ năm ${year - 1} hết hạn ${policy.carryoverExpiryMMDD.replace('-', '/')}: trừ ${expire} ngày chưa dùng`,
    });
    if (inserted) granted++;
    else skipped++;
  }
  return { granted, skipped };
}

/**
 * Tick tổng hợp chạy hằng ngày từ scheduler. Mọi bước đều idempotent qua period_key
 * nên gọi lặp lại vô hại:
 * - Đầu năm: carryover + thâm niên
 * - Hằng tháng: cộng phép tháng (monthly)
 * - Sau ngày hết hạn: trừ phép chuyển năm chưa dùng
 */
export async function runDailyAccrualTick(): Promise<void> {
  const nowVN = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const year = Number(nowVN.slice(0, 4));
  const month = Number(nowVN.slice(5, 7));
  const mmdd = nowVN.slice(5, 10);

  const day = Number(nowVN.slice(8, 10));
  const carry = await runCarryoverIn(year);
  const seniority = await runSeniorityGrant(year);
  const monthly = await runMonthlyAccrual(year, month, day);
  const expiry = await runCarryoverExpiry(year, mmdd);

  const total = carry.granted + seniority.granted + monthly.granted + expiry.granted;
  if (total > 0) {
    console.log(
      `[LeaveAccrual] ${nowVN}: carryover +${carry.granted}, thâm niên +${seniority.granted}, ` +
        `tháng +${monthly.granted}, hết hạn ${expiry.granted}`
    );
  }
}
