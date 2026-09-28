/**
 * attendanceConfig.ts — NGUỒN DUY NHẤT cho các hằng số nghiệp vụ chấm công / tăng ca / kỳ công.
 *
 * Trước đây các giá trị này nằm rải rác (hardcode) ở nhiều file → dễ trôi lệch nhau.
 *
 * PHASE 1: giá trị mặc định nằm ở `DEFAULT_ATTENDANCE_CONFIG`. Khi cần theo công ty / theo ngày,
 *   dùng `attendanceSettingsService.resolveAttendanceConfig(companyId, onDate)` để lấy
 *   `ResolvedAttendanceConfig` (merge cấu hình DB lên default), rồi TRUYỀN vào các hàm thuần dưới đây.
 *   Các hàm thuần đều nhận tham số `cfg` (default = DEFAULT_ATTENDANCE_CONFIG) nên:
 *     - Client render được ngay khi chưa fetch config (dùng default).
 *     - Caller cũ không truyền cfg vẫn chạy như cũ.
 *
 * File thuần TypeScript (không import DB / không 'use server') → import được ở cả client lẫn server.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Kiểu cấu hình đã resolve (1 khối duy nhất, versioned, dễ thêm field)
// ─────────────────────────────────────────────────────────────────────────────

/** Giờ làm của MỘT thứ trong tuần. `open=false` ⇒ ngày nghỉ. startMin/endMin = phút trong ngày (0–1439). */
export interface DaySchedule {
  open: boolean;
  startMin: number;
  endMin: number;
}

/** Chính sách phép năm cố định, kế thừa phạm vi + ngày hiệu lực của Quy tắc chấm công. */
export interface AnnualLeavePolicyConfig {
  enabled: boolean;
  /** Tổng hạn mức dùng để tính mức cấp mỗi tháng (= baseDaysPerYear / 12). */
  baseDaysPerYear: number;
  /** Ngày cấp phép hằng tháng; tháng ngắn hơn sẽ dùng ngày cuối tháng. */
  accrualDay: number;
  seniorityBonusDays: number;
  seniorityEveryYears: number;
  carryoverMaxDays: number;
  /** MM-DD, ví dụ 03-31. */
  carryoverExpiryMMDD: string;
  allowHourly: boolean;
  allowHalfDay: boolean;
  countSunday: boolean;
}

