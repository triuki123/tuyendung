/**
 * solaceReportService — Báo cáo quán SOLACE.
 * Tổng hợp theo KHOẢNG NGÀY kinh doanh (giờ VN): doanh thu & phương thức thu,
 * giá vốn (COGS) + hao hụt từ biến động kho, món bán chạy, tiêu hao nguyên liệu,
 * chuỗi doanh thu theo ngày và lịch sử kết ca. Chỉ đọc — không ghi.
 */
import { query, queryOne } from '@/lib/db';

export interface ReportRange {
  from: string; // 'YYYY-MM-DD' (ngày kinh doanh, giờ VN)
  to: string;   // inclusive
}

export interface RevenueSummary {
  total_orders: number;
  gross_subtotal: number;  // tổng tiền hàng trước giảm giá
  discount_total: number;  // tổng giảm giá
  net_sales: number;       // doanh thu thuần = SUM(total) đơn không huỷ (gồm cả nợ — cơ sở dồn tích)
  total_revenue: number;   // đã thu (paid)
  cash_total: number;
  bankqr_total: number;
  wallet_total: number;
  unpaid_total: number;    // còn nợ / chưa thu
}

export interface CogsSummary {
  sale_cogs: number;   // giá vốn hàng bán (xuất kho do bán)
  waste_cost: number;  // chi phí hao hụt
}

export interface PnlSummary {
  net_sales: number;          // doanh thu thuần (đơn không huỷ)
  cogs: number;               // giá vốn hàng bán
  gross_profit: number;       // net_sales - cogs
  waste_cost: number;         // hao hụt nguyên liệu
  operating_expense: number;  // chi phí vận hành (Sổ Quỹ: category 'expense')
  net_profit: number;         // gross_profit - waste_cost - operating_expense
  net_margin_pct: number;     // net_profit / net_sales * 100
  purchase_total: number;     // (tham khảo) tiền đã chi mua nguyên liệu trong kỳ
  unpaid_total: number;       // (tham khảo) còn phải thu (nợ) trong kỳ
}

export interface TopProduct {
  product_id: string | null;
  name: string;
  qty: number;
  revenue: number;
}

export interface IngredientUsage {
  ingredient_id: string;
  name: string;
  unit: string;
  qty_used: number;   // tổng lượng xuất (bán + hao hụt), số dương
  cost: number;       // tổng giá vốn xuất (đồng)
}

export interface DailyPoint {
  business_date: string;
  orders: number;
  revenue: number;
}

export interface HourlyPoint {
  hour: number;     // 0–23 (giờ VN theo lúc tạo đơn)
  orders: number;
  revenue: number;  // đã thu trong giờ đó
}

export interface ShiftRow {
  business_date: string;
  total_orders: number;
  total_revenue: number;
  cash_total: number;
  bankqr_total: number;
  wallet_total: number;
  unpaid_total: number;
  cash_counted: number | null;
  variance: number;
  closed_by_name: string | null;
  created_at: string;
}

/** Một phiên ca đã đóng (mở/đóng + quỹ đầu ca) — nguồn solace_shifts. */
export interface ShiftSessionRow {
  id: string;
  business_date: string;
  shift_label: string | null;
  opened_by_name: string | null;
  closed_by_name: string | null;
  opened_at: string;
  closed_at: string | null;
  opening_float: number;
  total_orders: number;
  total_revenue: number;
  cash_total: number;
  bankqr_total: number;
  wallet_total: number;
  unpaid_total: number;
  expected_cash: number;
  cash_counted: number | null;
  variance: number;
}

/** Tổng hợp theo nhân viên trực ca (gộp các phiên ca họ mở trong kỳ). */
export interface StaffShiftSummary {
  opened_by: string | null;
  name: string;
  shifts_count: number;
  total_orders: number;
  total_revenue: number;
  cash_total: number;
  bankqr_total: number;
  wallet_total: number;
  variance_total: number;  // tổng lệch quỹ (chỉ phiên đã đếm tiền)
}

export interface SolaceReport {
  range: ReportRange;
  revenue: RevenueSummary;
  cogs: CogsSummary;
  gross_profit: number;     // total_revenue - sale_cogs
  margin_pct: number;       // gross_profit / total_revenue * 100 (0 nếu doanh thu = 0)
  pnl: PnlSummary;          // báo cáo lãi/lỗ (dồn tích + chi phí từ Sổ Quỹ)
  top_products: TopProduct[];
  ingredient_usage: IngredientUsage[];
  daily: DailyPoint[];
  hourly: HourlyPoint[];
  shifts: ShiftRow[];
  shift_sessions: ShiftSessionRow[];   // phiên ca (mở/đóng) đã chốt trong kỳ
  staff_summary: StaffShiftSummary[];  // tổng hợp theo nhân viên trực ca
}

