/**
 * KPI & Đánh Giá — cấu hình: chu kỳ mặc định theo công ty, nguồn tích hợp (Chấm công/Task),
 * cờ tham gia bảng xếp hạng. Cách ly company_id — mỗi công ty tự quản cấu hình riêng.
 */
import crypto from 'crypto';
import { query, queryOne, execute } from '@/lib/db';

export type KpiPeriodType = 'week' | 'month' | 'quarter' | 'half_year' | 'year';

export interface KpiCompanySettings {
  company_id: string;
  /** Công tắc tổng — công ty này CÓ dùng module KPI & Đánh Giá không. Mặc định TẮT (opt-in). */
  kpi_enabled: boolean;
  period_type: KpiPeriodType;
  ranking_enabled_default: boolean;
}

export interface KpiParticipantSetting {
  id: string;
  company_id: string;
  user_id: string;
  ranking_enabled: boolean;
  excluded_reason: string | null;
}

/** Lấy cấu hình chu kỳ của công ty; trả mặc định (TẮT module, quý, có xếp hạng) nếu công ty chưa cấu hình. */
export async function getCompanySettings(companyId: string): Promise<KpiCompanySettings> {
  const row = await queryOne<KpiCompanySettings>(
    `SELECT company_id, kpi_enabled, period_type, ranking_enabled_default FROM kpi_company_settings WHERE company_id = $1`,
    [companyId]
  );
  return row || { company_id: companyId, kpi_enabled: false, period_type: 'quarter', ranking_enabled_default: true };
}

export async function upsertCompanySettings(
  companyId: string,
  data: { kpi_enabled: boolean; period_type: KpiPeriodType; ranking_enabled_default: boolean }
): Promise<KpiCompanySettings> {
  return (await queryOne<KpiCompanySettings>(
    `INSERT INTO kpi_company_settings (company_id, kpi_enabled, period_type, ranking_enabled_default, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (company_id) DO UPDATE SET
       kpi_enabled = EXCLUDED.kpi_enabled,
       period_type = EXCLUDED.period_type,
       ranking_enabled_default = EXCLUDED.ranking_enabled_default,
       updated_at = NOW()
     RETURNING company_id, kpi_enabled, period_type, ranking_enabled_default`,
    [companyId, data.kpi_enabled, data.period_type, data.ranking_enabled_default]
  ))!;
}

export async function getParticipantSettings(companyId: string): Promise<KpiParticipantSetting[]> {
  return query<KpiParticipantSetting>(
    `SELECT id, company_id, user_id, ranking_enabled, excluded_reason FROM kpi_participant_settings WHERE company_id = $1`,
    [companyId]
  );
}

/** Bật/tắt xếp hạng cho 1 nhân viên trong công ty (dùng để loại BOD/Giám đốc khỏi bảng xếp hạng). */
export async function setParticipantRanking(
  companyId: string,
  userId: string,
  rankingEnabled: boolean,
  excludedReason?: string | null
): Promise<KpiParticipantSetting> {
  return (await queryOne<KpiParticipantSetting>(
    `INSERT INTO kpi_participant_settings (id, company_id, user_id, ranking_enabled, excluded_reason, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (company_id, user_id) DO UPDATE SET
       ranking_enabled = EXCLUDED.ranking_enabled, excluded_reason = EXCLUDED.excluded_reason, updated_at = NOW()
     RETURNING id, company_id, user_id, ranking_enabled, excluded_reason`,
    ['kps_' + crypto.randomBytes(8).toString('hex'), companyId, userId, rankingEnabled, excludedReason ?? null]
  ))!;
}

/** Nhân viên có được tính vào bảng xếp hạng không — ưu tiên cờ riêng, fallback mặc định công ty. */
export async function isRankingEnabledForUser(companyId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ ranking_enabled: boolean }>(
    `SELECT ranking_enabled FROM kpi_participant_settings WHERE company_id = $1 AND user_id = $2`,
    [companyId, userId]
  );
  if (row) return row.ranking_enabled;
  const settings = await getCompanySettings(companyId);
  return settings.ranking_enabled_default;
}

