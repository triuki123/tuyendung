import { queryOne, execute } from '@/lib/db';
import { DEFAULT_COLUMNS, type ColumnConfig } from '@/lib/attendanceExportCatalog';

/**
 * Cấu hình cột xuất bảng công — lưu trong hr_settings (key/JSONB),
 * không cần migration. Chưa cấu hình → trả layout mặc định (sao y khuôn DETAIL_fill).
 */
const KEY = 'attendance_export_columns';

/** Lấy cấu hình cột; fallback DEFAULT_COLUMNS nếu chưa lưu / dữ liệu hỏng. */
export async function getExportColumns(): Promise<ColumnConfig[]> {
  const row = await queryOne<{ value: unknown }>(
    `SELECT value FROM hr_settings WHERE key = $1`,
    [KEY]
  );
  if (!row) return DEFAULT_COLUMNS;
  const v = row.value;
  let arr: unknown = v;
  if (!Array.isArray(arr)) {
    try {
      arr = JSON.parse(String(v));
    } catch {
      return DEFAULT_COLUMNS;
    }
  }
  return Array.isArray(arr) && arr.length ? (arr as ColumnConfig[]) : DEFAULT_COLUMNS;
}

/** Lưu cấu hình cột (ghi đè toàn bộ). */
export async function saveExportColumns(cols: ColumnConfig[]): Promise<void> {
  await execute(
    `INSERT INTO hr_settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [KEY, JSON.stringify(cols)]
  );
}