/** Khoảng ngày mặc định = 30 ngày gần nhất tính theo ngày kinh doanh (giờ VN). */
export async function defaultRange(): Promise<ReportRange> {
  const r = await queryOne<{ to: string; from: string }>(
    `SELECT to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS "to",
            to_char((now() AT TIME ZONE 'Asia/Ho_Chi_Minh') - INTERVAL '29 days', 'YYYY-MM-DD') AS "from"`
  );
  return { from: r?.from ?? '1970-01-01', to: r?.to ?? '1970-01-01' };
}

/** Báo cáo tổng hợp cho khoảng [from, to] (bao gồm cả 2 đầu). */
export async function getReport(range: ReportRange): Promise<SolaceReport> {
  const { from, to } = range;

  const [revenue, cogs, cashFlow, topProducts, ingredientUsage, daily, hourly, shifts, shiftSessions, staffSummary] = await Promise.all([
    revenueSummary(from, to),
    cogsSummary(from, to),
    cashFlowSummary(from, to),
    topProductsRange(from, to, 10),
    ingredientUsageRange(from, to, 20),
    dailySeries(from, to),
    hourlySeries(from, to),
    shiftHistory(from, to),
    shiftSessionHistory(from, to),
    staffShiftSummary(from, to),
  ]);

  const grossProfit = revenue.total_revenue - cogs.sale_cogs;
  const marginPct = revenue.total_revenue > 0
    ? Math.round((grossProfit / revenue.total_revenue) * 1000) / 10
    : 0;

  // Lãi/Lỗ (dồn tích): doanh thu thuần − giá vốn − hao hụt − chi phí vận hành.
  const pnlGross = revenue.net_sales - cogs.sale_cogs;
  const netProfit = pnlGross - cogs.waste_cost - cashFlow.expense;
  const pnl: PnlSummary = {
    net_sales: revenue.net_sales,
    cogs: cogs.sale_cogs,
    gross_profit: pnlGross,
    waste_cost: cogs.waste_cost,
    operating_expense: cashFlow.expense,
    net_profit: netProfit,
    net_margin_pct: revenue.net_sales > 0 ? Math.round((netProfit / revenue.net_sales) * 1000) / 10 : 0,
    purchase_total: cashFlow.purchase,
    unpaid_total: revenue.unpaid_total,
  };

  return {
    range,
    revenue,
    cogs,
    gross_profit: grossProfit,
    margin_pct: marginPct,
    pnl,
    top_products: topProducts,
    ingredient_usage: ingredientUsage,
    daily,
    hourly,
    shifts,
    shift_sessions: shiftSessions,
    staff_summary: staffSummary,
  };
}

async function revenueSummary(from: string, to: string): Promise<RevenueSummary> {
  const [r, cashFlow, walletFlow] = await Promise.all([
    queryOne<Record<string, number>>(
    `SELECT
        COUNT(*)::int AS total_orders,
        COALESCE(SUM(subtotal), 0)::bigint AS gross_subtotal,
        COALESCE(SUM(discount), 0)::bigint AS discount_total,
        COALESCE(SUM(total), 0)::bigint AS net_sales,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN paid_amount ELSE 0 END), 0)::bigint AS total_revenue,
        COALESCE(SUM(CASE WHEN payment_status <> 'paid' THEN total - paid_amount ELSE 0 END), 0)::bigint AS unpaid_total
       FROM solace_orders
      WHERE business_date BETWEEN $1 AND $2 AND status <> 'cancelled'`,
    [from, to]
    ),
    queryOne<{ cash_total: number; bankqr_total: number }>(
      `SELECT
          COALESCE(SUM(CASE WHEN account = 'cash' THEN CASE WHEN direction='in' THEN amount ELSE -amount END ELSE 0 END), 0)::bigint AS cash_total,
          COALESCE(SUM(CASE WHEN account = 'bank' THEN CASE WHEN direction='in' THEN amount ELSE -amount END ELSE 0 END), 0)::bigint AS bankqr_total
         FROM solace_cash_txns
        WHERE business_date BETWEEN $1 AND $2 AND ref_type = 'order'`,
      [from, to]
    ),
    queryOne<{ wallet_total: number }>(
      `SELECT COALESCE(SUM(CASE WHEN type = 'payment' THEN -amount ELSE 0 END), 0)::bigint AS wallet_total
         FROM solace_wallet_txns
        WHERE ref_order_id IN (SELECT id FROM solace_orders WHERE business_date BETWEEN $1 AND $2)`,
      [from, to]
    ),
  ]);
  return {
    total_orders: Number(r?.total_orders ?? 0),
    gross_subtotal: Number(r?.gross_subtotal ?? 0),
    discount_total: Number(r?.discount_total ?? 0),
    net_sales: Number(r?.net_sales ?? 0),
    total_revenue: Number(r?.total_revenue ?? 0),
    cash_total: Number(cashFlow?.cash_total ?? 0),
    bankqr_total: Number(cashFlow?.bankqr_total ?? 0),
    wallet_total: Number(walletFlow?.wallet_total ?? 0),
    unpaid_total: Number(r?.unpaid_total ?? 0),
  };
}