export interface ResolvedAttendanceConfig {
  /** Chính sách phép năm của đúng phạm vi cấu hình này (mặc định hệ thống hoặc từng công ty). */
  annualLeavePolicy: AnnualLeavePolicyConfig;
  /**
   * Kỳ công.
   *  - `payrollStartDay > 1` → CROSS-MONTH: từ ngày `payrollStartDay` tháng N-1 → ngày
   *    kết thúc tháng N (vd 28 → 27).
   *  - `payrollStartDay === 1` → THEO THÁNG DƯƠNG LỊCH: ngày 1 → ngày kết thúc CÙNG tháng.
   */
  payrollStartDay: number;
  /** Ngày kết thúc kỳ (số cố định). Bị bỏ qua nếu `payrollEndDayIsLastOfMonth = true`. */
  payrollEndDay: number;
  /** True → ngày kết thúc kỳ = NGÀY CUỐI CÙNG của tháng (tự tính theo 28/29/30/31). */
  payrollEndDayIsLastOfMonth?: boolean;
  /** Nghỉ trưa (giờ VN) — phần ca làm trùng khung này bị trừ khỏi tổng giờ làm. */
  lunchStartHour: number;
  lunchEndHour: number;
  /** Ngưỡng đủ 1 ngày công (phút). Dưới mức này được "Bù Giờ" bằng chế độ công đặc biệt. */
  fullWorkdayMinutes: number;
  /** Khung phân loại lượt chấm theo giờ VN (24h). */
  punchWindows: {
    checkInStart: number;
    checkInEnd: number;
    checkOutStart: number;
    skipStart: number;
    skipEnd: number;
  };
  /** Hạn gửi đề xuất bù công / bù giờ (lùi nếu CN/lễ). Đóng trước khi hết kỳ. `minute` tuỳ chọn (mặc định 0). `nextMonth`=true → mốc rơi sang tháng KẾ TIẾP của kỳ (VD kỳ theo tháng dương lịch, hạn ngày 1 tháng sau). */
  adjustmentDeadline: { day: number; hour: number; minute?: number; nextMonth?: boolean };
  /** Hạn nộp / huỷ nộp BẢNG CÔNG. Khác hạn bù công: kỳ đóng rồi mới nộp sheet. `minute` tuỳ chọn (mặc định 0). `nextMonth`=true → mốc rơi sang tháng KẾ TIẾP của kỳ. */
  sheetSubmitDeadline: { day: number; hour: number; minute?: number; nextMonth?: boolean };
  /** Giờ sớm nhất (VN) được gửi Bù Công / Bù Giờ Vào trong CHÍNH NGÀY cần bù. */
  adjustmentSameDayEarliestHour: number;
  /** Ngày nghỉ trong tuần theo Date.getDay() (0=CN ... 6=T7). LEGACY — nay suy từ `weeklySchedule`. */
  weekendDays: number[];
  /**
   * Lịch giờ làm theo TỪNG THỨ trong tuần — mảng 7 phần tử, index = Date.getDay() (0=CN..6=T7).
   * `open=false` ⇒ ngày nghỉ (thay cho `weekendDays`); giờ làm riêng từng ngày giúp tính đi trễ / về sớm chuẩn.
   */
  weeklySchedule: DaySchedule[];
  /** Khung BUỔI SÁNG (phút trong ngày) — dùng cho nghỉ phép nửa buổi. */
  morningSession: { startMin: number; endMin: number };
  /** Khung BUỔI CHIỀU (phút trong ngày) — dùng cho nghỉ phép nửa buổi. */
  afternoonSession: { startMin: number; endMin: number };
  /**
   * Nghỉ phép NỬA BUỔI (chọn buổi sáng/chiều) trừ quỹ phép = giá trị cố định này (ngày).
   * `null` = tính theo GIỜ THỰC (số giờ buổi ÷ 8) — mặc định, giữ hành vi cũ.
   * Dùng cho công ty có 2 buổi lệch nhau (vd sáng 3.5h, chiều 4.5h) nhưng muốn mỗi buổi = 0.5.
   */
  halfDayLeaveValue: number | null;
  /** Khung giờ tăng ca (phút trong ngày, giờ VN). Khung đêm kết thúc >1440 (qua nửa đêm). */
  overtimeBrackets: { eveningStartMin: number; eveningEndMin: number; nightEndMin: number };
  /**
   * Ca làm việc chuẩn (giờ VN) — dùng cho Theo Dõi Chuyên Cần để xác định đi trễ / về sớm.
   * Check-in sau (workStart + lateGraceMinutes) = đi trễ; check-out trước
   * (workEnd - earlyLeaveGraceMinutes) = về sớm.
   */
  workShift: {
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
    /** Số phút dung sai sau giờ vào chuẩn trước khi tính là đi trễ. */
    lateGraceMinutes: number;
    /** Số phút dung sai trước giờ ra chuẩn trước khi tính là về sớm. */
    earlyLeaveGraceMinutes: number;
  };
}

