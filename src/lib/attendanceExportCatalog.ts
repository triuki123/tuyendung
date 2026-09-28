/**
 * Catalog nguồn dữ liệu + cấu hình cột cho xuất bảng công.
 *
 * Module THUẦN (không import db, không xlsx) → dùng được cả client (exportWorkbook)
 * lẫn server (config service, API). Tách bạch:
 *   - FIELD_CATALOG: "dữ liệu lấy từ đâu" (dev mở rộng khi cần nguồn mới)
 *   - DEFAULT_COLUMNS / ColumnConfig: "cột nào / thứ tự / nhãn" (HR tự sửa qua UI)
 */

export type CellType = 'num' | 'money' | 'text';

/** 1 dòng dữ liệu nhân viên (do attendanceExportService gom từ DB). */
export interface SheetExportRow {
  // Định danh
  employee_code: string | null;
  cost_center_code: string | null;
  name: string;
  hire_date: string | null;
  position: string | null;
  department: string | null;
  employment_type: string | null;
  work_location: string | null;
  bank_account_name: string | null;
  bank_account_no: string | null;
  bank_name: string | null;
  email: string | null;
  // Công (ngày)
  cong_mac_dinh: number;
  cong_van_tay: number;
  /** Ngày công chấm bằng APP điện thoại (đã tách khỏi cong_van_tay, vẫn tính lương). */
  cong_dien_thoai: number;
  phep_nam: number;
  nghi_khong_luong: number;
  nghi_che_do: number;
  cong_tac: number;
  wfh: number;
  lam_theo_ca: number;
  bu_cong: number;
  ngay_le_tet: number;
  // Tăng ca (giờ)
  tang_ca_thuong: number;
  tang_ca_dem: number;
  lam_ngay_le: number;
  tang_ca_cn: number;
  // Tính toán
  cong_chuan: number;
  cong_tinh_luong: number;
  thieu_du: number;
  cong_tinh_phu_cap: number;
  // Phụ cấp (đồng)
  phu_cap_com: number;
  phu_cap_xe: number;
  cong_tac_phi: number;
  meal_enabled: boolean;
  parking_enabled: boolean;
  // BHXH
  social_insurance_unit: string | null;
  social_insurance_base: number | null;
  social_insurance_deduction: number | null;
  salary_entity: string | null;
  // ĐGTV
  trang_thai_dgtv: string | null;
  // Khác
  ghi_chu: string | null;
}

/** Định nghĩa 1 trường dữ liệu có sẵn nguồn. */
export interface FieldDef {
  key: string;
  label: string;          // nhãn header mặc định (\n = xuống dòng)
  group?: string;         // nhóm header tầng 1 (rỗng = cột đơn)
  width: number;
  type?: CellType;
  compute: (row: SheetExportRow, idx: number) => string | number;
}

/** 1 dòng cấu hình cột (lưu trong hr_settings, HR chỉnh được). */
export interface ColumnConfig {
  id: string;             // định danh ổn định để sắp xếp/sửa trên UI
  source: string;         // key trong FIELD_CATALOG | 'manual' (ô trống) | 'spacer' (đệm)
  header?: string;        // ghi đè nhãn
  group?: string;         // ghi đè nhóm
  width?: number;
  type?: CellType;
  enabled?: boolean;      // false = ẩn cột
}

/** Cột đã giải nghĩa (builder dùng để dựng file). */
export interface ResolvedColumn {
  source: string;
  key: string | null;     // null = cột đệm
  header: string;
  group: string;
  width: number;
  type?: CellType;
}

function hirePart(row: SheetExportRow, part: 'd' | 'm' | 'y'): string | number {
  if (!row.hire_date) return '';
  const [y, m, d] = row.hire_date.split('-');
  return Number(part === 'd' ? d : part === 'm' ? m : y) || '';
}

/** Trường "thẳng" — đọc trực tiếp row[key]. */
function plain(key: string, label: string, width: number, type?: CellType, group?: string): FieldDef {
  return {
    key,
    label,
    width,
    type,
    group,
    compute: (row) => {
      const v = (row as any)[key];
      if (v === null || v === undefined) return type && type !== 'text' ? 0 : '';
      return v;
    },
  };
}