/** Giá vốn từ biến động kho (theo ngày VN của created_at). 'out'+reason 'sale' = giá vốn bán; 'waste' = hao hụt. */
async function cogsSummary(from: string, to: string): Promise<CogsSummary> {
  const r = await queryOne<{ sale_cogs: number; waste_cost: number }>(
    `SELECT
        COALESCE(SUM(CASE WHEN type = 'out'   THEN ABS(qty) * unit_cost ELSE 0 END), 0)::bigint AS sale_cogs,
        COALESCE(SUM(CASE WHEN type = 'waste' THEN ABS(qty) * unit_cost ELSE 0 END), 0)::bigint AS waste_cost
       FROM solace_stock_movements
      WHERE (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1 AND $2`,
    [from, to]
  );
  return { sale_cogs: Number(r?.sale_cogs ?? 0), waste_cost: Number(r?.waste_cost ?? 0) };
}

/** Chi phí vận hành + tiền mua nguyên liệu trong kỳ (từ Sổ Quỹ, theo business_date). */
async function cashFlowSummary(from: string, to: string): Promise<{ expense: number; purchase: number }> {
  const r = await queryOne<{ expense: number; purchase: number }>(
    `SELECT
        COALESCE(SUM(CASE WHEN category = 'expense'  AND direction = 'out' THEN amount ELSE 0 END), 0)::bigint AS expense,
        COALESCE(SUM(CASE WHEN category = 'purchase' AND direction = 'out' THEN amount ELSE 0 END), 0)::bigint AS purchase
       FROM solace_cash_txns
      WHERE business_date BETWEEN $1 AND $2`,
    [from, to]
  );
  return { expense: Number(r?.expense ?? 0), purchase: Number(r?.purchase ?? 0) };
}

async function topProductsRange(from: string, to: string, limit: number): Promise<TopProduct[]> {
  const rows = await query<TopProduct>(
    `SELECT oi.product_id,
            COALESCE(MAX(oi.name_snapshot), 'Món đã xoá') AS name,
            SUM(oi.qty)::int AS qty,
            SUM(oi.line_total)::bigint AS revenue
       FROM solace_order_items oi
       JOIN solace_orders o ON o.id = oi.order_id
      WHERE o.business_date BETWEEN $1 AND $2 AND o.status <> 'cancelled'
      GROUP BY oi.product_id
      ORDER BY qty DESC, revenue DESC
      LIMIT $3`,
    [from, to, limit]
  );
  return rows.map(r => ({ ...r, qty: Number(r.qty), revenue: Number(r.revenue) }));
}

async function ingredientUsageRange(from: string, to: string, limit: number): Promise<IngredientUsage[]> {
  const rows = await query<IngredientUsage>(
    `SELECT m.ingredient_id,
            i.name, i.unit,
            COALESCE(SUM(ABS(m.qty)), 0) AS qty_used,
            COALESCE(SUM(ABS(m.qty) * m.unit_cost), 0)::bigint AS cost
       FROM solace_stock_movements m
       JOIN solace_ingredients i ON i.id = m.ingredient_id
      WHERE m.type IN ('out', 'waste')
        AND (m.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1 AND $2
      GROUP BY m.ingredient_id, i.name, i.unit
      ORDER BY cost DESC
      LIMIT $3`,
    [from, to, limit]
  );
  return rows.map(r => ({ ...r, qty_used: Number(r.qty_used), cost: Number(r.cost) }));
}

async function dailySeries(from: string, to: string): Promise<DailyPoint[]> {
  const rows = await query<{ business_date: string; orders: number; revenue: number }>(
    `SELECT to_char(business_date, 'YYYY-MM-DD') AS business_date,
            COUNT(*)::int AS orders,
            COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN paid_amount ELSE 0 END), 0)::bigint AS revenue
       FROM solace_orders
      WHERE business_date BETWEEN $1 AND $2 AND status <> 'cancelled'
      GROUP BY business_date
      ORDER BY business_date ASC`,
    [from, to]
  );
  return rows.map(r => ({ business_date: r.business_date, orders: Number(r.orders), revenue: Number(r.revenue) }));
}

