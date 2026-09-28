/**
 * KPI & Đánh Giá — bảng xếp hạng Best Performer theo kỳ. Chỉ tính người có ranking_enabled = true
 * (dùng cờ ở kpi_participant_settings để loại BOD/Giám đốc khỏi bảng xếp hạng khi công ty cần)
 * và phiếu đã concluded (điểm chính thức, tránh xếp hạng theo điểm nháp).
 */
import { query } from '@/lib/db';

export interface KpiRankingRow {
  employee_id: string;
  employee_name: string;
  final_score: number;
  rank: number;
}

export async function getCycleRanking(cycleId: string, companyId: string): Promise<KpiRankingRow[]> {
  const rows = await query<{ employee_id: string; employee_name: string; final_score: number }>(
    `SELECT a.employee_id, u.name AS employee_name, a.final_score
       FROM kpi_assignments a
       JOIN users u ON u.id::text = a.employee_id
      WHERE a.cycle_id = $1 AND a.company_id = $2
        AND a.status = 'concluded' AND a.ranking_enabled = true AND a.final_score IS NOT NULL
      ORDER BY a.final_score DESC`,
    [cycleId, companyId]
  );
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Xu hướng điểm 1 nhân viên qua nhiều kỳ (dựng biểu đồ đường cho quản lý theo dõi). */
export async function getEmployeeScoreTrend(companyId: string, employeeId: string) {
  return query<{ cycle_name: string; start_date: string; final_score: number | null; status: string }>(
    `SELECT c.name AS cycle_name, c.start_date, a.final_score, a.status
       FROM kpi_assignments a JOIN kpi_cycles c ON c.id = a.cycle_id
      WHERE a.company_id = $1 AND a.employee_id = $2
      ORDER BY c.start_date`,
    [companyId, employeeId]
  );
}