/** Danh mục toàn bộ trường có sẵn nguồn dữ liệu. */
export const FIELD_CATALOG: FieldDef[] = [
  { key: 'stt', label: 'STT', width: 5, type: 'num', compute: (_r, i) => i + 1 },
  plain('employee_code', 'Mã nhân viên', 11),
  plain('cost_center_code', 'Mã CC', 9),
  plain('name', 'HỌ VÀ TÊN', 26),
  { key: 'hire_d', label: 'NGÀY', group: 'THỜI GIAN BẮT ĐẦU LÀM VIỆC', width: 6, type: 'num', compute: (r) => hirePart(r, 'd') },
  { key: 'hire_m', label: 'THÁNG', group: 'THỜI GIAN BẮT ĐẦU LÀM VIỆC', width: 6, type: 'num', compute: (r) => hirePart(r, 'm') },
  { key: 'hire_y', label: 'NĂM', group: 'THỜI GIAN BẮT ĐẦU LÀM VIỆC', width: 7, type: 'num', compute: (r) => hirePart(r, 'y') },
  plain('position', 'CHỨC DANH', 24),
  plain('department', 'PHÒNG BAN PHÂN BỔ', 18),
  plain('employment_type', 'HÌNH THỨC', 12),
  plain('work_location', 'NƠI LÀM VIỆC', 12),
  plain('bank_account_name', 'CHỦ TÀI KHOẢN', 22),
  plain('bank_account_no', 'SỐ TÀI KHOẢN', 16),
  plain('bank_name', 'TÊN NGÂN HÀNG', 24),
  plain('email', 'EMAIL CÔNG TY', 26),
  plain('cong_mac_dinh', 'CÔNG MẶC ĐỊNH', 8, 'num'),
  plain('cong_van_tay', 'CÔNG VÂN TAY', 8, 'num'),
  plain('cong_dien_thoai', 'CÔNG QUA ĐIỆN THOẠI', 10, 'num'),
  plain('cong_tac', 'CÔNG TÁC', 8, 'num', 'CÔNG ERP'),
  plain('nghi_khong_luong', 'NGHỈ KHÔNG LƯƠNG', 9, 'num', 'CÔNG ERP'),
  plain('nghi_che_do', 'NGHỈ CHẾ ĐỘ', 9, 'num', 'CÔNG ERP'),
  plain('lam_theo_ca', 'LÀM THEO CA', 9, 'num', 'CÔNG ERP'),
  plain('wfh', 'LÀM VIỆC TẠI NHÀ', 9, 'num', 'CÔNG ERP'),
  plain('phep_nam', 'PHÉP NĂM', 8, 'num', 'CÔNG ERP'),
  plain('bu_cong', 'BÙ CÔNG', 9, 'num', 'CÔNG ERP'),
  plain('ngay_le_tet', 'NGÀY LỄ, TẾT\n(Nghỉ chế độ Team building)', 10, 'num'),
  plain('tang_ca_thuong', 'TĂNG CA\nNGÀY THƯỜNG\n(GIỜ)', 9, 'num'),
  plain('tang_ca_dem', 'TĂNG CA NGÀY THƯỜNG\nSAU 22H00 (GIỜ)', 10, 'num'),
  plain('lam_ngay_le', 'LÀM VIỆC\nNGÀY LỄ (GIỜ)\nHs x2', 9, 'num'),
  plain('tang_ca_cn', 'TĂNG CA\nCHỦ NHẬT (GIỜ)\nHs x1,5', 9, 'num'),
  plain('cong_chuan', 'CÔNG CHUẨN', 8, 'num'),
  plain('cong_tinh_luong', 'CÔNG\nTÍNH LƯƠNG', 9, 'num'),
  plain('thieu_du', 'THIẾU (-)/\nDƯ CÔNG', 9, 'num'),
  plain('cong_tinh_phu_cap', 'CÔNG TÍNH PHỤ CẤP\n(Vân tay+Bù công)', 11, 'num'),
  plain('phu_cap_com', 'CƠM TRƯA\n(25.000đ/ngày)', 12, 'money', 'PHỤ CẤP'),
  plain('phu_cap_xe', 'GỬI XE\n(10.000đ/ngày)', 11, 'money', 'PHỤ CẤP'),
  plain('cong_tac_phi', 'CÔNG TÁC PHÍ', 12, 'money', 'PHỤ CẤP'),
  plain('ghi_chu', 'GHI CHÚ', 30),
  { key: 'note_com', label: 'CƠM TRƯA', group: 'GHI CHÚ PHỤ CẤP', width: 16, compute: (r) => (r.meal_enabled ? '' : 'Không phụ cấp cơm') },
  { key: 'note_xe', label: 'GỬI XE', group: 'GHI CHÚ PHỤ CẤP', width: 16, compute: (r) => (r.parking_enabled ? '' : 'Không phụ cấp gửi xe') },
  { key: 'note_ctp', label: 'CÔNG TÁC PHÍ', group: 'GHI CHÚ PHỤ CẤP', width: 16, compute: (r) => (r.cong_tac_phi > 0 ? '' : 'Không phụ cấp') },
  plain('trang_thai_dgtv', 'TRẠNG THÁI ĐGTV', 14),
  plain('social_insurance_unit', 'ĐƠN VỊ\nTHAM GIA BHXH', 16),
  plain('social_insurance_base', 'MỨC ĐÓNG', 12, 'money'),
  // Trích trừ là TỶ LỆ % (vd 10.5), không phải số tiền → kiểu 'num', không format tiền.
  plain('social_insurance_deduction', 'TRÍCH TRỪ (%)', 12, 'num'),
  plain('salary_entity', 'ĐƠN VỊ TRỰC THUỘC', 16),
];

