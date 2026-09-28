/**
 * Chi Phí — Dashboard phân tích & cảnh báo.
 *
 * Nguyên tắc số liệu (chốt):
 *  - Tiền luôn dùng `amount_base` (VND quy đổi), KHÔNG dùng `amount` (đa tiền tệ).
 *  - Gom theo `expense_date` (tháng PHÁT SINH), fallback `created_at` khi trống.
 *  - Mặc định chỉ tính phiếu "có thật" (đã duyệt trở đi). `includePending` thêm phiếu chờ duyệt.
 *  - So sánh tháng dùng TRUNG VỊ 6 tháng trước (median chống outlier), KHÔNG dùng trung bình.
 *
 * TODO(config): 3 ngưỡng dưới nên đưa ra system_settings + UI (xem skill hardcode-to-config).
 */
import { query } from '@/lib/db';

/** Trạng thái được coi là chi phí "có thật". */
export const REAL_STATUSES = ['approved', 'sent_to_accounting', 'posted', 'paid'] as const;

/** Ngưỡng cảnh báo lệch tháng: phải vượt CẢ HAI để tránh spam khoản nhỏ. */
export const VARIANCE_PCT = 0.30;              // lệch ≥ 30%
export const VARIANCE_MIN_ABS = 1_000_000;     // và chênh tuyệt đối ≥ 1.000.000đ
export const STUCK_APPROVAL_DAYS = 7;          // phiếu kẹt duyệt quá N ngày
export const ADVANCE_UNSETTLED_DAYS = 30;      // tạm ứng chưa quyết toán quá N ngày
export const RECURRING_LOOKBACK_MONTHS = 3;    // xuất hiện đủ N tháng liên tiếp ⇒ coi là định kỳ

export type WarningKind =
  | 'variance_high' | 'variance_low' | 'recurring_missing'
  | 'stuck_approval' | 'advance_unsettled' | 'no_attachment';

export interface ExpenseWarning {
  kind: WarningKind;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  amount?: number;
  expenseId?: string;
}

/** Tối đa 8 chuỗi trên biểu đồ (theo quy tắc categorical); dư → gộp "Khác". */
export const MAX_CHART_SERIES = 8;

export interface CategoryRow {
  category_id: string | null;
  name: string;
  current: number;
  median6: number;
  diffPct: number | null;   // null khi không có nền so sánh
  spark: number[];          // 6 tháng gần nhất (cũ → mới), chưa gồm tháng hiện tại
  /** Vị trí màu trên biểu đồ; null = bị gộp vào "Khác". */
  slot: number | null;
}

/** Chuỗi vẽ trên biểu đồ — thứ tự slot ỔN ĐỊNH (theo id), màu bám thực thể chứ không bám thứ hạng. */
export interface ChartSeries { key: string; name: string }

export interface ExpenseAnalytics {
  month: string;
  includePending: boolean;
  kpi: {
    total: number; median6: number; diffPct: number | null;
    pendingCount: number; pendingAmount: number;
    unsettledAdvanceCount: number; unsettledAdvanceAmount: number;
    noAttachmentCount: number;
  };
  months: string[];                                   // 12 tháng (cũ → mới)
  chartSeries: ChartSeries[];                         // ≤ 8, thứ tự slot màu
  series: Array<Record<string, number | string>>;     // [{ month, '<key>': số, ... }]
  categories: CategoryRow[];                          // bảng số (đủ mọi loại)
  topSuppliers: Array<{ supplier_name: string; total: number; count: number }>;
  warnings: ExpenseWarning[];
}

const MONEY = `COALESCE(e.amount_base, ROUND(e.amount * e.exchange_rate))::bigint`;
const EDATE = `COALESCE(e.expense_date, e.created_at::date)`;

/** 'YYYY-MM' của tháng lệch `delta` so với tháng gốc. */
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function median(nums: number[]): number {
  const xs = nums.filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (!xs.length) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : Math.round((xs[mid - 1] + xs[mid]) / 2);
}

function pct(current: number, base: number): number | null {
  if (base <= 0) return null;
  return (current - base) / base;
}

const fmtVND = (n: number) => `${new Intl.NumberFormat('vi-VN').format(Math.round(n))} đ`;

