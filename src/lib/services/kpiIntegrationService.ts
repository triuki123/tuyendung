/**
 * KPI & Đánh Giá — quy đổi điểm từ nguồn NGOÀI (Chấm công, Task) vào KPI, CHỈ khi BỘ CHỈ TIÊU
 * (kpi_templates.integration_sources) của phiếu đó bật nguồn tương ứng — cấu hình theo từng
 * mẫu, không phải toàn công ty (1 công ty có thể có nhiều mẫu, mỗi mẫu 1 quy tắc riêng).
 * Không tự tính lại logic chấm công — dùng lại attendanceDiligenceService (điểm chuyên cần
 * đã build sẵn, xem docs/technical + memory diligence_profile_module) để tránh sai lệch 2 nơi.
 */
import { query } from '@/lib/db';
import { getDiligenceReport } from './attendanceDiligenceService';
import { KpiIntegrationSourceKey, KpiTemplateIntegrationSource } from './kpiTemplateService';

export interface KpiIntegrationScore {
  source: KpiIntegrationSourceKey;
  weight: number;
  score: number;
}

/** Điểm chấm công 0-100: phạt theo tỉ lệ ngày vắng/trễ trên tổng ngày công chuẩn trong kỳ. */
async function computeAttendanceScore(employeeId: string, startDate: string, endDate: string): Promise<number | null> {
  const rows = await getDiligenceReport([employeeId], startDate, endDate);
  const m = rows[0]?.metrics;
  if (!m || m.workDays <= 0) return null;
  const penalty = (m.absentDays * 10 + m.lateDays * 3 + m.missingPunchDays * 5) / m.workDays;
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

/** Điểm Task 0-100: tỉ lệ việc hoàn thành đúng hạn trên tổng việc được giao trong kỳ. */
async function computeTaskScore(employeeId: string, startDate: string, endDate: string): Promise<number | null> {
  const rows = await query<{ total: string; done_on_time: string; overdue: string }>(
    `SELECT
        COUNT(*) FILTER (WHERE created_at::date BETWEEN $2 AND $3) AS total,
        COUNT(*) FILTER (WHERE status = 'done' AND (due_date IS NULL OR NULLIF(due_date::text,'')::date IS NULL OR updated_at::date <= NULLIF(due_date::text,'')::date)) AS done_on_time,
        COUNT(*) FILTER (WHERE status != 'done' AND NULLIF(due_date::text,'')::date < CURRENT_DATE) AS overdue
       FROM tasks
      WHERE assigned_to::text = $1 AND (archived_at IS NULL) AND created_at::date BETWEEN $2 AND $3`,
    [employeeId, startDate, endDate]
  );
  const r = rows[0];
  const total = Number(r?.total || 0);
  if (total === 0) return null;
  const doneOnTime = Number(r?.done_on_time || 0);
  const overdue = Number(r?.overdue || 0);
  const score = (doneOnTime / total) * 100 - (overdue / total) * 15;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Điểm từng nguồn tích hợp ĐANG BẬT ở bộ chỉ tiêu của phiếu này — dùng để cấp cao tham khảo khi chốt. */
export async function getEnabledIntegrationScores(
  sources: KpiTemplateIntegrationSource[],
  employeeId: string,
  startDate: string,
  endDate: string
): Promise<KpiIntegrationScore[]> {
  const out: KpiIntegrationScore[] = [];
  for (const s of sources) {
    if (!s.enabled || s.weight <= 0) continue;
    const score = s.source === 'attendance'
      ? await computeAttendanceScore(employeeId, startDate, endDate)
      : s.source === 'task'
        ? await computeTaskScore(employeeId, startDate, endDate)
        : null;
    if (score !== null) out.push({ source: s.source, weight: s.weight, score });
  }
  return out;
}