const CATALOG_MAP = new Map(FIELD_CATALOG.map((f) => [f.key, f]));

const col = (source: string): ColumnConfig => ({ id: source, source });
const spacer = (id: string): ColumnConfig => ({ id, source: 'spacer', width: 3 });
const manual = (id: string, header: string, width: number, type?: CellType, group?: string): ColumnConfig =>
  ({ id, source: 'manual', header, width, type, group });

/** Layout mặc định = sao y khuôn DETAIL_fill (A → AW). */
export const DEFAULT_COLUMNS: ColumnConfig[] = [
  spacer('spacer_l'),
  col('stt'), col('employee_code'), col('cost_center_code'), col('name'),
  col('hire_d'), col('hire_m'), col('hire_y'),
  col('position'), col('department'), col('employment_type'), col('work_location'),
  col('bank_account_name'), col('bank_account_no'), col('bank_name'), col('email'),
  col('cong_mac_dinh'), col('cong_van_tay'), col('cong_dien_thoai'),
  col('cong_tac'), col('nghi_khong_luong'), col('nghi_che_do'), col('lam_theo_ca'), col('wfh'), col('phep_nam'), col('bu_cong'),
  col('ngay_le_tet'),
  col('tang_ca_thuong'), col('tang_ca_dem'), col('lam_ngay_le'), col('tang_ca_cn'),
  manual('bu_cong_dac_biet', 'BÙ CÔNG\n(TR/H ĐẶC BIỆT)', 9, 'num'),
  col('cong_chuan'), col('cong_tinh_luong'), col('thieu_du'),
  manual('ly_do_thieu_du', 'LÝ DO THIẾU DƯ CÔNG', 22, 'text'),
  col('cong_tinh_phu_cap'),
  col('phu_cap_com'), col('phu_cap_xe'), col('cong_tac_phi'),
  col('ghi_chu'),
  col('note_com'), col('note_xe'), col('note_ctp'),
  col('trang_thai_dgtv'),
  col('social_insurance_unit'), col('social_insurance_base'), col('social_insurance_deduction'),
  spacer('spacer_r'),
  col('salary_entity'),
];

/** Giải nghĩa cấu hình cột → metadata builder dùng (bỏ cột ẩn, ghép default từ catalog). */
export function resolveColumns(config: ColumnConfig[]): ResolvedColumn[] {
  const out: ResolvedColumn[] = [];
  for (const c of config) {
    if (c.enabled === false) continue;
    if (c.source === 'spacer') {
      out.push({ source: 'spacer', key: null, header: '', group: '', width: c.width ?? 3 });
      continue;
    }
    if (c.source === 'manual') {
      out.push({ source: 'manual', key: c.id, header: c.header ?? '', group: c.group ?? '', width: c.width ?? 12, type: c.type });
      continue;
    }
    const f = CATALOG_MAP.get(c.source);
    if (!f) continue; // nguồn không còn → bỏ qua
    out.push({
      source: f.key,
      key: f.key,
      header: c.header ?? f.label,
      group: c.group ?? f.group ?? '',
      width: c.width ?? f.width,
      type: c.type ?? f.type,
    });
  }
  return out;
}

/** Tính giá trị 1 ô. Cột đệm/thủ công → rỗng; cột có nguồn → gọi compute trong catalog. */
export function computeCell(rc: ResolvedColumn, row: SheetExportRow, idx: number): string | number {
  if (rc.source === 'spacer' || rc.source === 'manual') return '';
  const f = CATALOG_MAP.get(rc.source);
  if (!f) return '';
  return f.compute(row, idx);
}

export interface FieldMeta {
  key: string;
  label: string;
  group: string;
  type: CellType | null;
}

/** Danh mục trường (phẳng, không kèm hàm) để UI builder liệt kê nguồn có thể thêm. */
export function catalogMeta(): FieldMeta[] {
  return FIELD_CATALOG.map((f) => ({
    key: f.key,
    label: f.label.replace(/\n/g, ' '),
    group: f.group ?? '',
    type: f.type ?? null,
  }));
}