// ── Nhóm Chỉ Tiêu — mỗi công ty tự định nghĩa riêng (mig 275) ──────────────────────────────
export interface KpiCategoryRow {
  id: string;
  company_id: string;
  key: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

/** 4 nhóm mặc định cũ (khi công ty chưa tự cấu hình) — giữ nguyên hành vi trước migration 275. */
const DEFAULT_CATEGORIES: { key: string; label: string }[] = [
  { key: 'ket_qua', label: 'Kết quả công việc' },
  { key: 'nang_luc', label: 'Năng lực' },
  { key: 'thai_do', label: 'Thái độ / Hành vi' },
  { key: 'tuan_thu', label: 'Tuân thủ' },
];

/** Nhóm chỉ tiêu của công ty; công ty CHƯA tự cấu hình → trả 4 nhóm mặc định (không đổi hành vi cũ). */
export async function getCategories(companyId: string): Promise<KpiCategoryRow[]> {
  const rows = await query<KpiCategoryRow>(
    `SELECT * FROM kpi_categories WHERE company_id = $1 AND is_active = true ORDER BY sort_order, created_at`,
    [companyId]
  );
  if (rows.length) return rows;
  return DEFAULT_CATEGORIES.map((c, i) => ({ id: `default_${c.key}`, company_id: companyId, key: c.key, label: c.label, sort_order: i, is_active: true }));
}

/** Thay toàn bộ danh sách nhóm chỉ tiêu của công ty (đồng bộ từ form CRUD). */
export async function setCategories(companyId: string, categories: { key: string; label: string }[]): Promise<KpiCategoryRow[]> {
  await execute(`DELETE FROM kpi_categories WHERE company_id = $1`, [companyId]);
  let order = 0;
  for (const c of categories) {
    await execute(
      `INSERT INTO kpi_categories (id, company_id, key, label, sort_order) VALUES ($1, $2, $3, $4, $5)`,
      ['kct_' + crypto.randomBytes(8).toString('hex'), companyId, c.key, c.label, order++]
    );
  }
  return getCategories(companyId);
}

// ── Ngưỡng Xếp Loại A/B/C/D — mỗi công ty tự định nghĩa riêng (mig 275) ────────────────────
export interface KpiGradeThresholds {
  company_id: string;
  grade_a_min: number;
  grade_b_min: number;
  grade_c_min: number;
}

const DEFAULT_GRADE_THRESHOLDS = { grade_a_min: 90, grade_b_min: 75, grade_c_min: 60 };

/** Ngưỡng xếp loại của công ty; chưa cấu hình → trả mặc định cũ (90/75/60, không đổi hành vi). */
export async function getGradeThresholds(companyId: string): Promise<KpiGradeThresholds> {
  const row = await queryOne<KpiGradeThresholds>(
    `SELECT company_id, grade_a_min, grade_b_min, grade_c_min FROM kpi_grade_thresholds WHERE company_id = $1`,
    [companyId]
  );
  return row || { company_id: companyId, ...DEFAULT_GRADE_THRESHOLDS };
}

export async function setGradeThresholds(
  companyId: string,
  data: { grade_a_min: number; grade_b_min: number; grade_c_min: number }
): Promise<KpiGradeThresholds> {
  return (await queryOne<KpiGradeThresholds>(
    `INSERT INTO kpi_grade_thresholds (company_id, grade_a_min, grade_b_min, grade_c_min, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (company_id) DO UPDATE SET
       grade_a_min = EXCLUDED.grade_a_min, grade_b_min = EXCLUDED.grade_b_min, grade_c_min = EXCLUDED.grade_c_min, updated_at = NOW()
     RETURNING company_id, grade_a_min, grade_b_min, grade_c_min`,
    [companyId, data.grade_a_min, data.grade_b_min, data.grade_c_min]
  ))!;
}

/** Xếp loại từ điểm (0-100) theo ngưỡng đã cấu hình của công ty. */
export function gradeFromScore(score: number, thresholds: KpiGradeThresholds): 'A' | 'B' | 'C' | 'D' {
  if (score >= thresholds.grade_a_min) return 'A';
  if (score >= thresholds.grade_b_min) return 'B';
  if (score >= thresholds.grade_c_min) return 'C';
  return 'D';
}