export async function getExpenseAnalytics(
  companyId: string,
  month: string,                 // 'YYYY-MM'
  includePending = false,
): Promise<ExpenseAnalytics> {
  const statuses: string[] = [...REAL_STATUSES, ...(includePending ? ['pending_approval'] : [])];
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(month, i - 11)); // cũ → mới
  const from = `${months[0]}-01`;

  // ── 1. Tổng theo (tháng × loại) trong 12 tháng ────────────────────────────
  const rows = await query<{ month: string; category_id: string | null; name: string | null; color: string | null; total: string }>(
    `SELECT to_char(date_trunc('month', ${EDATE}), 'YYYY-MM') AS month,
            e.category_id, c.name, c.color,
            SUM(${MONEY})::bigint AS total
       FROM expenses e
       LEFT JOIN expense_categories c ON c.id = e.category_id
      WHERE e.company_id = $1::uuid
        AND e.status = ANY($2::text[])
        AND ${EDATE} >= $3::date
      GROUP BY 1, 2, 3, 4`,
    [companyId, statuses, from]
  );

  // Gom về map: catKey → { name, byMonth }. KHÔNG dùng màu tự đặt trong DB cho biểu đồ:
  // màu series lấy từ bảng màu categorical đã validate ở client (CVD-safe), gán theo slot.
  type Cat = { key: string; id: string | null; name: string; byMonth: Map<string, number> };
  const cats = new Map<string, Cat>();
  for (const r of rows) {
    const key = r.category_id ?? '__none__';
    if (!cats.has(key)) cats.set(key, { key, id: r.category_id, name: r.name || 'Chưa phân loại', byMonth: new Map() });
    cats.get(key)!.byMonth.set(r.month, Number(r.total));
  }

  const prev6 = months.slice(-7, -1); // 6 tháng ngay trước tháng hiện tại
  const sumAll = (c: Cat) => months.reduce((s, m) => s + (c.byMonth.get(m) ?? 0), 0);

  // Chọn ≤8 chuỗi vẽ biểu đồ: top theo TỔNG 12 THÁNG (ổn định trong 1 lần tải),
  // rồi sắp theo id để slot màu KHÔNG đổi khi thứ hạng tháng thay đổi.
  const all = [...cats.values()];
  let charted: Cat[];
  let otherKeys: Set<string> = new Set();
  if (all.length <= MAX_CHART_SERIES) {
    charted = all.slice().sort((a, b) => a.key.localeCompare(b.key));
  } else {
    const top = all.slice().sort((a, b) => sumAll(b) - sumAll(a)).slice(0, MAX_CHART_SERIES - 1);
    const topKeys = new Set(top.map((c) => c.key));
    otherKeys = new Set(all.filter((c) => !topKeys.has(c.key)).map((c) => c.key));
    const other: Cat = { key: '__other__', id: null, name: 'Khác', byMonth: new Map() };
    for (const m of months) {
      const s = all.filter((c) => otherKeys.has(c.key)).reduce((acc, c) => acc + (c.byMonth.get(m) ?? 0), 0);
      other.byMonth.set(m, s);
    }
    charted = [...top.sort((a, b) => a.key.localeCompare(b.key)), other];
  }

  const chartSeries: ChartSeries[] = charted.map((c) => ({ key: c.key, name: c.name }));
  const slotOf = new Map(charted.map((c, i) => [c.key, i]));

  const categories: CategoryRow[] = all.map((c) => {
    const current = c.byMonth.get(month) ?? 0;
    const spark = prev6.map((m) => c.byMonth.get(m) ?? 0);
    const med = median(spark);
    return {
      category_id: c.id, name: c.name, current, median6: med, diffPct: pct(current, med), spark,
      slot: slotOf.has(c.key) ? slotOf.get(c.key)! : null,
    };
  }).sort((a, b) => b.current - a.current);

  const series = months.map((m) => {
    const row: Record<string, number | string> = { month: m };
    for (const c of charted) row[c.key] = c.byMonth.get(m) ?? 0;
    return row;
  });

  const totalByMonth = (m: string) => all.reduce((s, c) => s + (c.byMonth.get(m) ?? 0), 0);
  const total = totalByMonth(month);
  const medianTotal = median(prev6.map(totalByMonth));

  // ── 2. KPI phụ ────────────────────────────────────────────────────────────
  const [pendingRow] = await query<{ n: string; amt: string }>(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(${MONEY}), 0)::bigint AS amt
       FROM expenses e WHERE e.company_id = $1::uuid AND e.status = 'pending_approval'`,
    [companyId]
  );
  const [advRow] = await query<{ n: string; amt: string }>(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(${MONEY}), 0)::bigint AS amt
       FROM expenses e
       JOIN expense_categories c ON c.id = e.category_id
      WHERE e.company_id = $1::uuid AND c.flow_type = 'advance'
        AND e.settlement_status <> 'settled' AND e.status = ANY($2::text[])`,
    [companyId, [...REAL_STATUSES]]
  );

  // ── 3. Cảnh báo ───────────────────────────────────────────────────────────
  const warnings: ExpenseWarning[] = [];

  // 3a. Lệch tháng theo loại (cao hơn / thấp hơn)
  for (const c of categories) {
    if (c.median6 <= 0) continue;
    const diff = c.current - c.median6;
    if (Math.abs(diff) < VARIANCE_MIN_ABS) continue;
    if (Math.abs(diff) / c.median6 < VARIANCE_PCT) continue;
    const p = Math.round((Math.abs(diff) / c.median6) * 100);
    warnings.push(diff > 0
      ? {
        kind: 'variance_high', severity: 'medium', amount: diff,
        title: `${c.name} cao hơn ${p}% so với thường lệ`,
        detail: `Tháng này ${fmtVND(c.current)} · trung vị 6 tháng ${fmtVND(c.median6)} (+${fmtVND(diff)}).`,
      }
      : {
        kind: 'variance_low', severity: 'high', amount: -diff,
        title: `${c.name} thấp hơn ${p}% — nghi thiếu/quên`,
        detail: `Tháng này ${fmtVND(c.current)} · trung vị 6 tháng ${fmtVND(c.median6)} (−${fmtVND(-diff)}). Kiểm tra xem có phiếu chưa tạo.`,
      });
  }

  // 3b. Định kỳ chưa tạo — SUY LUẬN: (loại × NCC) có mặt đủ N tháng liền trước, tháng này vắng.
  const recurRows = await query<{ month: string; category_id: string | null; name: string | null; supplier_name: string | null }>(
    `SELECT DISTINCT to_char(date_trunc('month', ${EDATE}), 'YYYY-MM') AS month,
            e.category_id, c.name, e.supplier_name
       FROM expenses e
       LEFT JOIN expense_categories c ON c.id = e.category_id
      WHERE e.company_id = $1::uuid AND e.status = ANY($2::text[])
        AND ${EDATE} >= $3::date
        AND e.supplier_name IS NOT NULL AND btrim(e.supplier_name) <> ''`,
    [companyId, statuses, `${shiftMonth(month, -RECURRING_LOOKBACK_MONTHS)}-01`]
  );
  const seen = new Map<string, { label: string; months: Set<string> }>();
  for (const r of recurRows) {
    const key = `${r.category_id ?? '_'}|${r.supplier_name}`;
    if (!seen.has(key)) seen.set(key, { label: `${r.name || 'Chưa phân loại'} · ${r.supplier_name}`, months: new Set() });
    seen.get(key)!.months.add(r.month);
  }
  const lookback = Array.from({ length: RECURRING_LOOKBACK_MONTHS }, (_, i) => shiftMonth(month, -(i + 1)));
  for (const { label, months: ms } of seen.values()) {
    const everyPrevMonth = lookback.every((m) => ms.has(m));
    if (everyPrevMonth && !ms.has(month)) {
      warnings.push({
        kind: 'recurring_missing', severity: 'high',
        title: `Chưa tạo phiếu định kỳ: ${label}`,
        detail: `Khoản này có đều ${RECURRING_LOOKBACK_MONTHS} tháng liền trước nhưng tháng ${month} chưa thấy phiếu nào.`,
      });
    }
  }

  // 3c. Kẹt duyệt
  const stuck = await query<{ id: string; code: string | null; title: string; amt: string; days: string }>(
    `SELECT DISTINCT ON (e.id) e.id, e.code, e.title, ${MONEY} AS amt,
            EXTRACT(day FROM now() - a.created_at)::int AS days
       FROM expenses e
       JOIN expense_approvals a ON a.expense_id = e.id AND a.status = 'pending'
      WHERE e.company_id = $1::uuid AND e.status = 'pending_approval'
        AND a.created_at < now() - ($2 || ' days')::interval
      ORDER BY e.id, a.step_order
      LIMIT 20`,
    [companyId, String(STUCK_APPROVAL_DAYS)]
  );
  for (const s of stuck) {
    warnings.push({
      kind: 'stuck_approval', severity: 'medium', expenseId: s.id, amount: Number(s.amt),
      title: `Kẹt duyệt ${s.days} ngày: ${s.code || ''} ${s.title}`.trim(),
      detail: `${fmtVND(Number(s.amt))} — chưa ai duyệt sau ${s.days} ngày.`,
    });
  }

  // 3d. Tạm ứng chưa quyết toán quá hạn
  const advOld = await query<{ id: string; code: string | null; title: string; amt: string; days: string }>(
    `SELECT e.id, e.code, e.title, ${MONEY} AS amt,
            EXTRACT(day FROM now() - e.updated_at)::int AS days
       FROM expenses e
       JOIN expense_categories c ON c.id = e.category_id
      WHERE e.company_id = $1::uuid AND c.flow_type = 'advance'
        AND e.settlement_status <> 'settled' AND e.status = ANY($2::text[])
        AND e.updated_at < now() - ($3 || ' days')::interval
      ORDER BY e.updated_at ASC LIMIT 20`,
    [companyId, [...REAL_STATUSES], String(ADVANCE_UNSETTLED_DAYS)]
  );
  for (const a of advOld) {
    warnings.push({
      kind: 'advance_unsettled', severity: 'medium', expenseId: a.id, amount: Number(a.amt),
      title: `Tạm ứng chưa quyết toán ${a.days} ngày: ${a.code || ''} ${a.title}`.trim(),
      detail: `${fmtVND(Number(a.amt))} — quá ${ADVANCE_UNSETTLED_DAYS} ngày chưa kê thực chi.`,
    });
  }

  // 3e. Đã duyệt nhưng không có chứng từ (2 tháng gần nhất)
  const noAtt = await query<{ id: string; code: string | null; title: string; amt: string }>(
    `SELECT e.id, e.code, e.title, ${MONEY} AS amt
       FROM expenses e
      WHERE e.company_id = $1::uuid AND e.status = ANY($2::text[])
        AND ${EDATE} >= $3::date
        AND NOT EXISTS (SELECT 1 FROM expense_attachments a WHERE a.expense_id = e.id)
      ORDER BY ${MONEY} DESC LIMIT 20`,
    [companyId, [...REAL_STATUSES], `${shiftMonth(month, -1)}-01`]
  );
  for (const n of noAtt) {
    warnings.push({
      kind: 'no_attachment', severity: 'low', expenseId: n.id, amount: Number(n.amt),
      title: `Thiếu chứng từ: ${n.code || ''} ${n.title}`.trim(),
      detail: `${fmtVND(Number(n.amt))} — đã duyệt nhưng chưa đính chứng từ nào.`,
    });
  }

  // ── 4. Top nhà cung cấp (tháng hiện tại) ──────────────────────────────────
  const topSuppliers = (await query<{ supplier_name: string; total: string; count: string }>(
    `SELECT e.supplier_name, SUM(${MONEY})::bigint AS total, COUNT(*)::int AS count
       FROM expenses e
      WHERE e.company_id = $1::uuid AND e.status = ANY($2::text[])
        AND to_char(date_trunc('month', ${EDATE}), 'YYYY-MM') = $3
        AND e.supplier_name IS NOT NULL AND btrim(e.supplier_name) <> ''
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
    [companyId, statuses, month]
  )).map((r) => ({ supplier_name: r.supplier_name, total: Number(r.total), count: Number(r.count) }));

  const severityRank = { high: 0, medium: 1, low: 2 } as const;
  warnings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || (b.amount ?? 0) - (a.amount ?? 0));

  return {
    month,
    includePending,
    kpi: {
      total, median6: medianTotal, diffPct: pct(total, medianTotal),
      pendingCount: Number(pendingRow?.n ?? 0), pendingAmount: Number(pendingRow?.amt ?? 0),
      unsettledAdvanceCount: Number(advRow?.n ?? 0), unsettledAdvanceAmount: Number(advRow?.amt ?? 0),
      noAttachmentCount: noAtt.length,
    },
    months, chartSeries, series, categories, topSuppliers, warnings,
  };
}