/** Doanh thu & số đơn theo GIỜ (giờ VN của lúc tạo đơn) — phục vụ báo cáo X/Z, biết giờ cao điểm. */
async function hourlySeries(from: string, to: string): Promise<HourlyPoint[]> {
  const rows = await query<{ hour: number; orders: number; revenue: number }>(
    `SELECT EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int AS hour,
            COUNT(*)::int AS orders,
            COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN paid_amount ELSE 0 END), 0)::bigint AS revenue
       FROM solace_orders
      WHERE business_date BETWEEN $1 AND $2 AND status <> 'cancelled'
      GROUP BY hour
      ORDER BY hour ASC`,
    [from, to]
  );
  return rows.map(r => ({ hour: Number(r.hour), orders: Number(r.orders), revenue: Number(r.revenue) }));
}

async function shiftHistory(from: string, to: string): Promise<ShiftRow[]> {
  const rows = await query<ShiftRow>(
    `SELECT to_char(sc.business_date, 'YYYY-MM-DD') AS business_date,
            sc.total_orders, sc.total_revenue, sc.cash_total, sc.bankqr_total, sc.wallet_total,
            sc.unpaid_total, sc.cash_counted, sc.variance,
            u.name AS closed_by_name, sc.created_at
       FROM solace_shift_closes sc
       LEFT JOIN users u ON u.id::text = sc.closed_by
      WHERE sc.business_date BETWEEN $1 AND $2
      ORDER BY sc.business_date DESC`,
    [from, to]
  );
  return rows.map(r => ({
    ...r,
    total_orders: Number(r.total_orders),
    total_revenue: Number(r.total_revenue),
    cash_total: Number(r.cash_total),
    bankqr_total: Number(r.bankqr_total),
    wallet_total: Number(r.wallet_total),
    unpaid_total: Number(r.unpaid_total),
    cash_counted: r.cash_counted != null ? Number(r.cash_counted) : null,
    variance: Number(r.variance),
  }));
}

/** Lịch sử PHIÊN CA đã đóng (solace_shifts) trong kỳ — mới nhất trước. */
async function shiftSessionHistory(from: string, to: string): Promise<ShiftSessionRow[]> {
  const rows = await query<ShiftSessionRow>(
    `SELECT s.id,
            to_char(s.business_date, 'YYYY-MM-DD') AS business_date,
            s.shift_label,
            uo.name AS opened_by_name, uc.name AS closed_by_name,
            s.opened_at, s.closed_at, s.opening_float,
            s.total_orders, s.total_revenue, s.cash_total, s.bankqr_total, s.wallet_total,
            s.unpaid_total, s.expected_cash, s.cash_counted, s.variance
       FROM solace_shifts s
       LEFT JOIN users uo ON uo.id::text = s.opened_by
       LEFT JOIN users uc ON uc.id::text = s.closed_by
      WHERE s.status = 'closed' AND s.business_date BETWEEN $1 AND $2
      ORDER BY s.opened_at DESC`,
    [from, to]
  );
  return rows.map(r => ({
    ...r,
    opening_float: Number(r.opening_float),
    total_orders: Number(r.total_orders),
    total_revenue: Number(r.total_revenue),
    cash_total: Number(r.cash_total),
    bankqr_total: Number(r.bankqr_total),
    wallet_total: Number(r.wallet_total),
    unpaid_total: Number(r.unpaid_total),
    expected_cash: Number(r.expected_cash),
    cash_counted: r.cash_counted != null ? Number(r.cash_counted) : null,
    variance: Number(r.variance),
  }));
}

/** Tổng hợp theo nhân viên trực ca (gộp phiên ca họ MỞ trong kỳ). */
async function staffShiftSummary(from: string, to: string): Promise<StaffShiftSummary[]> {
  const rows = await query<StaffShiftSummary>(
    `SELECT s.opened_by,
            COALESCE(u.name, 'Không rõ') AS name,
            COUNT(*)::int AS shifts_count,
            COALESCE(SUM(s.total_orders), 0)::int AS total_orders,
            COALESCE(SUM(s.total_revenue), 0)::bigint AS total_revenue,
            COALESCE(SUM(s.cash_total), 0)::bigint AS cash_total,
            COALESCE(SUM(s.bankqr_total), 0)::bigint AS bankqr_total,
            COALESCE(SUM(s.wallet_total), 0)::bigint AS wallet_total,
            COALESCE(SUM(CASE WHEN s.cash_counted IS NOT NULL THEN s.variance ELSE 0 END), 0)::bigint AS variance_total
       FROM solace_shifts s
       LEFT JOIN users u ON u.id::text = s.opened_by
      WHERE s.status = 'closed' AND s.business_date BETWEEN $1 AND $2
      GROUP BY s.opened_by, u.name
      ORDER BY total_revenue DESC`,
    [from, to]
  );
  return rows.map(r => ({
    ...r,
    shifts_count: Number(r.shifts_count),
    total_orders: Number(r.total_orders),
    total_revenue: Number(r.total_revenue),
    cash_total: Number(r.cash_total),
    bankqr_total: Number(r.bankqr_total),
    wallet_total: Number(r.wallet_total),
    variance_total: Number(r.variance_total),
  }));
}
