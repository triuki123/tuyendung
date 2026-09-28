/**
 * recruitmentForecast — Dự báo số tuyển tháng tới theo tư duy TA analytics.
 *
 * Thay vì trung bình quá khứ, ước lượng từ 3 góc nhìn rồi hợp nhất:
 *   ① CUNG  — giá trị kỳ vọng của pipeline ứng viên (số ứng viên mỗi giai đoạn ×
 *             tỉ lệ chuyển đổi chuẩn × xác suất chốt kịp trong 30 ngày).
 *   ② CẦU   — mô hình chốt đơn tuyển: phần còn thiếu × P(lấp trong tháng) theo
 *             độ trễ (days_open vs time-to-fill) và mức ưu tiên.
 *   ③ XU HƯỚNG — làm mượt có trọng số trên số vào làm các tháng ĐÃ HOÀN TẤT
 *             (bỏ tháng hiện tại đang chạy dở để khỏi lệch).
 *
 * Đầu ra là DẢI P10–P50–P90 + mức tin cậy + các "driver" giải thích. Độ rộng dải
 * suy từ mức phân tán giữa 3 ước lượng: 3 góc nhìn đồng thuận ⇒ dải hẹp, tin cậy cao.
 *
 * Mọi hằng số nằm ở DEFAULT_FORECAST_CONFIG (benchmark nhà tuyển dụng) — có thể
 * override qua system_settings (key 'recruitment.forecast'); seed rỗng ⇒ giữ nguyên.
 */

export interface ForecastConfig {
  /** Trọng số hợp nhất 3 góc nhìn (tự chuẩn hoá nếu tổng ≠ 1). */
  weights: { pipeline: number; demand: number; trend: number };
  /** P(thành hire | đang ở giai đoạn) — tỉ lệ chuyển đổi chuẩn. */
  stageHireProb: { offered: number; interviewed: number; screening: number; new: number };
  /** P(chốt ≤ horizon | giai đoạn) — bước càng sau chốt càng nhanh. */
  stageCloseProb: { offered: number; interviewed: number; screening: number; new: number };
  /** Hệ số tập trung của recruiter theo mức ưu tiên đơn tuyển. */
  priorityFocus: Record<string, number>;
  /** Số tháng đã hoàn tất dùng cho xu hướng. */
  trendMonths: number;
  /** Hệ số suy giảm (0..1): tháng gần nặng hơn. */
  trendDecay: number;
  /** Trần xác suất chốt cho 1 đơn tuyển (không bao giờ chắc chắn 100%). */
  maxCloseProb: number;
  /** Khung dự báo (ngày). */
  horizonDays: number;
}

export const DEFAULT_FORECAST_CONFIG: ForecastConfig = {
  weights: { pipeline: 0.45, demand: 0.35, trend: 0.20 },
  stageHireProb: { offered: 0.85, interviewed: 0.35, screening: 0.22, new: 0.10 },
  stageCloseProb: { offered: 0.90, interviewed: 0.55, screening: 0.30, new: 0.12 },
  priorityFocus: { urgent: 1.25, high: 1.10, normal: 1.0, low: 0.8 },
  trendMonths: 3,
  trendDecay: 0.6,
  maxCloseProb: 0.92,
  horizonDays: 30,
};

/** Merge cấu hình DB (partial) lên DEFAULT — an toàn khi thiếu khoá. */
export function mergeForecastConfig(partial?: Partial<ForecastConfig> | null): ForecastConfig {
  const d = DEFAULT_FORECAST_CONFIG;
  if (!partial) return d;
  return {
    weights: { ...d.weights, ...(partial.weights || {}) },
    stageHireProb: { ...d.stageHireProb, ...(partial.stageHireProb || {}) },
    stageCloseProb: { ...d.stageCloseProb, ...(partial.stageCloseProb || {}) },
    priorityFocus: { ...d.priorityFocus, ...(partial.priorityFocus || {}) },
    trendMonths: partial.trendMonths ?? d.trendMonths,
    trendDecay: partial.trendDecay ?? d.trendDecay,
    maxCloseProb: partial.maxCloseProb ?? d.maxCloseProb,
    horizonDays: partial.horizonDays ?? d.horizonDays,
  };
}

