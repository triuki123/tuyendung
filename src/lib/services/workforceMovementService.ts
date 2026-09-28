/**
 * Workforce Movement Service — Tình Hình Biến Động Nhân Sự (dành cho phòng Nhân Sự / C&B).
 *
 * Khác với dashboard Tuyển Dụng (luồng tuyển người mới), dashboard này tập trung
 * vào BIẾN ĐỘNG đội ngũ: vào / ra / ròng, tỷ lệ nghỉ việc, cơ cấu lao động,
 * nghỉ việc theo lý do, và báo cáo tăng/giảm theo mốc ngày 15 hàng tháng (kiểu BHXH).
 *
 * Lọc theo năm + công ty (NULL = tất cả công ty).
 */

import { query, queryOne } from '@/lib/db';

export interface Bucket { label: string; count: number }
export interface MonthMovement { month: string; joined: number; left: number; net: number }
export interface MoverRow {
  id: string; name: string; company: string | null; department: string | null;
  date: string | null; // hire_date hoặc left_date
  reason?: string | null;
}
/** 1 dòng báo cáo tăng/giảm theo công ty trong 1 tháng (mốc ngày 15). */
export interface Bhxh15Company { company_id: string | null; company: string; joinedBefore15: number; leftAfter15: number }
export interface Bhxh15Month { month: string; companies: Bhxh15Company[]; totalJoinedBefore15: number; totalLeftAfter15: number }

/**
 * Nhân viên có rủi ro vi phạm Điều 20 BLLĐ 2019: HĐ xác định thời hạn chỉ được
 * ký tối đa 2 lần; lần kế tiếp phải là HĐ không xác định thời hạn.
 * - severity 'warning'  : đã ký đúng 2 lần (lần ký tới buộc phải vô thời hạn).
 * - severity 'violation': đã ký ≥3 lần HĐ xác định thời hạn (đã vượt mức luật cho).
 */
export interface FixedTermRisk {
  id: string; name: string; department: string; company: string;
  fixedCount: number; latestEnd: string | null; hasActive: boolean;
  severity: 'warning' | 'violation';
}

/** Cơ cấu giới tính theo phòng ban (phục vụ Điều 135–136 về bình đẳng giới). */
export interface DeptGender {
  label: string; male: number; female: number; other: number; total: number; femaleRatio: number;
}

/** Khối số liệu tuân thủ pháp luật lao động. */
export interface Compliance {
  totalActive: number;
  female: number; femaleRatio: number;
  foreign: number; foreignRatio: number;
  /** ≥10 lao động nữ → DN phải có chính sách bình đẳng giới (Điều 135–136). */
  femalePolicyRequired: boolean;
  /** Lao động nước ngoài vượt ngưỡng tham khảo (cảnh báo mềm). */
  foreignHighRatio: boolean;
  byDeptGender: DeptGender[];
  fixedTermRisk: FixedTermRisk[];
}

export interface WorkforceMovementData {
  year: number;
  companyId: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  companies: { id: string; name: string }[];
  kpi: {
    headcount: number;        // quân số hiện tại (active)
    joined: number;           // vào trong năm
    left: number;             // ra trong năm
    net: number;              // biến động ròng
    turnoverRate: number;     // % nghỉ việc trên quân số
  };
  monthly: MonthMovement[];   // 12 tháng của năm
  structure: {
    byCompany: Bucket[]; byDepartment: Bucket[]; byGender: Bucket[];
    byAge: Bucket[]; byTenure: Bucket[]; byEmploymentType: Bucket[];
  };
  leaveReasons: Bucket[];     // nghỉ việc theo lý do (từ Offboarding)
  movers: { joined: MoverRow[]; left: MoverRow[] };
  bhxh15: Bhxh15Month[];      // báo cáo tăng/giảm theo mốc ngày 15
  compliance: Compliance;     // số liệu tuân thủ pháp luật lao động
}

const toNum = (v: any): number => Number(v ?? 0) || 0;

