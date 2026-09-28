/**
 * Tổng hợp số liệu cho Dashboard "Tình Hình Tuyển Dụng Nhân Sự" (P1).
 * Toàn bộ tính server-side bằng GROUP BY trên dữ liệu sẵn có — không lộ PII chi tiết.
 *
 * Nguồn: onboarding_submissions, hr_cv_pool, hr_jd_pool, users, companies, departments.
 */
import { query, queryOne } from '@/lib/db';
import { getRequisitionStats, RequisitionStats } from './requisitionService';
import { computeRecruitmentForecast, RecruitmentForecast } from './recruitmentForecast';
import { getForecastConfig } from './systemSettingsService';

export interface Bucket { label: string; value: number }
export interface TrendPoint { month: string; value: number }

export interface RecruitmentDashboard {
  /** Phễu tiếp nhận onboarding (cumulative theo mốc thời gian). */
  funnel: { invited: number; submitted: number; confirmed: number; sent_to_admin: number; approved: number; rejected: number };
  /** Thời gian trung bình (ngày) giữa các bước onboarding. */
  cycleTime: { inviteToSubmit: number; submitToConfirm: number; confirmToSent: number; sentToApprove: number; submitToApprove: number };
  /** Số nhân sự thực vào làm theo tháng (12 tháng gần nhất, theo hire_date). */
  hiresByMonth: TrendPoint[];
  /** Pipeline ứng viên (hr_cv_pool) theo giai đoạn + theo nguồn. */
  cvByStage: Bucket[];
  cvBySource: Bucket[];
  cvTotal: number;
  /** Vị trí tuyển (JD). */
  jd: { active: number; total: number; openList: { title: string; department: string | null }[] };
  /** Cơ cấu lao động (chỉ user active) — đọc từ org_assignments (kiêm nhiệm đa công ty). */
  workforce: {
    headcount: number;
    newHires30d: number;
    newHires90d: number;
    byCompany: Bucket[];
    byDepartment: Bucket[];
    bySubDepartment: Bucket[];
    byEmploymentType: Bucket[];
    byGender: Bucket[];
    byAge: Bucket[];
    byTenure: Bucket[];
    /** Phòng ban chưa có Trưởng phòng (org_role='head') đang hiệu lực. */
    unitsMissingHead: { company: string; department: string }[];
  };
  /** Pipeline theo VỊ TRÍ (hr_applications — sau cải tổ per-vị-trí). */
  applications: {
    total: number;
    byStage: Bucket[];
    /** Offer 12 tháng: đã gửi / nhận (hired) / từ chối (rejected) / đang chờ. */
    offer12m: { offered: number; accepted: number; declined: number; pending: number; acceptRate: number };
    /** Thời gian trung bình (ngày) ứng viên nằm ở từng giai đoạn (12 tháng). */
    stageDurations: Bucket[];
  };
  /** Phỏng vấn (lịch + scorecard). */
  interviews: {
    upcoming7d: number;
    done30d: number;
    cancelled30d: number;
    scorecards12m: number;
    avgOverall: number;
    byRecommendation: Bucket[];
  };
  /** Nhu cầu thay thế tiềm năng (HĐ hết hạn + offboarding đang chạy). */
  replacement: {
    contractsExpiring90d: number;
    contractsExpiringByWindow: Bucket[];
    offboardingInProgress: number;
  };
  /** Kế hoạch tuyển 1/3/6 tháng: thiếu hiện tại + dự báo nghỉ − pipeline gần chốt. */
  hiringPlan: {
    horizonMonths: number;
    openRemaining: number;
    expectedAttrition: number;
    contractRisk: number;
    pipelineOffset: number;
    total: number;
  }[];
  /** Chất lượng tuyển (P3) — thử việc & nghỉ sớm. */
  quality: { probationPassRate: number; probationPassed: number; probationFailed: number; earlyAttrition90d: number };
  /** Giữ chân / turnover (P3) — 12 tháng gần nhất. */
  turnover: { leavers12m: number; turnoverRate: number; leaversByMonth: TrendPoint[] };
  /** Yêu cầu tuyển dụng (P2). */
  requisitions: RequisitionStats;
  /** Dự báo số tuyển tháng tới — mô hình 3 góc nhìn (pipeline + đơn tuyển + xu hướng). */
  forecast: RecruitmentForecast;
  /** Tương thích ngược: = forecast.p50. */
  forecastNextMonth: number;
  /** Khoảng thời gian đang áp cho các chỉ số theo kỳ (YYYY-MM-DD). */
  range: { from: string; to: string };
  /** Danh sách công ty (cho bộ lọc — UI chỉ hiện với super_admin). */
  companies: { id: string; name: string }[];
  /** Giữ chân theo lứa vào làm trong kỳ: còn active đến nay. */
  cohorts: { month: string; hired: number; still: number }[];
}

