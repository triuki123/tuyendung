export type KpiAssignmentStatus = 'draft' | 'self_review' | 'manager_review' | 'senior_review' | 'concluded';
export type KpiTargetType = 'number' | 'percent' | 'boolean' | 'scale';
export type KpiPeriodType = 'week' | 'month' | 'quarter' | 'half_year' | 'year';

/** Kỳ có thể gộp tham khảo từ các kỳ Tháng bên trong (quý/6 tháng/năm) — không gồm week/month. */
export const ROLLUP_ELIGIBLE_PERIODS: KpiPeriodType[] = ['quarter', 'half_year', 'year'];

export interface KpiRollupReference {
  avg: number | null;
  count: number;
  breakdown: { cycle_name: string; final_score: number; weight: number }[];
}

export const STATUS_LABEL: Record<KpiAssignmentStatus, string> = {
  draft: 'Chờ tự nhận xét',
  self_review: 'Đã tự nhận xét',
  manager_review: 'Chờ quản lý chấm',
  senior_review: 'Chờ cấp cao chốt',
  concluded: 'Đã chốt',
};

export const STATUS_COLOR: Record<KpiAssignmentStatus, string> = {
  draft: 'text-muted-foreground',
  self_review: 'text-sky-400',
  manager_review: 'text-amber-400',
  senior_review: 'text-orange-400',
  concluded: 'text-emerald-400',
};

export const PERIOD_LABEL: Record<KpiPeriodType, string> = {
  week: 'Tuần', month: 'Tháng', quarter: 'Quý', half_year: '6 Tháng', year: 'Năm',
};

export interface KpiAssignmentItem {
  id: string;
  name: string;
  description: string | null;
  weight: number;
  target_type: KpiTargetType;
  target_value: string | null;
  unit: string | null;
  category: string | null;
  self_actual: string | null;
  self_note: string | null;
  self_score: number | null;
  self_achieved: boolean | null;
  manager_actual: string | null;
  manager_note: string | null;
  manager_score: number | null;
  manager_achieved: boolean | null;
  final_score: number | null;
}

export interface KpiAssignment {
  id: string;
  cycle_id: string;
  company_id: string;
  employee_id: string;
  employee_name?: string;
  manager_name?: string | null;
  senior_name?: string | null;
  cycle_name?: string;
  cycle_status?: 'draft' | 'active' | 'closed';
  company_name?: string;
  start_date?: string;
  end_date?: string;
  manager_id: string | null;
  senior_id: string | null;
  status: KpiAssignmentStatus;
  self_score: number | null;
  manager_score: number | null;
  final_score: number | null;
  ranking_enabled: boolean;
  strengths?: string | null;
  improvements?: string | null;
  next_goals?: string | null;
  training_needs?: string | null;
  grade?: string | null;
  items?: KpiAssignmentItem[];
  reviews?: { tier: string; reviewer_id: string; reviewer_name?: string; score: number | null; note: string | null; created_at: string }[];
  rollupReference?: KpiRollupReference | null;
}

/** Nhóm tiêu chí KPI — hiển thị gom nhóm + tính trọng số theo nhóm. */
export const KPI_CATEGORY_ORDER = ['ket_qua', 'nang_luc', 'thai_do', 'tuan_thu'] as const;
export type KpiCategory = typeof KPI_CATEGORY_ORDER[number];
export const KPI_CATEGORY_LABEL: Record<string, string> = {
  ket_qua: 'Kết quả công việc',
  nang_luc: 'Năng lực',
  thai_do: 'Thái độ / Hành vi',
  tuan_thu: 'Tuân thủ',
};
/** Xếp loại từ điểm chính thức (0-100). */
export function kpiGradeFromScore(score: number | null | undefined): { grade: 'A' | 'B' | 'C' | 'D'; label: string; color: string } | null {
  if (score == null) return null;
  const s = Number(score);
  if (s >= 90) return { grade: 'A', label: 'Xuất sắc', color: 'text-emerald-400' };
  if (s >= 75) return { grade: 'B', label: 'Đạt', color: 'text-sky-400' };
  if (s >= 60) return { grade: 'C', label: 'Cần cải thiện', color: 'text-amber-400' };
  return { grade: 'D', label: 'Kém', color: 'text-rose-400' };
}

export interface KpiCycle {
  id: string;
  company_id: string;
  period_type: KpiPeriodType;
  name: string;
  start_date: string;
  end_date: string;
  status: 'draft' | 'active' | 'closed';
}

export interface KpiTemplateItemInput {
  name: string;
  description?: string | null;
  weight: number;
  target_type: KpiTargetType;
  target_value?: string | null;
  unit?: string | null;
  category?: string | null;
}

export interface KpiTemplate {
  id: string;
  company_id: string;
  name: string;
  scope_type: 'company' | 'department' | 'job_title';
  scope_id: string | null;
  is_active: boolean;
}

// ── Đánh giá theo Đơn Vị (phòng ban/bộ phận) — phiếu riêng, chuỗi duyệt linh hoạt N cấp ──
export type KpiUnitType = 'department' | 'sub_department';
export type KpiUnitAssignmentStatus = 'draft' | 'in_approval' | 'concluded';

export const UNIT_STATUS_LABEL: Record<KpiUnitAssignmentStatus, string> = {
  draft: 'Chờ trưởng đơn vị tự nhận xét',
  in_approval: 'Đang chờ duyệt',
  concluded: 'Đã chốt',
};
export const UNIT_STATUS_COLOR: Record<KpiUnitAssignmentStatus, string> = {
  draft: 'text-muted-foreground',
  in_approval: 'text-amber-400',
  concluded: 'text-emerald-400',
};

export interface KpiUnitAssignmentItem {
  id: string;
  name: string;
  description: string | null;
  weight: number;
  target_type: KpiTargetType;
  target_value: string | null;
  unit: string | null;
  self_actual: string | null;
  self_note: string | null;
  self_score: number | null;
  review_actual: string | null;
  review_note: string | null;
  review_score: number | null;
}

export interface KpiUnitApprover {
  id: string;
  tier_order: number;
  approver_id: string;
  approver_name?: string;
  status: 'pending' | 'reviewed';
  score: number | null;
  note: string | null;
}

export interface KpiUnitAssignment {
  id: string;
  cycle_id: string;
  cycle_name?: string;
  company_id: string;
  unit_type: KpiUnitType;
  unit_id: string;
  unit_name?: string;
  self_reviewer_id: string;
  self_reviewer_name?: string;
  status: KpiUnitAssignmentStatus;
  self_score: number | null;
  final_score: number | null;
  current_tier: number;
  items?: KpiUnitAssignmentItem[];
  approvers?: KpiUnitApprover[];
  teamAvgIndividualScore?: { avg: number | null; count: number } | null;
  reviews?: { tier_order: number; reviewer_id: string; reviewer_name?: string; score: number | null; note: string | null; created_at: string }[];
  rollupReference?: KpiRollupReference | null;
}
