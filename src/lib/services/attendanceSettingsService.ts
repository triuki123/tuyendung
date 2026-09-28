import crypto from 'crypto';
import { query, queryOne, execute } from '@/lib/db';
import {
  ResolvedAttendanceConfig,
  DEFAULT_ATTENDANCE_CONFIG,
  mergeAttendanceConfig,
} from '@/lib/config/attendanceConfig';

/**
 * attendanceSettingsService — đọc/ghi cấu hình chấm công theo CÔNG TY + HIỆU LỰC THEO NGÀY.
 *
 * - company_id NULL = cấu hình mặc định toàn hệ thống.
 * - Tra cứu: lấy phiên bản mới nhất có `effective_from <= ngày cần tính`, ưu tiên công ty,
 *   fallback về mặc định, fallback cuối cùng về DEFAULT_ATTENDANCE_CONFIG (hằng số trong code).
 * - Mọi truy vấn đều .catch về DEFAULT để KHÔNG vỡ luồng khi bảng chưa tồn tại (dev chưa migrate).
 */

export interface AttendanceSettingRow {
  id: string;
  company_id: string | null;
  effective_from: string; // YYYY-MM-DD
  config: ResolvedAttendanceConfig;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

// ─── Cache in-memory (TTL ngắn) ──────────────────────────────────────────────
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { value: ResolvedAttendanceConfig; expires: number }>();

function cacheKey(companyId: string | null, onDate: string): string {
  return `${companyId ?? 'default'}:${onDate}`;
}

/** Xoá toàn bộ cache — gọi sau khi lưu/xoá cấu hình. */
export function invalidateAttendanceConfigCache(): void {
  cache.clear();
}

/**
 * Resolve cấu hình hiệu lực cho (công ty, ngày). `onDate` dạng YYYY-MM-DD (giờ VN).
 * Nếu không truyền onDate → dùng "hôm nay" theo giờ VN.
 */
export async function resolveAttendanceConfig(
  companyId: string | null,
  onDate?: string
): Promise<ResolvedAttendanceConfig> {
  const date = onDate ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const key = cacheKey(companyId, date);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  let resolved = DEFAULT_ATTENDANCE_CONFIG;
  try {
    let row: { config: Partial<ResolvedAttendanceConfig> } | null = null;
    if (companyId) {
      row = await queryOne<{ config: Partial<ResolvedAttendanceConfig> }>(
        `SELECT config FROM attendance_settings
          WHERE company_id = $1 AND effective_from <= $2::date
          ORDER BY effective_from DESC LIMIT 1`,
        [companyId, date]
      );
    }
    if (!row) {
      row = await queryOne<{ config: Partial<ResolvedAttendanceConfig> }>(
        `SELECT config FROM attendance_settings
          WHERE company_id IS NULL AND effective_from <= $1::date
          ORDER BY effective_from DESC LIMIT 1`,
        [date]
      );
    }
    resolved = mergeAttendanceConfig(row?.config ?? null);
  } catch {
    resolved = DEFAULT_ATTENDANCE_CONFIG; // bảng chưa tồn tại / lỗi đọc → dùng mặc định
  }

  cache.set(key, { value: resolved, expires: Date.now() + CACHE_TTL_MS });
  return resolved;
}

/** Resolve theo user (lấy company_id chính của user). Dùng cho luồng background chỉ có userId. */
export async function resolveAttendanceConfigForUser(
  userId: string,
  onDate?: string
): Promise<ResolvedAttendanceConfig> {
  let companyId: string | null = null;
  let deductLunch = true;
  try {
    const u = await queryOne<{ company_id: string | null; deduct_lunch: boolean | null }>(
      `SELECT company_id, deduct_lunch FROM users WHERE id = $1`,
      [userId]
    );
    companyId = u?.company_id ?? null;
    deductLunch = u?.deduct_lunch ?? true;
  } catch { /* dùng mặc định */ }
  const cfg = await resolveAttendanceConfig(companyId, onDate);
  // Ngoại lệ per-user: không trừ nghỉ trưa → khung trưa rộng 0 phút (lunchOverlap = 0).
  // Trả object MỚI để không làm bẩn cache cấu hình theo công ty.
  if (deductLunch === false) {
    return { ...cfg, lunchEndHour: cfg.lunchStartHour };
  }
  return cfg;
}

// ─── CRUD (cho UI cấu hình) ──────────────────────────────────────────────────

/** Danh sách phiên bản cấu hình của 1 phạm vi (company_id NULL = mặc định), mới nhất trước. */
export async function listAttendanceSettings(companyId: string | null): Promise<AttendanceSettingRow[]> {
  const where = companyId ? `company_id = $1` : `company_id IS NULL`;
  const params = companyId ? [companyId] : [];
  return query<AttendanceSettingRow>(
    `SELECT a.*, to_char(a.effective_from, 'YYYY-MM-DD') AS effective_from
       FROM attendance_settings a
      WHERE ${where}
      ORDER BY a.effective_from DESC`,
    params
  );
}

/** Lưu (upsert theo company_id + effective_from) 1 phiên bản cấu hình. */
export async function saveAttendanceSettings(data: {
  companyId: string | null;
  effectiveFrom: string; // YYYY-MM-DD
  config: ResolvedAttendanceConfig;
  note?: string | null;
  createdBy?: string | null;
}): Promise<AttendanceSettingRow> {
  // Idempotent theo (company_id, effective_from): xoá bản cũ cùng mốc rồi chèn mới.
  if (data.companyId) {
    await execute(
      `DELETE FROM attendance_settings WHERE company_id = $1 AND effective_from = $2::date`,
      [data.companyId, data.effectiveFrom]
    );
  } else {
    await execute(
      `DELETE FROM attendance_settings WHERE company_id IS NULL AND effective_from = $1::date`,
      [data.effectiveFrom]
    );
  }
  const id = `aset_${crypto.randomUUID()}`;
  const row = await queryOne<AttendanceSettingRow>(
    `INSERT INTO attendance_settings (id, company_id, effective_from, config, note, created_by)
     VALUES ($1, $2, $3::date, $4::jsonb, $5, $6)
     RETURNING *, to_char(effective_from, 'YYYY-MM-DD') AS effective_from`,
    [id, data.companyId, data.effectiveFrom, JSON.stringify(data.config), data.note ?? null, data.createdBy ?? null]
  );
  invalidateAttendanceConfigCache();
  return row as AttendanceSettingRow;
}

/** Xoá 1 phiên bản cấu hình theo id. */
export async function deleteAttendanceSettings(id: string): Promise<boolean> {
  const n = await execute(`DELETE FROM attendance_settings WHERE id = $1`, [id]);
  invalidateAttendanceConfigCache();
  return n > 0;
}