export interface DashboardOpts {
  companyId?: string;
  /** YYYY-MM-DD — mặc định đầu tháng của 11 tháng trước. */
  from?: string;
  /** YYYY-MM-DD — mặc định hôm nay. */
  to?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Khoảng mặc định = 12 tháng gần nhất (khớp hành vi cũ). */
function resolveRange(opts?: DashboardOpts): { from: string; to: string } {
  const today = new Date();
  const toStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const defFrom = new Date(today.getFullYear(), today.getMonth() - 11, 1);
  let from = opts?.from && DATE_RE.test(opts.from) ? opts.from : toStr(defFrom);
  let to   = opts?.to   && DATE_RE.test(opts.to)   ? opts.to   : toStr(today);
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

function toNum(v: any): number {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
function round1(v: any): number {
  return Math.round(toNum(v) * 10) / 10;
}
function buckets(rows: { label: string; count: any }[]): Bucket[] {
  return rows.map((r) => ({ label: r.label, value: toNum(r.count) }));
}

/** Lọc bài nộp thuộc biểu mẫu onboarding (bỏ biểu mẫu general). */
const ONB_SCOPE = `(form_id IS NULL OR form_id IN (SELECT id FROM form_templates WHERE form_type = 'onboarding'))`;

/**
 * @param companyId Nếu truyền (role admin) → chỉ tính dữ liệu công ty đó.
 *                  Bỏ trống (super_admin) → toàn bộ hệ thống.
 *                  Scope áp cho: workforce/hires/turnover (users), phễu onboarding
 *                  (data->>'company_id'), và requisitions. CV/JD để toàn hệ thống.
 */
export async function getRecruitmentDashboard(opts?: DashboardOpts): Promise<RecruitmentDashboard> {
  const companyId = opts?.companyId;
  const { from, to } = resolveRange(opts);
  // from/to đã qua regex YYYY-MM-DD (resolveRange) → an toàn để inline literal.
  const F = `DATE '${from}'`;
  const T = `DATE '${to}'`;
  const p = companyId ? [companyId] : [];
  // Scope công ty NHẬN BIẾT KIÊM NHIỆM: user thuộc công ty nếu cột cũ khớp
  // HOẶC có phân công org_assignments đang hiệu lực ở công ty đó.
  // LƯU Ý: phải QUA BẢNG tường minh (`ref.id`, không phải `id` trần) — trong subquery EXISTS,
  // `id` trần bị Postgres gán cho org_assignments.id (TEXT) thay vì users.id (uuid) → lỗi
  // "operator does not exist: uuid = text". Truyền tên bảng/bí danh của users, vd 'users' hoặc 'u'.
  const orgScope = (ref: string) =>
    companyId
      ? `AND (${ref}.company_id::text = $1 OR EXISTS (
           SELECT 1 FROM org_assignments _oa
           WHERE _oa.user_id = ${ref}.id AND _oa.is_active AND _oa.company_id::text = $1))`
      : '';
  const cU   = orgScope('users');                                    // FROM users (không bí danh → tham chiếu theo tên bảng)
  const cUu  = orgScope('u');                                        // users u (có bí danh)
  const cOnb = companyId ? `AND (data->>'company_id') = $1` : '';    // onboarding_submissions
  const cOa  = companyId ? `AND oa.company_id::text = $1` : '';      // org_assignments oa
  const cR   = companyId ? `AND r.company_id::text = $1` : '';       // requisitions r

  // org_assignments đã backfill chưa? (migration 224) — chưa thì giữ nguồn cũ users.*
  const orgReady = toNum((await queryOne<any>(
    `SELECT COUNT(*) AS c FROM org_assignments WHERE is_active`
  ))?.c) > 0;
  const [
    funnelRow, cycleRow, hiresRows,
    cvStageRows, cvSourceRows, cvTotalRow,
    jdRow, jdOpenRows,
    wfRow, byCompanyRows, byDeptRows, byEmpRows, byGenderRows, byAgeRows, byTenureRows,
    qualityRow, earlyAttRow, turnoverRow, leaversRows, reqStats,
    bySubDeptRows, missingHeadRows,
    appsStageRows, offerRow, stageDurRows,
    interviewRow, scAggRow, scRecRows,
    contractRow, offbRow,
    companiesRows, cohortRows, hires12Rows,
  ] = await Promise.all([
    // Phễu cumulative theo mốc thời gian
    queryOne<any>(
      `SELECT COUNT(*) AS invited,
              COUNT(submitted_at) AS submitted,
              COUNT(confirmed_at) AS confirmed,
              COUNT(sent_to_admin_at) AS sent_to_admin,
              COUNT(approved_at) AS approved,
              COUNT(rejected_at) AS rejected
         FROM onboarding_submissions
        WHERE ${ONB_SCOPE} ${cOnb} AND invited_at::date BETWEEN ${F} AND ${T}`, p
    ),
    // Thời gian trung bình giữa các bước (ngày)
    queryOne<any>(
      `SELECT
         AVG(EXTRACT(EPOCH FROM (submitted_at - invited_at))/86400)        FILTER (WHERE submitted_at IS NOT NULL)     AS invite_to_submit,
         AVG(EXTRACT(EPOCH FROM (confirmed_at - submitted_at))/86400)      FILTER (WHERE confirmed_at IS NOT NULL)     AS submit_to_confirm,
         AVG(EXTRACT(EPOCH FROM (sent_to_admin_at - confirmed_at))/86400)  FILTER (WHERE sent_to_admin_at IS NOT NULL) AS confirm_to_sent,
         AVG(EXTRACT(EPOCH FROM (approved_at - sent_to_admin_at))/86400)   FILTER (WHERE approved_at IS NOT NULL)      AS sent_to_approve,
         AVG(EXTRACT(EPOCH FROM (approved_at - submitted_at))/86400)       FILTER (WHERE approved_at IS NOT NULL AND submitted_at IS NOT NULL) AS submit_to_approve
       FROM onboarding_submissions
      WHERE ${ONB_SCOPE} ${cOnb} AND invited_at::date BETWEEN ${F} AND ${T}`, p
    ),
    // Nhân sự vào làm theo tháng (trong kỳ)
    query<any>(
      `SELECT to_char(date_trunc('month', hire_date), 'YYYY-MM') AS month, COUNT(*) AS count
         FROM users
        WHERE hire_date IS NOT NULL AND hire_date BETWEEN ${F} AND ${T} ${cU}
        GROUP BY 1 ORDER BY 1`, p
    ),
    // CV theo giai đoạn
    query<any>(`SELECT status AS label, COUNT(*) AS count FROM hr_cv_pool WHERE deleted_at IS NULL GROUP BY status`),
    // CV theo nguồn
    query<any>(`SELECT COALESCE(NULLIF(TRIM(source), ''), 'Không rõ') AS label, COUNT(*) AS count FROM hr_cv_pool WHERE deleted_at IS NULL GROUP BY 1 ORDER BY count DESC`),
    queryOne<any>(`SELECT COUNT(*) AS count FROM hr_cv_pool WHERE deleted_at IS NULL`),
    // JD
    queryOne<any>(`SELECT COUNT(*) FILTER (WHERE status='active') AS active, COUNT(*) AS total FROM hr_jd_pool WHERE deleted_at IS NULL`),
    query<any>(`SELECT title, department_name AS department FROM hr_jd_pool WHERE deleted_at IS NULL AND status='active' ORDER BY created_at DESC LIMIT 20`),
    // Workforce tổng + new hires
    queryOne<any>(
      `SELECT COUNT(*) AS headcount,
              COUNT(*) FILTER (WHERE hire_date >= CURRENT_DATE - INTERVAL '30 days') AS new30,
              COUNT(*) FILTER (WHERE hire_date >= CURRENT_DATE - INTERVAL '90 days') AS new90
         FROM users WHERE status = 'active' ${cU}`, p
    ),
    // Theo công ty — nguồn chuẩn là org_assignments (kiêm nhiệm đếm ở TỪNG công ty)
    orgReady
      ? query<any>(
          `SELECT co.name AS label, COUNT(DISTINCT oa.user_id) AS count
             FROM org_assignments oa
             JOIN users u ON u.id = oa.user_id AND u.status = 'active'
             JOIN companies co ON co.id = oa.company_id
            WHERE oa.is_active ${cOa}
            GROUP BY co.name ORDER BY count DESC`, p
        )
      : query<any>(
          `SELECT COALESCE(co.name, 'Chưa phân loại') AS label, COUNT(*) AS count
             FROM users u LEFT JOIN companies co ON co.id::text = NULLIF(u.company_id::text, '')
            WHERE u.status='active' ${cUu} GROUP BY 1 ORDER BY count DESC`, p
        ),
    // Theo phòng ban — phân công cấp công ty hiện là nhóm riêng (tường minh)
    orgReady
      ? query<any>(
          `SELECT COALESCE(d.name, 'Trực thuộc công ty') AS label, COUNT(DISTINCT oa.user_id) AS count
             FROM org_assignments oa
             JOIN users u ON u.id = oa.user_id AND u.status = 'active'
             LEFT JOIN departments d ON d.id = oa.department_id
            WHERE oa.is_active ${cOa}
            GROUP BY 1 ORDER BY count DESC LIMIT 12`, p
        )
      : query<any>(
          `SELECT COALESCE(d.name, 'Chưa phân loại') AS label, COUNT(*) AS count
             FROM users u LEFT JOIN departments d ON d.id::text = NULLIF(u.department_id::text, '')
            WHERE u.status='active' ${cUu} GROUP BY 1 ORDER BY count DESC LIMIT 12`, p
        ),
    query<any>(
      `SELECT COALESCE(NULLIF(TRIM(employment_type), ''), 'Chưa xác định') AS label, COUNT(*) AS count
         FROM users WHERE status='active' ${cU} GROUP BY 1 ORDER BY count DESC`, p
    ),
    query<any>(
      `SELECT COALESCE(NULLIF(TRIM(gender), ''), 'Chưa rõ') AS label, COUNT(*) AS count
         FROM users WHERE status='active' ${cU} GROUP BY 1 ORDER BY count DESC`, p
    ),
    query<any>(
      `SELECT CASE
                WHEN date_of_birth IS NULL THEN 'Chưa rõ'
                WHEN AGE(date_of_birth) < INTERVAL '25 years' THEN 'Dưới 25'
                WHEN AGE(date_of_birth) < INTERVAL '35 years' THEN '25–34'
                WHEN AGE(date_of_birth) < INTERVAL '45 years' THEN '35–44'
                ELSE '45+' END AS label, COUNT(*) AS count
         FROM users WHERE status='active' ${cU} GROUP BY 1`, p
    ),
    query<any>(
      `SELECT CASE
                WHEN hire_date IS NULL THEN 'Chưa rõ'
                WHEN AGE(hire_date) < INTERVAL '1 year' THEN 'Dưới 1 năm'
                WHEN AGE(hire_date) < INTERVAL '3 years' THEN '1–3 năm'
                WHEN AGE(hire_date) < INTERVAL '5 years' THEN '3–5 năm'
                ELSE 'Trên 5 năm' END AS label, COUNT(*) AS count
         FROM users WHERE status='active' ${cU} GROUP BY 1`, p
    ),
    // P3: thử việc (kết luận trong kỳ; chưa kết luận vẫn tính)
    queryOne<any>(
      `SELECT COUNT(*) FILTER (WHERE status='passed') AS passed,
              COUNT(*) FILTER (WHERE status='failed') AS failed
         FROM evaluations
        WHERE concluded_at IS NULL OR concluded_at::date BETWEEN ${F} AND ${T}`
    ),
    // P3: nghỉ sớm trong 90 ngày (trong kỳ)
    queryOne<any>(
      `SELECT COUNT(*) AS cnt FROM users
        WHERE left_date IS NOT NULL AND hire_date IS NOT NULL
          AND (left_date - hire_date) <= 90
          AND left_date BETWEEN ${F} AND ${T} ${cU}`, p
    ),
    // P3: turnover — số nghỉ trong kỳ
    queryOne<any>(
      `SELECT COUNT(*) AS leavers FROM users
        WHERE left_date IS NOT NULL AND left_date BETWEEN ${F} AND ${T} ${cU}`, p
    ),
    // P3: nghỉ theo tháng (trong kỳ)
    query<any>(
      `SELECT to_char(date_trunc('month', left_date), 'YYYY-MM') AS month, COUNT(*) AS count
         FROM users
        WHERE left_date IS NOT NULL AND left_date BETWEEN ${F} AND ${T} ${cU}
        GROUP BY 1 ORDER BY 1`, p
    ),
    // P2: số liệu requisition (scope theo công ty cho admin)
    getRequisitionStats(companyId),

    // ── Cơ cấu mới từ org_assignments ──
    // Theo bộ phận
    orgReady
      ? query<any>(
          `SELECT sd.name AS label, COUNT(DISTINCT oa.user_id) AS count
             FROM org_assignments oa
             JOIN users u ON u.id = oa.user_id AND u.status = 'active'
             JOIN sub_departments sd ON sd.id = oa.sub_department_id
            WHERE oa.is_active ${cOa}
            GROUP BY 1 ORDER BY count DESC LIMIT 12`, p
        )
      : Promise.resolve([] as any[]),
    // Phòng ban đang khuyết Trưởng phòng (head)
    orgReady
      ? query<any>(
          `SELECT co.name AS company, d.name AS department
             FROM departments d
             JOIN companies co ON co.id = d.company_id
            WHERE d.is_active IS NOT FALSE ${companyId ? `AND d.company_id::text = $1` : ''}
              AND NOT EXISTS (
                SELECT 1 FROM org_assignments oa
                  JOIN users u ON u.id = oa.user_id AND u.status = 'active'
                 WHERE oa.department_id = d.id AND oa.is_active AND oa.org_role = 'head')
            ORDER BY co.name, d.name LIMIT 30`, p
        )
      : Promise.resolve([] as any[]),

    // ── Pipeline theo VỊ TRÍ (hr_applications × requisitions) ──
    query<any>(
      `SELECT a.status AS label, COUNT(*) AS count
         FROM hr_applications a
         JOIN requisitions r ON r.id = a.requisition_id AND r.deleted_at IS NULL
        WHERE COALESCE(a.status, '') <> '' ${cR}
        GROUP BY a.status`, p
    ),
    // Offer 12 tháng: từng application ĐÃ TỪNG vào bước offered → kết cục hiện tại
    queryOne<any>(
      `WITH offered_apps AS (
         SELECT DISTINCT h.application_id
           FROM hr_application_history h
           JOIN hr_applications a ON a.id = h.application_id
           JOIN requisitions r ON r.id = a.requisition_id AND r.deleted_at IS NULL
          WHERE h.to_status = 'offered' AND h.created_at::date BETWEEN ${F} AND ${T} ${cR})
       SELECT COUNT(*) AS offered,
              COUNT(*) FILTER (WHERE a.status = 'hired')    AS accepted,
              COUNT(*) FILTER (WHERE a.status = 'rejected') AS declined
         FROM offered_apps o JOIN hr_applications a ON a.id = o.application_id`, p
    ),
    // Thời gian TB nằm ở từng giai đoạn (LEAD trên lịch sử chuyển trạng thái, 12 tháng)
    query<any>(
      `WITH t AS (
         SELECT h.to_status, h.created_at,
                LEAD(h.created_at) OVER (PARTITION BY h.application_id ORDER BY h.created_at) AS next_at
           FROM hr_application_history h
           JOIN hr_applications a ON a.id = h.application_id
           JOIN requisitions r ON r.id = a.requisition_id AND r.deleted_at IS NULL
          WHERE h.created_at::date BETWEEN ${F} AND ${T} ${cR})
       SELECT to_status AS label, AVG(EXTRACT(EPOCH FROM (next_at - created_at))/86400) AS count
         FROM t
        WHERE next_at IS NOT NULL AND to_status IN ('new','screening','interviewed','offered')
        GROUP BY to_status`, p
    ),

    // ── Phỏng vấn ──
    queryOne<any>(
      `SELECT
         COUNT(*) FILTER (WHERE s.status='scheduled' AND s.scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '7 days')  AS upcoming7,
         COUNT(*) FILTER (WHERE s.status='done'      AND s.scheduled_at >= NOW() - INTERVAL '30 days')               AS done30,
         COUNT(*) FILTER (WHERE s.status='cancelled' AND s.scheduled_at >= NOW() - INTERVAL '30 days')               AS cancelled30
         FROM hr_interview_schedules s
         JOIN requisitions r ON r.id = s.requisition_id AND r.deleted_at IS NULL
        WHERE TRUE ${cR}`, p
    ),
    queryOne<any>(
      `SELECT COUNT(*) AS total, AVG(sc.overall) AS avg_overall
         FROM hr_interview_scorecards sc
         JOIN requisitions r ON r.id = sc.requisition_id AND r.deleted_at IS NULL
        WHERE sc.created_at::date BETWEEN ${F} AND ${T} ${cR}`, p
    ),
    query<any>(
      `SELECT sc.recommendation AS label, COUNT(*) AS count
         FROM hr_interview_scorecards sc
         JOIN requisitions r ON r.id = sc.requisition_id AND r.deleted_at IS NULL
        WHERE sc.recommendation IS NOT NULL AND sc.created_at::date BETWEEN ${F} AND ${T} ${cR}
        GROUP BY 1 ORDER BY count DESC`, p
    ),

    // ── Nhu cầu thay thế ──
    // HĐ xác định thời hạn còn hiệu lực sắp đáo hạn (30/90/180 ngày)
    queryOne<any>(
      `SELECT
         COUNT(*) FILTER (WHERE c.end_date <= CURRENT_DATE + 30)  AS w30,
         COUNT(*) FILTER (WHERE c.end_date <= CURRENT_DATE + 90)  AS w90,
         COUNT(*)                                                 AS w180
         FROM contracts c
         JOIN users u ON u.id::text = c.employee_id AND u.status = 'active'
        WHERE c.status = 'active' AND c.end_date IS NOT NULL
          AND c.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 180 ${cUu}`, p
    ),
    // Quy trình nghỉ việc đang chạy
    queryOne<any>(
      `SELECT COUNT(*) AS c
         FROM offboarding_processes op
         JOIN users u ON u.id::text = op.user_id
        WHERE op.status = 'in_progress' ${cUu}`, p
    ),

    // Danh sách công ty (bộ lọc UI)
    query<any>(`SELECT id::text AS id, name FROM companies ORDER BY name`),
    // Giữ chân theo lứa vào làm trong kỳ (còn active đến hôm nay)
    query<any>(
      `SELECT to_char(date_trunc('month', hire_date), 'YYYY-MM') AS month,
              COUNT(*) AS hired,
              COUNT(*) FILTER (WHERE status = 'active') AS still
         FROM users
        WHERE hire_date IS NOT NULL AND hire_date BETWEEN ${F} AND ${T} ${cU}
        GROUP BY 1 ORDER BY 1`, p
    ),
    // Vào làm 12 tháng gần nhất — RIÊNG cho dự báo (không phụ thuộc bộ lọc kỳ)
    query<any>(
      `SELECT to_char(date_trunc('month', hire_date), 'YYYY-MM') AS month, COUNT(*) AS count
         FROM users
        WHERE hire_date IS NOT NULL
          AND hire_date >= (date_trunc('month', CURRENT_DATE) - INTERVAL '11 months') ${cU}
        GROUP BY 1 ORDER BY 1`, p
    ),
  ]);

  // Pipeline theo vị trí — nếu đã có dữ liệu hr_applications thì đây là nguồn CHUẨN
  // (1 CV × N vị trí = N trạng thái); kho CV cũ chỉ dùng fallback cho dữ liệu lịch sử.
  const appsByStage = buckets(appsStageRows);
  const appsTotal = appsByStage.reduce((a, b) => a + b.value, 0);

  // Dự báo tháng tới — mô hình 3 góc nhìn (CUNG pipeline + CẦU đơn tuyển + XU HƯỚNG).
  const forecastConfig = await getForecastConfig();
  const forecast = computeRecruitmentForecast(
    {
      // CUNG lấy theo trạng thái per-vị-trí (chuẩn sau cải tổ), fallback kho CV
      cvByStage: appsTotal > 0 ? appsByStage : buckets(cvStageRows),
      // XU HƯỚNG luôn dùng 12 tháng gần nhất (dự báo "tháng tới" không đổi theo bộ lọc kỳ)
      hiresByMonth: hires12Rows.map((r) => ({ month: r.month, value: toNum(r.count) })),
      requisitions: reqStats,
      turnover: { leaversByMonth: leaversRows.map((r) => ({ month: r.month, value: toNum(r.count) })) },
    },
    forecastConfig,
  );
  const forecastNextMonth = forecast.p50;
  // Đặc thù VN: quanh Tết (T12–T2) biến động nhân sự dị thường → cảnh báo trong driver
  const curMonth = new Date().getMonth() + 1;
  if ([12, 1, 2].includes(curMonth) && forecast.drivers.length < 5) {
    forecast.drivers.push('⚠ Giai đoạn quanh Tết — nhịp tuyển/nghỉ thường dị thường, dự báo có thể lệch');
  }

  const probPassed = toNum(qualityRow?.passed);
  const probFailed = toNum(qualityRow?.failed);
  const probTotal = probPassed + probFailed;
  const leavers = toNum(turnoverRow?.leavers);
  const hc = toNum(wfRow?.headcount);

  // ── Offer 12 tháng ──
  const offSent = toNum(offerRow?.offered);
  const offAcc  = toNum(offerRow?.accepted);
  const offDec  = toNum(offerRow?.declined);
  const offDecided = offAcc + offDec;

  // ── HĐ sắp đáo hạn ──
  const w30  = toNum(contractRow?.w30);
  const w90  = toNum(contractRow?.w90);
  const w180 = toNum(contractRow?.w180);

  // ── Kế hoạch tuyển 1/3/6 tháng ──
  // Nhu cầu(N) = vị trí còn thiếu ở đơn đang mở + attrition tháng × N − pipeline gần chốt.
  // HĐ đáo hạn hiển thị riêng làm "rủi ro cần theo dõi" (thường được gia hạn, không cộng thẳng).
  // Attrition tính trên SỐ THÁNG THỰC của kỳ đang lọc (leavers là số nghỉ trong kỳ).
  const rangeDays = Math.max(1, (new Date(to).getTime() - new Date(from).getTime()) / 86400000);
  const monthsInRange = Math.max(1, rangeDays / 30.44);
  const attritionMonthly = leavers / monthsInRange;
  const openRemaining = Math.max(reqStats.totalTarget - reqStats.totalFilled, 0);
  const offeredNow = appsByStage.find((b) => b.label === 'offered')?.value ?? 0;
  const pipelineOffset = Math.round(offeredNow * forecastConfig.stageHireProb.offered * 10) / 10;
  const hiringPlan = [1, 3, 6].map((n) => {
    const expectedAttrition = Math.round(attritionMonthly * n * 10) / 10;
    return {
      horizonMonths: n,
      openRemaining,
      expectedAttrition,
      contractRisk: n === 1 ? w30 : n === 3 ? w90 : w180,
      pipelineOffset,
      total: Math.max(0, Math.round(openRemaining + expectedAttrition - pipelineOffset)),
    };
  });

  return {
    funnel: {
      invited: toNum(funnelRow?.invited), submitted: toNum(funnelRow?.submitted),
      confirmed: toNum(funnelRow?.confirmed), sent_to_admin: toNum(funnelRow?.sent_to_admin),
      approved: toNum(funnelRow?.approved), rejected: toNum(funnelRow?.rejected),
    },
    cycleTime: {
      inviteToSubmit: round1(cycleRow?.invite_to_submit), submitToConfirm: round1(cycleRow?.submit_to_confirm),
      confirmToSent: round1(cycleRow?.confirm_to_sent), sentToApprove: round1(cycleRow?.sent_to_approve),
      submitToApprove: round1(cycleRow?.submit_to_approve),
    },
    hiresByMonth: hiresRows.map((r) => ({ month: r.month, value: toNum(r.count) })),
    cvByStage: buckets(cvStageRows),
    cvBySource: buckets(cvSourceRows),
    cvTotal: toNum(cvTotalRow?.count),
    jd: {
      active: toNum(jdRow?.active), total: toNum(jdRow?.total),
      openList: jdOpenRows.map((r) => ({ title: r.title, department: r.department })),
    },
    workforce: {
      headcount: toNum(wfRow?.headcount), newHires30d: toNum(wfRow?.new30), newHires90d: toNum(wfRow?.new90),
      byCompany: buckets(byCompanyRows), byDepartment: buckets(byDeptRows),
      bySubDepartment: buckets(bySubDeptRows),
      byEmploymentType: buckets(byEmpRows), byGender: buckets(byGenderRows),
      byAge: buckets(byAgeRows), byTenure: buckets(byTenureRows),
      unitsMissingHead: missingHeadRows.map((r: any) => ({ company: r.company, department: r.department })),
    },
    applications: {
      total: appsTotal,
      byStage: appsByStage,
      offer12m: {
        offered: offSent, accepted: offAcc, declined: offDec,
        pending: Math.max(offSent - offDecided, 0),
        acceptRate: offDecided > 0 ? Math.round((offAcc / offDecided) * 100) : 0,
      },
      stageDurations: stageDurRows.map((r: any) => ({ label: r.label, value: round1(r.count) })),
    },
    interviews: {
      upcoming7d: toNum(interviewRow?.upcoming7),
      done30d: toNum(interviewRow?.done30),
      cancelled30d: toNum(interviewRow?.cancelled30),
      scorecards12m: toNum(scAggRow?.total),
      avgOverall: round1(scAggRow?.avg_overall),
      byRecommendation: buckets(scRecRows),
    },
    replacement: {
      contractsExpiring90d: w90,
      contractsExpiringByWindow: [
        { label: '≤ 30 ngày', value: w30 },
        { label: '31–90 ngày', value: Math.max(w90 - w30, 0) },
        { label: '91–180 ngày', value: Math.max(w180 - w90, 0) },
      ],
      offboardingInProgress: toNum(offbRow?.c),
    },
    hiringPlan,
    range: { from, to },
    companies: companiesRows.map((r: any) => ({ id: r.id, name: r.name })),
    cohorts: cohortRows.map((r: any) => ({ month: r.month, hired: toNum(r.hired), still: toNum(r.still) })),
    quality: {
      probationPassed: probPassed, probationFailed: probFailed,
      probationPassRate: probTotal > 0 ? Math.round((probPassed / probTotal) * 100) : 0,
      earlyAttrition90d: toNum(earlyAttRow?.cnt),
    },
    turnover: {
      leavers12m: leavers,
      turnoverRate: hc > 0 ? Math.round((leavers / hc) * 1000) / 10 : 0,
      leaversByMonth: leaversRows.map((r) => ({ month: r.month, value: toNum(r.count) })),
    },
    requisitions: reqStats,
    forecast,
    forecastNextMonth,
  };
}
