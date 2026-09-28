import { query, queryOne, execute } from '@/lib/db';
import {
  BU_CHECKIN_LABEL, BU_CONG_LABEL, DEFAULT_RANGE_COLUMNS, type RangeColumnConfig,
} from '@/lib/rangeExportCatalog';

/**
 * Cấu hình cột file "Xuất Dữ Liệu Công" — lưu trong hr_settings (key/JSONB),
 * không cần migration. Chưa cấu hình → trả layout mặc định (khớp file đang chạy).
 * Song song và độc lập với `attendance_export_columns` của Xuất Bảng Công.
 */
const KEY = 'attendance_range_export_columns';

/** Lấy cấu hình cột; fallback mặc định nếu chưa lưu / dữ liệu hỏng. */
export async function getRangeExportColumns(): Promise<RangeColumnConfig[]> {
  const row = await queryOne<{ value: unknown }>(
    `SELECT value FROM hr_settings WHERE key = $1`,
    [KEY]
  );
  if (!row) return DEFAULT_RANGE_COLUMNS;
  let arr: unknown = row.value;
  if (!Array.isArray(arr)) {
    try { arr = JSON.parse(String(arr)); } catch { return DEFAULT_RANGE_COLUMNS; }
  }
  return Array.isArray(arr) && arr.length ? (arr as RangeColumnConfig[]) : DEFAULT_RANGE_COLUMNS;
}

/**
 * Nhãn mọi cột nghỉ / bù công có thể xuất hiện, theo thứ tự danh mục.
 * `userIds` = giới hạn theo công ty của nhóm nhân sự được xuất (bảng nối rỗng
 * = loại dùng chung mọi công ty). Bỏ trống → toàn bộ danh mục đang bật, dùng
 * cho màn hình cấu hình.
 */
export async function getLeaveColumnLabels(userIds?: string[]): Promise<string[]> {
  const scoped = userIds && userIds.length > 0;
  const rows = await query<{ name: string }>(
    `SELECT DISTINCT lt.name, lt.sort_order
       FROM leave_types lt
      WHERE lt.active = true
        AND ($2::boolean = false
             OR NOT EXISTS (SELECT 1 FROM leave_type_companies x WHERE x.leave_type_id = lt.id)
             OR EXISTS (
               SELECT 1 FROM leave_type_companies x
                WHERE x.leave_type_id = lt.id
                  AND (EXISTS (SELECT 1 FROM users u
                                WHERE u.id::text = ANY($1)
                                  AND u.company_id::text = x.company_id::text)
                       OR EXISTS (SELECT 1 FROM user_company_memberships m
                                   WHERE m.user_id::text = ANY($1)
                                     AND m.is_active = true
                                     AND m.company_id::text = x.company_id::text))))
      ORDER BY lt.sort_order, lt.name`,
    [scoped ? userIds : [], scoped]
  );
  return [...rows.map((r) => r.name), BU_CHECKIN_LABEL, BU_CONG_LABEL];
}

/** Lưu cấu hình cột (ghi đè toàn bộ). */
export async function saveRangeExportColumns(cols: RangeColumnConfig[]): Promise<void> {
  await execute(
    `INSERT INTO hr_settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [KEY, JSON.stringify(cols)]
  );
}