const REASON_LABELS: Record<string, string> = {
  resignation: 'Xin nghỉ việc', termination: 'Chấm dứt HĐLĐ', contract_end: 'Hết hạn hợp đồng',
  retirement: 'Nghỉ hưu', other: 'Khác',
};

/** Lấy toàn bộ số liệu biến động nhân sự theo năm + công ty. */
export async function getWorkforceMovement(opts: { year?: number; dateFrom?: string | null; dateTo?: string | null; companyId?: string | null }): Promise<WorkforceMovementData> {
  const companyId = opts.companyId && opts.companyId.trim() ? opts.companyId.trim() : null;
  const dateMode = !!(opts.dateFrom && opts.dateTo);
  const year = opts.year ?? new Date().getFullYear();
  const dateFrom = opts.dateFrom || null;
  const dateTo = opts.dateTo || null;

  // Query CHỈ lọc công ty ($1 = companyId).
  const coFilter = `($1::text IS NULL OR u.company_id::text = $1::text)`;
  const coParams: any[] = [companyId];

  // Điều kiện lọc thời gian: năm hoặc khoảng ngày.
  // Chế độ năm:  $1=year, $2=companyId  → moveCond(col) dùng $1, moveFilter dùng $2
  // Chế độ ngày: $1=from, $2=to, $3=companyId → moveCond(col) dùng $1,$2, moveFilter dùng $3
  let moveParams: any[];
  let moveFilter: string;
  let moveCond: (col: string) => string;
  let bhxhJoinCond: string;   // điều kiện cho cột hire_date mốc 15
  let bhxhLeftCond: string;   // điều kiện cho cột left_date mốc 15

  if (dateMode) {
    moveParams = [dateFrom, dateTo, companyId];
    moveFilter = `($3::text IS NULL OR u.company_id::text = $3::text)`;
    moveCond = (col: string) => `${col} >= $1::date AND ${col} <= $2::date`;
    bhxhJoinCond = `u.hire_date >= $1::date AND u.hire_date <= $2::date AND EXTRACT(DAY FROM u.hire_date) < 15`;
    bhxhLeftCond = `u.left_date >= $1::date AND u.left_date <= $2::date AND EXTRACT(DAY FROM u.left_date) > 15`;
  } else {
    moveParams = [year, companyId];
    moveFilter = `($2::text IS NULL OR u.company_id::text = $2::text)`;
    moveCond = (col: string) => `EXTRACT(YEAR FROM ${col})=$1::int`;
    bhxhJoinCond = `EXTRACT(YEAR FROM u.hire_date)=$1::int AND EXTRACT(DAY FROM u.hire_date) < 15`;
    bhxhLeftCond = `EXTRACT(YEAR FROM u.left_date)=$1::int AND EXTRACT(DAY FROM u.left_date) > 15`;
  }

  // Alias ngắn để thay thế yearParams/yearFilter cũ
  const yearParams = moveParams;
  const yearFilter = moveFilter;

  const [
    companies, headcountRow, joinedRow, leftRow,
    monthlyJoined, monthlyLeft,
    byCompany, byDepartment, byGender, byAge, byTenure, byEmploymentType,
    leaveReasonRows, joinedList, leftList, bhxhRows,
    genderRatioRow, byDeptGenderRows, fixedTermRiskRows,
  ] = await Promise.all([
    query<any>(`SELECT id::text AS id, name FROM companies ORDER BY name`),

    // Quân số hiện tại (chỉ lọc công ty)
    queryOne<any>(`SELECT COUNT(*) AS n FROM users u WHERE u.status='active' AND ${coFilter}`, coParams),
    // Vào trong kỳ
    queryOne<any>(`SELECT COUNT(*) AS n FROM users u WHERE u.hire_date IS NOT NULL AND ${moveCond('u.hire_date')} AND ${yearFilter}`, yearParams),
    // Ra trong kỳ
    queryOne<any>(`SELECT COUNT(*) AS n FROM users u WHERE u.left_date IS NOT NULL AND ${moveCond('u.left_date')} AND ${yearFilter}`, yearParams),

    // Vào theo tháng
    query<any>(`SELECT EXTRACT(MONTH FROM u.hire_date)::int AS m, EXTRACT(YEAR FROM u.hire_date)::int AS y, COUNT(*) AS n FROM users u
                WHERE u.hire_date IS NOT NULL AND ${moveCond('u.hire_date')} AND ${yearFilter} GROUP BY 1,2 ORDER BY 2,1`, yearParams),
    // Ra theo tháng
    query<any>(`SELECT EXTRACT(MONTH FROM u.left_date)::int AS m, EXTRACT(YEAR FROM u.left_date)::int AS y, COUNT(*) AS n FROM users u
                WHERE u.left_date IS NOT NULL AND ${moveCond('u.left_date')} AND ${yearFilter} GROUP BY 1,2 ORDER BY 2,1`, yearParams),

    // Cơ cấu lao động hiện tại (active, chỉ lọc công ty)
    query<any>(`SELECT COALESCE(co.name,'Chưa phân loại') AS label, COUNT(*) AS count
                FROM users u LEFT JOIN companies co ON co.id::text = NULLIF(u.company_id::text,'')
                WHERE u.status='active' AND ${coFilter} GROUP BY 1 ORDER BY count DESC`, coParams),
    query<any>(`SELECT COALESCE(d.name,'Chưa phân loại') AS label, COUNT(*) AS count
                FROM users u LEFT JOIN departments d ON d.id::text = NULLIF(u.department_id::text,'')
                WHERE u.status='active' AND ${coFilter} GROUP BY 1 ORDER BY count DESC LIMIT 15`, coParams),
    query<any>(`SELECT COALESCE(NULLIF(TRIM(u.gender),''),'Chưa rõ') AS label, COUNT(*) AS count
                FROM users u WHERE u.status='active' AND ${coFilter} GROUP BY 1 ORDER BY count DESC`, coParams),
    query<any>(`SELECT CASE
                  WHEN u.date_of_birth IS NULL THEN 'Chưa rõ'
                  WHEN AGE(u.date_of_birth) < INTERVAL '25 years' THEN 'Dưới 25'
                  WHEN AGE(u.date_of_birth) < INTERVAL '35 years' THEN '25–34'
                  WHEN AGE(u.date_of_birth) < INTERVAL '45 years' THEN '35–44'
                  ELSE '45+' END AS label, COUNT(*) AS count
                FROM users u WHERE u.status='active' AND ${coFilter} GROUP BY 1`, coParams),
    query<any>(`SELECT CASE
                  WHEN u.hire_date IS NULL THEN 'Chưa rõ'
                  WHEN AGE(u.hire_date) < INTERVAL '1 year' THEN 'Dưới 1 năm'
                  WHEN AGE(u.hire_date) < INTERVAL '3 years' THEN '1–3 năm'
                  WHEN AGE(u.hire_date) < INTERVAL '5 years' THEN '3–5 năm'
                  ELSE 'Trên 5 năm' END AS label, COUNT(*) AS count
                FROM users u WHERE u.status='active' AND ${coFilter} GROUP BY 1`, coParams),
    query<any>(`SELECT COALESCE(NULLIF(TRIM(u.employment_type),''),'Chưa xác định') AS label, COUNT(*) AS count
                FROM users u WHERE u.status='active' AND ${coFilter} GROUP BY 1 ORDER BY count DESC`, coParams),

    // Nghỉ việc theo lý do
    query<any>(`SELECT COALESCE(p.reason,'other') AS reason, COUNT(*) AS count
                FROM users u
                JOIN offboarding_processes p ON p.user_id = u.id::text AND p.status='completed'
                WHERE u.left_date IS NOT NULL AND ${moveCond('u.left_date')} AND ${yearFilter}
                GROUP BY 1 ORDER BY count DESC`, yearParams),

    // Danh sách người VÀO trong kỳ
    query<any>(`SELECT u.id::text AS id, u.name, co.name AS company, d.name AS department,
                       to_char(u.hire_date,'YYYY-MM-DD') AS date
                FROM users u
                LEFT JOIN companies co ON co.id::text = NULLIF(u.company_id::text,'')
                LEFT JOIN departments d ON d.id::text = NULLIF(u.department_id::text,'')
                WHERE u.hire_date IS NOT NULL AND ${moveCond('u.hire_date')} AND ${yearFilter}
                ORDER BY u.hire_date DESC LIMIT 300`, yearParams),
    // Danh sách người RA trong kỳ
    query<any>(`SELECT u.id::text AS id, u.name, co.name AS company, d.name AS department,
                       to_char(u.left_date,'YYYY-MM-DD') AS date, p.reason
                FROM users u
                LEFT JOIN companies co ON co.id::text = NULLIF(u.company_id::text,'')
                LEFT JOIN departments d ON d.id::text = NULLIF(u.department_id::text,'')
                LEFT JOIN offboarding_processes p ON p.user_id = u.id::text AND p.status='completed'
                WHERE u.left_date IS NOT NULL AND ${moveCond('u.left_date')} AND ${yearFilter}
                ORDER BY u.left_date DESC LIMIT 300`, yearParams),

    // Báo cáo tăng/giảm mốc ngày 15: vào trước 15 / nghỉ sau 15, theo công ty × tháng
    query<any>(`SELECT m, y, company_id, company,
                       SUM(joined_before_15) AS joined_before_15,
                       SUM(left_after_15) AS left_after_15
                FROM (
                  SELECT EXTRACT(MONTH FROM u.hire_date)::int AS m,
                         EXTRACT(YEAR FROM u.hire_date)::int AS y,
                         u.company_id::text AS company_id, COALESCE(co.name,'Chưa phân loại') AS company,
                         1 AS joined_before_15, 0 AS left_after_15
                  FROM users u LEFT JOIN companies co ON co.id::text = NULLIF(u.company_id::text,'')
                  WHERE u.hire_date IS NOT NULL AND ${bhxhJoinCond} AND ${yearFilter}
                  UNION ALL
                  SELECT EXTRACT(MONTH FROM u.left_date)::int AS m,
                         EXTRACT(YEAR FROM u.left_date)::int AS y,
                         u.company_id::text AS company_id, COALESCE(co.name,'Chưa phân loại') AS company,
                         0 AS joined_before_15, 1 AS left_after_15
                  FROM users u LEFT JOIN companies co ON co.id::text = NULLIF(u.company_id::text,'')
                  WHERE u.left_date IS NOT NULL AND ${bhxhLeftCond} AND ${yearFilter}
                ) t
                GROUP BY m, y, company_id, company
                ORDER BY y, m, company`, yearParams),

    // Tỷ lệ nữ / nước ngoài trên tổng quân số active (chỉ lọc công ty)
    queryOne<any>(`SELECT
                  COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE lower(TRIM(u.gender)) = 'nữ') AS female,
                  COUNT(*) FILTER (
                    WHERE u.nationality IS NOT NULL AND TRIM(u.nationality) <> ''
                      AND lower(TRIM(u.nationality)) NOT IN ('việt nam','viet nam','vietnam','vn')
                  ) AS foreign
                FROM users u WHERE u.status='active' AND ${coFilter}`, coParams),

    // Cơ cấu giới tính theo phòng ban (Top 15) — Điều 135–136 bình đẳng giới
    query<any>(`SELECT COALESCE(d.name,'Chưa phân loại') AS label,
                  COUNT(*) FILTER (WHERE lower(TRIM(u.gender))='nam') AS male,
                  COUNT(*) FILTER (WHERE lower(TRIM(u.gender))='nữ') AS female,
                  COUNT(*) FILTER (WHERE u.gender IS NULL OR lower(TRIM(u.gender)) NOT IN ('nam','nữ')) AS other,
                  COUNT(*) AS total
                FROM users u LEFT JOIN departments d ON d.id::text = NULLIF(u.department_id::text,'')
                WHERE u.status='active' AND ${coFilter}
                GROUP BY 1 ORDER BY total DESC LIMIT 15`, coParams),

    // Rủi ro Điều 20: nhân viên active đã ký ≥2 HĐ xác định thời hạn
    query<any>(`SELECT u.id::text AS id, u.name,
                       COALESCE(d.name,'—') AS department,
                       COALESCE(co.name,'—') AS company,
                       COUNT(*) AS fixed_count,
                       to_char(MAX(c.end_date),'YYYY-MM-DD') AS latest_end,
                       BOOL_OR(c.status='active') AS has_active
                FROM users u
                JOIN contracts c ON c.employee_id = u.id::text AND c.contract_type_id = 'ctype_fixed_term'
                LEFT JOIN departments d ON d.id::text = NULLIF(u.department_id::text,'')
                LEFT JOIN companies co ON co.id::text = NULLIF(u.company_id::text,'')
                WHERE u.status='active' AND ${coFilter}
                GROUP BY u.id, u.name, d.name, co.name
                HAVING COUNT(*) >= 2
                ORDER BY COUNT(*) DESC, MAX(c.end_date) DESC NULLS LAST
                LIMIT 200`, coParams),
  ]);

  // ── Ghép dữ liệu tháng ──────────────────────────────────────────────────────
  // Key: "YYYY-MM" để hỗ trợ cả chế độ năm và khoảng ngày nhiều năm
  const joinedByYM = new Map<string, number>();
  const leftByYM = new Map<string, number>();
  for (const r of monthlyJoined as any[]) {
    const key = `${toNum(r.y)}-${String(toNum(r.m)).padStart(2, '0')}`;
    joinedByYM.set(key, (joinedByYM.get(key) || 0) + toNum(r.n));
  }
  for (const r of monthlyLeft as any[]) {
    const key = `${toNum(r.y)}-${String(toNum(r.m)).padStart(2, '0')}`;
    leftByYM.set(key, (leftByYM.get(key) || 0) + toNum(r.n));
  }
  const monthly: MonthMovement[] = [];
  if (dateMode && dateFrom && dateTo) {
    // Sinh các tháng trong khoảng dateFrom→dateTo
    const cur = new Date(dateFrom);
    const end = new Date(dateTo);
    cur.setDate(1);
    while (cur <= end) {
      const y = cur.getFullYear();
      const m = cur.getMonth() + 1;
      const key = `${y}-${String(m).padStart(2, '0')}`;
      const j = joinedByYM.get(key) || 0;
      const l = leftByYM.get(key) || 0;
      monthly.push({ month: `${String(m).padStart(2, '0')}/${y}`, joined: j, left: l, net: j - l });
      cur.setMonth(cur.getMonth() + 1);
    }
  } else {
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, '0')}`;
      const j = joinedByYM.get(key) || 0;
      const l = leftByYM.get(key) || 0;
      monthly.push({ month: `${String(m).padStart(2, '0')}/${year}`, joined: j, left: l, net: j - l });
    }
  }

  // ── Báo cáo mốc 15 gom theo tháng ───────────────────────────────────────────
  const bhxhMap = new Map<string, Bhxh15Month>();
  for (const r of bhxhRows as any[]) {
    const m = toNum(r.m);
    const y = toNum(r.y) || year;
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const label = `${String(m).padStart(2, '0')}/${y}`;
    if (!bhxhMap.has(key)) bhxhMap.set(key, { month: label, companies: [], totalJoinedBefore15: 0, totalLeftAfter15: 0 });
    const entry = bhxhMap.get(key)!;
    const jb = toNum(r.joined_before_15), la = toNum(r.left_after_15);
    entry.companies.push({ company_id: r.company_id || null, company: r.company, joinedBefore15: jb, leftAfter15: la });
    entry.totalJoinedBefore15 += jb;
    entry.totalLeftAfter15 += la;
  }
  const bhxh15 = [...bhxhMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  const headcount = toNum(headcountRow?.n);
  const joined = toNum(joinedRow?.n);
  const left = toNum(leftRow?.n);
  const buckets = (rows: any[]): Bucket[] => rows.map((r) => ({ label: r.label, count: toNum(r.count) }));

  // ── Khối tuân thủ pháp luật ─────────────────────────────────────────────────
  const totalActive = toNum(genderRatioRow?.total);
  const female = toNum(genderRatioRow?.female);
  const foreign = toNum(genderRatioRow?.foreign);
  const ratio = (part: number) => (totalActive > 0 ? Math.round((part / totalActive) * 1000) / 10 : 0);
  const byDeptGender: DeptGender[] = (byDeptGenderRows as any[]).map((r) => {
    const t = toNum(r.total);
    return {
      label: r.label, male: toNum(r.male), female: toNum(r.female), other: toNum(r.other),
      total: t, femaleRatio: t > 0 ? Math.round((toNum(r.female) / t) * 1000) / 10 : 0,
    };
  });
  const fixedTermRisk: FixedTermRisk[] = (fixedTermRiskRows as any[]).map((r) => {
    const fixedCount = toNum(r.fixed_count);
    return {
      id: r.id, name: r.name, department: r.department, company: r.company,
      fixedCount, latestEnd: r.latest_end || null, hasActive: r.has_active === true,
      severity: fixedCount >= 3 ? 'violation' : 'warning',
    };
  });
  const compliance: Compliance = {
    totalActive, female, femaleRatio: ratio(female), foreign, foreignRatio: ratio(foreign),
    femalePolicyRequired: female >= 10,
    foreignHighRatio: ratio(foreign) > 30,
    byDeptGender, fixedTermRisk,
  };

  return {
    year, companyId, dateFrom, dateTo,
    companies: companies.map((c: any) => ({ id: c.id, name: c.name })),
    kpi: {
      headcount, joined, left, net: joined - left,
      turnoverRate: headcount > 0 ? Math.round((left / headcount) * 1000) / 10 : 0,
    },
    monthly,
    structure: {
      byCompany: buckets(byCompany), byDepartment: buckets(byDepartment), byGender: buckets(byGender),
      byAge: buckets(byAge), byTenure: buckets(byTenure), byEmploymentType: buckets(byEmploymentType),
    },
    leaveReasons: (leaveReasonRows as any[]).map((r) => ({ label: REASON_LABELS[r.reason] || r.reason, count: toNum(r.count) })),
    movers: {
      joined: (joinedList as any[]).map((r) => ({ id: r.id, name: r.name, company: r.company, department: r.department, date: r.date })),
      left: (leftList as any[]).map((r) => ({ id: r.id, name: r.name, company: r.company, department: r.department, date: r.date, reason: r.reason ? (REASON_LABELS[r.reason] || r.reason) : null })),
    },
    bhxh15,
    compliance,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Báo cáo sử dụng lao động — Mẫu số 01/PLI ban hành kèm Nghị định 145/2020/NĐ-CP
// (nộp định kỳ 6 tháng & hằng năm cho Sở LĐ-TB&XH / Cổng DVC Quốc gia).
// ════════════════════════════════════════════════════════════════════════════

export interface LaborReportRow {
  stt: number;
  name: string;
  dob: string | null;          // ngày sinh YYYY-MM-DD
  gender: string | null;       // 'nam' | 'nữ' | khác
  nationality: string | null;
  education: string | null;    // trình độ chuyên môn kỹ thuật
  position: string | null;     // vị trí việc làm
  department: string | null;
  company: string | null;
  contractType: string | null; // loại HĐLĐ đang hiệu lực
  hireDate: string | null;     // thời điểm bắt đầu làm việc
  hasInsurance: boolean;       // có tham gia BHXH
}

export interface LaborUsageReport {
  year: number;
  companyId: string | null;
  companyName: string | null;
  generatedAt: string;
  summary: {
    total: number; female: number; male: number; other: number;
    foreign: number; insured: number;
    byEducation: Bucket[]; byContractType: Bucket[];
  };
  rows: LaborReportRow[];
}

const VN_NATIONALITIES = ['việt nam', 'viet nam', 'vietnam', 'vn'];
const isForeign = (nat: string | null): boolean => {
  if (!nat || !nat.trim()) return false;
  return !VN_NATIONALITIES.includes(nat.trim().toLowerCase());
};

/**
 * Lấy danh sách toàn bộ lao động đang làm việc (active) kèm các trường pháp lý
 * cần thiết cho Mẫu 01/PLI + phần tổng hợp. Lọc theo công ty (NULL = tất cả).
 */
export async function getLaborUsageReport(opts: { year: number; companyId?: string | null }): Promise<LaborUsageReport> {
  const year = opts.year;
  const companyId = opts.companyId && opts.companyId.trim() ? opts.companyId.trim() : null;
  const coFilter = `($1::text IS NULL OR u.company_id::text = $1::text)`;
  const coParams: any[] = [companyId];

  const [companyRow, rows] = await Promise.all([
    companyId
      ? queryOne<any>(`SELECT name FROM companies WHERE id::text = $1::text`, [companyId])
      : Promise.resolve(null),
    query<any>(`
      SELECT u.id::text AS id, u.name,
             to_char(u.date_of_birth,'YYYY-MM-DD') AS dob,
             u.gender, u.nationality,
             u.education_level AS education, u.position,
             d.name AS department, co.name AS company,
             to_char(u.hire_date,'YYYY-MM-DD') AS hire_date,
             (
               (u.social_insurance_base IS NOT NULL AND u.social_insurance_base > 0)
               OR (u.social_insurance_unit IS NOT NULL AND TRIM(u.social_insurance_unit) <> '')
             ) AS has_insurance,
             cc.contract_type AS contract_type
      FROM users u
      LEFT JOIN departments d ON d.id::text = NULLIF(u.department_id::text,'')
      LEFT JOIN companies co ON co.id::text = NULLIF(u.company_id::text,'')
      LEFT JOIN LATERAL (
        SELECT ct.name AS contract_type
        FROM contracts c LEFT JOIN contract_types ct ON ct.id = c.contract_type_id
        WHERE c.employee_id = u.id::text AND c.status = 'active'
        ORDER BY c.start_date DESC NULLS LAST, c.created_at DESC
        LIMIT 1
      ) cc ON true
      WHERE u.status = 'active' AND ${coFilter}
      ORDER BY co.name NULLS LAST, d.name NULLS LAST, u.name
    `, coParams),
  ]);

  const reportRows: LaborReportRow[] = (rows as any[]).map((r, i) => ({
    stt: i + 1,
    name: r.name,
    dob: r.dob || null,
    gender: r.gender || null,
    nationality: r.nationality || null,
    education: r.education || null,
    position: r.position || null,
    department: r.department || null,
    company: r.company || null,
    contractType: r.contract_type || null,
    hireDate: r.hire_date || null,
    hasInsurance: r.has_insurance === true,
  }));

  // Tổng hợp
  const total = reportRows.length;
  let female = 0, male = 0, other = 0, foreign = 0, insured = 0;
  const eduMap = new Map<string, number>();
  const ctMap = new Map<string, number>();
  for (const r of reportRows) {
    const g = (r.gender || '').trim().toLowerCase();
    if (g === 'nữ') female++;
    else if (g === 'nam') male++;
    else other++;
    if (isForeign(r.nationality)) foreign++;
    if (r.hasInsurance) insured++;
    const edu = r.education?.trim() || 'Chưa cập nhật';
    eduMap.set(edu, (eduMap.get(edu) || 0) + 1);
    const ct = r.contractType?.trim() || 'Chưa có hợp đồng';
    ctMap.set(ct, (ctMap.get(ct) || 0) + 1);
  }
  const toBuckets = (m: Map<string, number>): Bucket[] =>
    [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

  return {
    year, companyId,
    companyName: companyRow?.name || null,
    generatedAt: new Date().toISOString(),
    summary: {
      total, female, male, other, foreign, insured,
      byEducation: toBuckets(eduMap), byContractType: toBuckets(ctMap),
    },
    rows: reportRows,
  };
}