/** Giá trị mặc định toàn hệ thống (tương đương các hằng số hardcode trước đây — FADO làm 6 ngày). */
export const DEFAULT_ATTENDANCE_CONFIG: ResolvedAttendanceConfig = {
  annualLeavePolicy: {
    enabled: true,
    baseDaysPerYear: 12,
    accrualDay: 1,
    seniorityBonusDays: 1,
    seniorityEveryYears: 5,
    carryoverMaxDays: 12,
    carryoverExpiryMMDD: '03-31',
    allowHourly: true,
    allowHalfDay: true,
    countSunday: false,
  },
  payrollStartDay: 28,
  payrollEndDay: 27,
  payrollEndDayIsLastOfMonth: false,
  lunchStartHour: 12,
  lunchEndHour: 13,
  fullWorkdayMinutes: 8 * 60, // 480
  punchWindows: { checkInStart: 4, checkInEnd: 11, checkOutStart: 14, skipStart: 3, skipEnd: 4 },
  adjustmentDeadline: { day: 27, hour: 17, minute: 0, nextMonth: false },
  sheetSubmitDeadline: { day: 28, hour: 11, minute: 0, nextMonth: false },
  adjustmentSameDayEarliestHour: 19,
  weekendDays: [0],
  // T2–T7 làm 8:30–17:30, CN nghỉ (khớp weekendDays=[0] + workShift mặc định).
  weeklySchedule: [
    { open: false, startMin: 8 * 60 + 30, endMin: 17 * 60 + 30 }, // 0 = CN
    { open: true,  startMin: 8 * 60 + 30, endMin: 17 * 60 + 30 }, // 1 = T2
    { open: true,  startMin: 8 * 60 + 30, endMin: 17 * 60 + 30 }, // 2 = T3
    { open: true,  startMin: 8 * 60 + 30, endMin: 17 * 60 + 30 }, // 3 = T4
    { open: true,  startMin: 8 * 60 + 30, endMin: 17 * 60 + 30 }, // 4 = T5
    { open: true,  startMin: 8 * 60 + 30, endMin: 17 * 60 + 30 }, // 5 = T6
    { open: true,  startMin: 8 * 60 + 30, endMin: 17 * 60 + 30 }, // 6 = T7
  ],
  morningSession:   { startMin: 8 * 60 + 30, endMin: 12 * 60 },  // 08:30–12:00
  afternoonSession: { startMin: 13 * 60, endMin: 17 * 60 + 30 }, // 13:00–17:30
  halfDayLeaveValue: null, // mặc định: nghỉ nửa buổi tính theo giờ thực (giờ ÷ 8)
  overtimeBrackets: { eveningStartMin: 17 * 60 + 30, eveningEndMin: 22 * 60, nightEndMin: 24 * 60 + 7 * 60 },
  // Ca chuẩn 08:30–17:30. Dung sai = 0 theo quy định: vào SAU 8:30 là đi trễ,
  // ra TRƯỚC 17:30 là về sớm — không có phút ân hạn nào.
  workShift: { startHour: 8, startMinute: 30, endHour: 17, endMinute: 30, lateGraceMinutes: 0, earlyLeaveGraceMinutes: 0 },
};

/** Dựng `weeklySchedule` từ cấu hình LEGACY (weekendDays + workShift) khi config DB chưa có field mới. */
function synthWeeklySchedule(weekendDays: number[], workShift: ResolvedAttendanceConfig['workShift']): DaySchedule[] {
  const startMin = workShift.startHour * 60 + workShift.startMinute;
  const endMin = workShift.endHour * 60 + workShift.endMinute;
  return Array.from({ length: 7 }, (_, dow) => ({ open: !weekendDays.includes(dow), startMin, endMin }));
}

/**
 * Merge nông cấu hình DB (có thể thiếu field) lên DEFAULT — an toàn khi thêm field mới về sau.
 * Các object con cũng merge nông để không mất field con khi DB chỉ lưu một phần.
 */