export interface RecruitmentForecast {
  p10: number;
  p50: number;
  p90: number;
  confidence: 'low' | 'medium' | 'high';
  /** Câu giải thích yếu tố đẩy lên (↑) / kéo xuống (↓). */
  drivers: string[];
  /** Ba ước lượng thành phần (minh bạch / tooltip). */
  basis: { pipeline: number; demand: number; trend: number };
}

/** Dữ liệu đầu vào (lấy từ RecruitmentDashboard — structural typing). */
export interface ForecastInput {
  cvByStage: { label: string; value: number }[];
  hiresByMonth: { month: string; value: number }[];
  requisitions: {
    avgTimeToFill: number;
    onHold: number;
    byPriority: { label: string; value: number }[];
    aging: { days_open: number; target_headcount: number; filled_count: number }[];
  };
  turnover?: { leaversByMonth: { month: string; value: number }[] };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Hệ số tập trung trung bình theo phân bố ưu tiên các đơn đang mở. */
function avgPriorityFocus(byPriority: { label: string; value: number }[], focus: Record<string, number>): number {
  let wsum = 0, vsum = 0;
  for (const p of byPriority) {
    const f = focus[p.label] ?? 1;
    vsum += f * p.value;
    wsum += p.value;
  }
  return wsum > 0 ? vsum / wsum : 1;
}

/** Xu hướng = EMA có trọng số trên các tháng ĐÃ hoàn tất (bỏ tháng hiện tại). */
function trendEstimate(hires: { month: string; value: number }[], cfg: ForecastConfig): number {
  const now = new Date();
  const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const completed = hires.filter((h) => h.month < curKey).sort((a, b) => a.month.localeCompare(b.month));
  const last = completed.slice(-cfg.trendMonths);
  if (last.length === 0) return 0;
  let wsum = 0, vsum = 0, wgt = 1;
  for (let i = last.length - 1; i >= 0; i--) {
    vsum += last[i].value * wgt;
    wsum += wgt;
    wgt *= cfg.trendDecay;
  }
  return wsum > 0 ? vsum / wsum : 0;
}

function sumRemaining(aging: ForecastInput['requisitions']['aging']): number {
  return aging.reduce((a, r) => a + Math.max((r.target_headcount || 1) - (r.filled_count || 0), 0), 0);
}

export function computeRecruitmentForecast(d: ForecastInput, cfg: ForecastConfig = DEFAULT_FORECAST_CONFIG): RecruitmentForecast {
  const stage = (k: string) => d.cvByStage.find((b) => b.label === k)?.value || 0;
  const offered = stage('offered');
  const interviewed = stage('interviewed');
  const screening = stage('screening');
  const fresh = stage('new');

  // ① CUNG — giá trị kỳ vọng của pipeline ứng viên
  const pipeline =
    offered * cfg.stageHireProb.offered * cfg.stageCloseProb.offered +
    interviewed * cfg.stageHireProb.interviewed * cfg.stageCloseProb.interviewed +
    screening * cfg.stageHireProb.screening * cfg.stageCloseProb.screening +
    fresh * cfg.stageHireProb.new * cfg.stageCloseProb.new;

  // ② CẦU — mô hình chốt đơn tuyển theo độ trễ vs time-to-fill
  const ttf = Math.max(d.requisitions.avgTimeToFill || 0, cfg.horizonDays);
  const focus = avgPriorityFocus(d.requisitions.byPriority, cfg.priorityFocus);
  let demand = 0;
  for (const a of d.requisitions.aging) {
    const remaining = Math.max((a.target_headcount || 1) - (a.filled_count || 0), 0);
    if (remaining <= 0) continue;
    const progress = (a.days_open + cfg.horizonDays) / ttf; // mức "đến hạn" vào cuối tháng
    const closeProb = clamp(progress * focus, 0, cfg.maxCloseProb);
    demand += remaining * closeProb;
  }

  // ③ XU HƯỚNG
  const trend = trendEstimate(d.hiresByMonth, cfg);

  // Hợp nhất (chuẩn hoá trọng số)
  const w = cfg.weights;
  const wTot = (w.pipeline + w.demand + w.trend) || 1;
  let p50 = (w.pipeline * pipeline + w.demand * demand + w.trend * trend) / wTot;

  // Trần hợp lý: 1 tháng không thể tuyển nhiều hơn (ứng viên gần chốt + nhu cầu còn thiếu)
  const sanityMax = offered + interviewed + sumRemaining(d.requisitions.aging) + Math.max(trend, 2);
  p50 = Math.round(clamp(p50, 0, sanityMax));

  // Độ rộng dải suy từ phân tán 3 ước lượng (đồng thuận ⇒ hẹp ⇒ tin cậy cao)
  const est = [pipeline, demand, trend];
  const mean = (est[0] + est[1] + est[2]) / 3;
  const disp = Math.sqrt(est.reduce((a, b) => a + (b - mean) ** 2, 0) / 3);
  const spread = Math.max(1, Math.round(0.6 * disp + 0.15 * p50));
  const p10 = Math.max(0, p50 - spread);
  const p90 = p50 + spread;

  const pipelineDepth = offered + interviewed + screening;
  const confidence: RecruitmentForecast['confidence'] =
    disp <= 0.5 * Math.max(mean, 1) && pipelineDepth >= 5 ? 'high' : pipelineDepth >= 3 ? 'medium' : 'low';

  // ── Drivers ──
  const drivers: string[] = [];
  if (offered > 0) drivers.push(`↑ ${offered} ứng viên đã ở bước offer (gần chốt)`);
  const agingHot = d.requisitions.aging.filter((a) => a.days_open > 30 && (a.target_headcount || 1) - (a.filled_count || 0) > 0).length;
  if (agingHot > 0) drivers.push(`↑ ${agingHot} vị trí tồn đọng > 30 ngày sắp đến hạn lấp`);
  // Xu hướng tăng/giảm: so 2 tháng hoàn tất gần nhất
  const now = new Date();
  const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const comp = d.hiresByMonth.filter((h) => h.month < curKey).sort((a, b) => a.month.localeCompare(b.month));
  if (comp.length >= 2) {
    const a = comp[comp.length - 2].value, b = comp[comp.length - 1].value;
    if (b > a) drivers.push(`↑ Nhịp tuyển đang tăng (${a} → ${b} tháng gần nhất)`);
    else if (b < a) drivers.push(`↓ Nhịp tuyển đang chậm lại (${a} → ${b} tháng gần nhất)`);
  }
  if (fresh <= 2 && pipelineDepth < 5) drivers.push(`↓ Đầu phễu mỏng (${fresh} hồ sơ mới) → nguồn xa hạn chế`);
  if (d.requisitions.onHold > 0) drivers.push(`↓ ${d.requisitions.onHold} đơn tuyển đang tạm dừng`);
  // Áp lực thay thế (backfill) — thông tin nhu cầu
  if (d.turnover && d.turnover.leaversByMonth.length > 0) {
    const recent = d.turnover.leaversByMonth.slice(-3);
    const avgLeave = Math.round(recent.reduce((a, b) => a + b.value, 0) / recent.length);
    if (avgLeave >= 2) drivers.push(`⚠ Áp lực thay thế ~${avgLeave} người/tháng (nghỉ việc gần đây)`);
  }

  return {
    p10,
    p50,
    p90,
    confidence,
    drivers: drivers.slice(0, 4),
    basis: {
      pipeline: Math.round(pipeline * 10) / 10,
      demand: Math.round(demand * 10) / 10,
      trend: Math.round(trend * 10) / 10,
    },
  };
}
