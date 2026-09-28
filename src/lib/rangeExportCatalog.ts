/**
 * Danh mục cột cho file "Xuất Dữ Liệu Công" (theo khoảng ngày).
 * Khác catalog của "Xuất Bảng Công" (DETAIL_fill) — file này là bảng PHẲNG:
 * mỗi dòng = 1 nhân sự × 1 ngày.
 *
 * Cấu hình lưu ở hr_settings key `attendance_range_export_columns`; chưa cấu hình
 * → dùng DEFAULT_RANGE_COLUMNS (khớp đúng layout đang chạy, không đổi hành vi).
 */

export type RangeCellType = 'text' | 'number';

/** Nguồn dữ liệu cố định — key phải khớp hàm dựng ô ở client. */
export interface RangeFieldMeta {
  key: string;
  label: string;
  group: string;
  type: RangeCellType;
  width: number;
}

/** Một cột trong cấu hình đã lưu. */
export interface RangeColumnConfig {
  id: string;
  /**
   * Nguồn:
   *  - key trong RANGE_FIELDS (cột dữ liệu cố định)
   *  - 'leave_all'    → BUNG thành mọi loại nghỉ/bù công đang áp dụng (tự bắt loại mới)
   *  - 'leave:<nhãn>' → đúng MỘT loại nghỉ, để tự sắp thứ tự
   *  - 'manual'       → cột trống cho HR tự điền
   *  - 'spacer'       → cột đệm
   */
  source: string;
  /** Nhãn tự đặt; rỗng = dùng nhãn gốc. */
  header?: string;
  /** false = ẩn khỏi file xuất. */
  enabled?: boolean;
  width?: number;
  type?: RangeCellType;
}

/** Cột đã giải nghĩa xong, sẵn sàng dựng file. */
export interface ResolvedRangeColumn {
  key: string;
  label: string;
  type: RangeCellType;
  width: number;
}

export const LEAVE_ALL = 'leave_all';
export const LEAVE_PREFIX = 'leave:';

/** Nhãn 2 cột bù công (không nằm trong danh mục leave_types). */
export const BU_CHECKIN_LABEL = 'Bù công quên check-in/check-out';
export const BU_CONG_LABEL = 'Bù công nguyên ngày';

export const RANGE_FIELDS: RangeFieldMeta[] = [
  { key: 'stt',           label: 'STT',        group: 'Định danh', type: 'number', width: 5 },
  { key: 'employee_code', label: 'Mã NV',      group: 'Định danh', type: 'text',   width: 12 },
  { key: 'name',          label: 'Họ và tên',  group: 'Định danh', type: 'text',   width: 24 },
  { key: 'company',       label: 'Công ty',    group: 'Định danh', type: 'text',   width: 20 },
  { key: 'department',    label: 'Phòng ban',  group: 'Định danh', type: 'text',   width: 22 },
  { key: 'date',          label: 'Ngày',       group: 'Thời gian', type: 'text',   width: 12 },
  { key: 'weekday',       label: 'Thứ',        group: 'Thời gian', type: 'text',   width: 10 },
  { key: 'check_in',      label: 'Giờ vào',    group: 'Chấm công', type: 'text',   width: 9 },
  { key: 'check_out',     label: 'Giờ ra',     group: 'Chấm công', type: 'text',   width: 9 },
  { key: 'total_hours',   label: 'Giờ công',   group: 'Chấm công', type: 'number', width: 9 },
  { key: 'work_days',     label: 'Ngày công',  group: 'Quy đổi',   type: 'number', width: 10 },
  { key: 'over_hours',    label: 'Dư giờ',     group: 'Quy đổi',   type: 'number', width: 8 },
  { key: 'short_hours',   label: 'Thiếu giờ',  group: 'Quy đổi',   type: 'number', width: 9 },
  { key: 'standard_hours', label: 'Giờ chuẩn/ngày', group: 'Quy đổi', type: 'number', width: 11 },
];

export const RANGE_FIELD_MAP = new Map(RANGE_FIELDS.map((f) => [f.key, f]));

/** Bề rộng mặc định cho cột nghỉ / bù công. */
export const LEAVE_COL_WIDTH = 13;

/**
 * Layout mặc định = đúng những gì file đang xuất hôm nay:
 * 13 cột dữ liệu + khối nghỉ/bù công tự sinh ở cuối.
 * (Giờ chuẩn/ngày có trong catalog nhưng mặc định TẮT — thêm khi cần đối chiếu.)
 */
export const DEFAULT_RANGE_COLUMNS: RangeColumnConfig[] = [
  ...RANGE_FIELDS.filter((f) => f.key !== 'standard_hours').map((f) => ({ id: f.key, source: f.key })),
  { id: LEAVE_ALL, source: LEAVE_ALL },
];

/** Nhãn hiển thị của 1 cột cấu hình (dùng chung server/client). */
export function rangeColumnLabel(c: RangeColumnConfig): string {
  if (c.header) return c.header;
  if (c.source === LEAVE_ALL) return 'Tất cả loại nghỉ / bù công (tự sinh)';
  if (c.source.startsWith(LEAVE_PREFIX)) return c.source.slice(LEAVE_PREFIX.length);
  if (c.source === 'manual') return 'Cột thủ công';
  if (c.source === 'spacer') return 'Cột đệm';
  return RANGE_FIELD_MAP.get(c.source)?.label ?? c.source;
}

/**
 * Giải nghĩa cấu hình → danh sách cột cuối cùng.
 * `leaveLabels` = mọi nhãn nghỉ/bù công đang áp dụng cho nhóm nhân sự được xuất.
 * Cột `leave_all` bung ra các nhãn CHƯA được khai báo riêng ở chỗ khác → không trùng cột.
 */
export function resolveRangeColumns(
  config: RangeColumnConfig[],
  leaveLabels: string[]
): ResolvedRangeColumn[] {
  const explicit = new Set(
    config
      .filter((c) => c.enabled !== false && c.source.startsWith(LEAVE_PREFIX))
      .map((c) => c.source.slice(LEAVE_PREFIX.length))
  );

  const out: ResolvedRangeColumn[] = [];
  let spacerSeq = 0;
  let manualSeq = 0;

  for (const c of config) {
    if (c.enabled === false) continue;

    if (c.source === LEAVE_ALL) {
      for (const label of leaveLabels) {
        if (explicit.has(label)) continue; // đã có cột riêng → khỏi nhân đôi
        out.push({ key: LEAVE_PREFIX + label, label, type: 'number', width: LEAVE_COL_WIDTH });
      }
      continue;
    }

    if (c.source.startsWith(LEAVE_PREFIX)) {
      const label = c.source.slice(LEAVE_PREFIX.length);
      out.push({ key: c.source, label: c.header || label, type: 'number', width: c.width ?? LEAVE_COL_WIDTH });
      continue;
    }

    if (c.source === 'spacer') {
      out.push({ key: `spacer_${spacerSeq++}`, label: '', type: 'text', width: c.width ?? 3 });
      continue;
    }

    if (c.source === 'manual') {
      out.push({ key: `manual_${manualSeq++}`, label: c.header || 'Cột thủ công', type: c.type ?? 'text', width: c.width ?? 14 });
      continue;
    }

    const f = RANGE_FIELD_MAP.get(c.source);
    if (!f) continue; // nguồn lạ (cấu hình cũ / gõ tay) → bỏ qua, không làm gãy file
    out.push({ key: f.key, label: c.header || f.label, type: c.type ?? f.type, width: c.width ?? f.width });
  }

  return out;
}