export function mergeAttendanceConfig(partial: Partial<ResolvedAttendanceConfig> | null | undefined): ResolvedAttendanceConfig {
  if (!partial) return { ...DEFAULT_ATTENDANCE_CONFIG };
  const d = DEFAULT_ATTENDANCE_CONFIG;
  const workShift = { ...d.workShift, ...(partial.workShift ?? {}) };
  const legacyWeekend = partial.weekendDays ?? d.weekendDays;

  // weeklySchedule: ưu tiên config mới; nếu config CŨ chưa có → dựng từ weekendDays + workShift (giữ hành vi cũ).
  const weeklySchedule = (Array.isArray(partial.weeklySchedule) && partial.weeklySchedule.length === 7)
    ? partial.weeklySchedule.map((s, i) => ({ ...d.weeklySchedule[i], ...s }))
    : synthWeeklySchedule(legacyWeekend, workShift);

  // weekendDays luôn ĐỒNG BỘ với weeklySchedule (ngày không mở = nghỉ) để code legacy dùng weekendDays vẫn đúng.
  const weekendDays = weeklySchedule.map((s, dow) => (s.open ? -1 : dow)).filter(dow => dow >= 0);

  return {
    ...d,
    ...partial,
    annualLeavePolicy: { ...d.annualLeavePolicy, ...(partial.annualLeavePolicy ?? {}) },
    payrollEndDayIsLastOfMonth: partial.payrollEndDayIsLastOfMonth ?? d.payrollEndDayIsLastOfMonth,
    punchWindows: { ...d.punchWindows, ...(partial.punchWindows ?? {}) },
    adjustmentDeadline: { ...d.adjustmentDeadline, ...(partial.adjustmentDeadline ?? {}) },
    sheetSubmitDeadline: { ...d.sheetSubmitDeadline, ...(partial.sheetSubmitDeadline ?? {}) },
    overtimeBrackets: { ...d.overtimeBrackets, ...(partial.overtimeBrackets ?? {}) },
    workShift,
    weeklySchedule,
    weekendDays,
    morningSession: { ...d.morningSession, ...(partial.morningSession ?? {}) },
    afternoonSession: { ...d.afternoonSession, ...(partial.afternoonSession ?? {}) },
    halfDayLeaveValue: partial.halfDayLeaveValue ?? d.halfDayLeaveValue,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers thuần — nhận cfg, default = DEFAULT_ATTENDANCE_CONFIG
// ─────────────────────────────────────────────────────────────────────────────

/** Ngày cuối cùng của tháng (month: 1-12). Ngày 0 của tháng kế = ngày cuối tháng này. */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Quy đổi mốc hạn (day + cờ nextMonth) của kỳ (periodMonth, periodYear) ra
 * (month, year, day) THỰC TẾ trên lịch dương.
 *  - nextMonth=false → cùng tháng của kỳ.
 *  - nextMonth=true  → tháng KẾ TIẾP của kỳ (VD kỳ theo tháng dương lịch: hạn ngày 1
 *    tháng sau khi kỳ đã kết thúc ngày cuối tháng).
 * `day` luôn được kẹp về ngày cuối của tháng đích để cấu hình "31" luôn hợp lệ.
 */
export function resolveDeadlineDate(
  periodMonth: number,
  periodYear: number,
  d: { day: number; nextMonth?: boolean }
): { month: number; year: number; day: number } {
  let month = periodMonth;
  let year = periodYear;
  if (d.nextMonth) {
    if (month === 12) { month = 1; year += 1; } else { month += 1; }
  }
  const day = Math.min(d.day, lastDayOfMonth(year, month));
  return { month, year, day };
}

/**
 * Ngày kết thúc kỳ THỰC TẾ cho (payrollMonth, payrollYear):
 *  - Nếu bật "ngày cuối tháng" → ngày cuối cùng của payrollMonth.
 *  - Ngược lại → payrollEndDay, nhưng KẸP về ngày cuối tháng nếu tháng đó ngắn hơn
 *    (vd cấu hình 30 nhưng tháng 2 chỉ có 28/29).
 */
export function resolvePayrollEndDay(
  payrollYear: number,
  payrollMonth: number,
  cfg: ResolvedAttendanceConfig = DEFAULT_ATTENDANCE_CONFIG
): number {
  const last = lastDayOfMonth(payrollYear, payrollMonth);
  if (cfg.payrollEndDayIsLastOfMonth) return last;
  return Math.min(cfg.payrollEndDay, last);
}

/**
 * Map 1 ngày làm (YYYY-MM-DD, timezone VN) → kỳ công chứa nó.
 *  - payrollStartDay === 1 (theo tháng dương lịch): kỳ = chính tháng của ngày đó.
 *  - payrollStartDay > 1 (cross-month): ngày >= payrollStartDay thuộc kỳ THÁNG SAU.
 *    VD (28): 30/05 → kỳ tháng 6; 27/05 → kỳ tháng 5.
 */
export function getPayrollPeriodForDate(
  workDate: string,
  cfg: ResolvedAttendanceConfig = DEFAULT_ATTENDANCE_CONFIG
): { month: number; year: number } {
  const [y, m, d] = workDate.split('-').map(Number);
  // Theo tháng dương lịch → kỳ chính là tháng của ngày làm.
  if (cfg.payrollStartDay <= 1) return { month: m, year: y };
  const rollsOver = d >= cfg.payrollStartDay;
  const month = rollsOver ? (m === 12 ? 1 : m + 1) : m;
  const year = rollsOver && m === 12 ? y + 1 : y;
  return { month, year };
}

/**
 * Ngày bắt đầu & kết thúc (Date, giờ địa phương) của kỳ công (payrollMonth, payrollYear).
 *  - Theo tháng dương lịch (start=1): [01, ngày-kết-thúc] CÙNG tháng.
 *  - Cross-month (start>1): [payrollStartDay tháng N-1, ngày-kết-thúc tháng N].
 */
export function getPayrollPeriodDates(
  payrollMonth: number,
  payrollYear: number,
  cfg: ResolvedAttendanceConfig = DEFAULT_ATTENDANCE_CONFIG
): { startDate: Date; endDate: Date } {
  const endDay = resolvePayrollEndDay(payrollYear, payrollMonth, cfg);
  const endDate = new Date(payrollYear, payrollMonth - 1, endDay, 23, 59, 59);

  if (cfg.payrollStartDay <= 1) {
    // Theo tháng dương lịch: bắt đầu ngày 1 CÙNG tháng.
    return { startDate: new Date(payrollYear, payrollMonth - 1, 1, 0, 0, 0), endDate };
  }
  // Cross-month: bắt đầu ở tháng trước.
  let startMonth = payrollMonth - 1;
  let startYear = payrollYear;
  if (startMonth < 1) { startMonth = 12; startYear -= 1; }
  const startDate = new Date(startYear, startMonth - 1, cfg.payrollStartDay, 0, 0, 0);
  return { startDate, endDate };
}

/** True nếu thứ trong tuần (getDay 0=CN..6=T7) là ngày nghỉ (không mở giờ làm). */
export function isWeekendDay(dow: number, cfg: ResolvedAttendanceConfig = DEFAULT_ATTENDANCE_CONFIG): boolean {
  const sch = cfg.weeklySchedule?.[dow];
  if (sch) return !sch.open;
  return cfg.weekendDays.includes(dow); // fallback config cũ
}

/**
 * Giờ làm (phút trong ngày) của MỘT thứ trong tuần. Trả `null` nếu ngày đó nghỉ.
 * Dùng cho tính đi trễ / về sớm theo từng ngày.
 */
export function getShiftForDow(
  dow: number,
  cfg: ResolvedAttendanceConfig = DEFAULT_ATTENDANCE_CONFIG
): { startMin: number; endMin: number } | null {
  const sch = cfg.weeklySchedule?.[dow];
  if (sch) return sch.open ? { startMin: sch.startMin, endMin: sch.endMin } : null;
  // fallback config cũ
  if (cfg.weekendDays.includes(dow)) return null;
  return {
    startMin: cfg.workShift.startHour * 60 + cfg.workShift.startMinute,
    endMin: cfg.workShift.endHour * 60 + cfg.workShift.endMinute,
  };
}

/** Khung nghỉ trưa quy ra phút trong ngày. */
export function lunchRangeMinutes(cfg: ResolvedAttendanceConfig = DEFAULT_ATTENDANCE_CONFIG): { start: number; end: number } {
  return { start: cfg.lunchStartHour * 60, end: cfg.lunchEndHour * 60 };
}
