import { query, queryOne, execute } from '@/lib/db';
import * as attendanceService from './attendanceService';
import { ResolvedAttendanceConfig, DEFAULT_ATTENDANCE_CONFIG, isWeekendDay, resolveDeadlineDate } from '@/lib/config/attendanceConfig';

// Loại CẤU TRÚC cố định. Mọi code KHÁC = work-mode (WFH/Công tác/loại tự tạo qua danh mục).
export const STRUCTURAL_ADJ_TYPES = ['bu_cong', 'bu_cong_dac_biet', 'bu_checkin', 'bu_checkout'] as const;
const PARTIAL_ADJ_TYPES = ['bu_checkin', 'bu_checkout'];
/** AdjustmentType: literal cấu trúc/quen thuộc + cho phép code work-mode ĐỘNG (string). */
export type AdjustmentType =
  | 'bu_cong' | 'bu_cong_dac_biet' | 'bu_checkin' | 'bu_checkout'
  | 'cong_tac' | 'wfh' | 'lam_theo_ca'
  | (string & {});

/** Work-mode = KHÔNG phải loại cấu trúc → tính đủ 1 ngày công (sinh check-in + check-out). */
export const isWorkModeType = (t: string): boolean => !(STRUCTURAL_ADJ_TYPES as readonly string[]).includes(t);
/** Full-day = mọi loại TRỪ bù giờ vào/ra (đều sinh cả check-in lẫn check-out). */
export const isFullDayType = (t: string): boolean => !PARTIAL_ADJ_TYPES.includes(t);
/** Được tạo nhiều ngày = full-day (work-mode + bù công + bù công đặc thù). */
export const isMultiDayType = (t: string): boolean => isFullDayType(t);

/** 3 chế độ công quen thuộc (giữ để tham chiếu; nhận diện chung dùng isWorkModeType). */
export const WORK_MODE_TYPES: AdjustmentType[] = ['cong_tac', 'wfh', 'lam_theo_ca'];
export type AdjustmentStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface AttendanceAdjustment {
  id: string;
  user_id: string;
  adjustment_type: AdjustmentType;
  work_date: string;
  /** Buổi (nửa ngày) cho work-mode: 'morning' | 'afternoon' | null (cả ngày). */
  day_part: 'morning' | 'afternoon' | null;
  requested_checkin: string | null;
  requested_checkout: string | null;
  reason: string;
  status: AdjustmentStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  batch_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  user_name?: string | null;
  user_email?: string | null;
  reviewer_name?: string | null;
}

export interface PublicHoliday {
  id: string;
  date: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

// ─── Public Holidays ──────────────────────────────────────────────

export async function getAllHolidays(): Promise<PublicHoliday[]> {
  return query<PublicHoliday>(
    `SELECT * FROM public_holidays ORDER BY date ASC`,
    []
  );
}

export async function getHolidaysByYear(year: number): Promise<PublicHoliday[]> {
  return query<PublicHoliday>(
    `SELECT * FROM public_holidays
     WHERE EXTRACT(YEAR FROM date) = $1
     ORDER BY date ASC`,
    [year]
  );
}

export async function createHoliday(data: {
  date: string;
  name: string;
  description?: string;
  created_by?: string;
}): Promise<PublicHoliday> {
  return queryOne<PublicHoliday>(
    `INSERT INTO public_holidays (date, name, description, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (date) DO UPDATE SET name = $2, description = $3
     RETURNING *`,
    [data.date, data.name, data.description ?? null, data.created_by ?? null]
  ) as Promise<PublicHoliday>;
}

export async function deleteHoliday(id: string): Promise<boolean> {
  const n = await execute(`DELETE FROM public_holidays WHERE id = $1`, [id]);
  return n > 0;
}

export async function isHoliday(dateStr: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM public_holidays WHERE date = $1::date`,
    [dateStr]
  );
  return !!row;
}

/**
 * Tính deadline gửi bù công: theo cfg.adjustmentDeadline (mặc định 17:00 ngày 27).
 * Nếu ngày hạn là Chủ nhật hoặc ngày lễ → lùi về ngày làm trước đó.
 */
export async function getMonthDeadline(
  month: number,
  year: number,
  cfg: ResolvedAttendanceConfig = DEFAULT_ATTENDANCE_CONFIG
): Promise<Date> {
  // Bắt đầu từ ngày hạn (mặc định 27) lúc giờ:phút hạn VN; lùi nếu rơi vào CN/lễ.
  // Kẹp ngày hạn về ngày cuối tháng để cấu hình "31" luôn hợp lệ (tháng 2 → 28/29).
  const hh = String(cfg.adjustmentDeadline.hour).padStart(2, '0');
  const min = String(cfg.adjustmentDeadline.minute ?? 0).padStart(2, '0');
  // Quy đổi mốc hạn ra (tháng, năm, ngày) thực — xét cờ nextMonth (hạn sang tháng kế của kỳ).
  const dl = resolveDeadlineDate(month, year, cfg.adjustmentDeadline);
  let dayNum = dl.day;

  while (true) {
    const mm = String(dl.month).padStart(2, '0');
    const dd = String(dayNum).padStart(2, '0');
    const dateStr = `${dl.year}-${mm}-${dd}`;
    const deadlineISO = `${dateStr}T${hh}:${min}:00+07:00`;
    const deadlineDate = new Date(deadlineISO);

    // Check cuối tuần (chỉ Chủ nhật nghỉ với FADO 6 ngày) + ngày lễ
    const dow = new Date(dateStr + 'T00:00:00+07:00').getDay();
    const holiday = await isHoliday(dateStr);

    if (isWeekendDay(dow, cfg) || holiday) {
      dayNum--; // lùi 1 ngày
      if (dayNum < 1) break; // an toàn
    } else {
      return deadlineDate; // Trả về UTC Date đã convert đúng từ VN timezone
    }
  }

  // Fallback không nên xảy ra
  const fbDay = String(dl.day).padStart(2, '0');
  return new Date(`${dl.year}-${String(dl.month).padStart(2, '0')}-${fbDay}T${hh}:${min}:00+07:00`);
}

/**
 * Hạn NỘP/GỬI BẢNG CÔNG của kỳ (month, year) — theo `cfg.sheetSubmitDeadline`
 * (mặc định ngày 28, 11:00). Khác hạn bù công (adjustmentDeadline). Lùi nếu CN/lễ.
 * Dùng cho scheduler tự động gửi bảng công về Bộ Phận Chấm Công.
 */
export async function getSheetSubmitDeadline(
  month: number,
  year: number,
  cfg: ResolvedAttendanceConfig = DEFAULT_ATTENDANCE_CONFIG
): Promise<Date> {
  const hh = String(cfg.sheetSubmitDeadline.hour).padStart(2, '0');
  const min = String(cfg.sheetSubmitDeadline.minute ?? 0).padStart(2, '0');
  // Quy đổi mốc hạn ra (tháng, năm, ngày) thực — xét cờ nextMonth (hạn sang tháng kế của kỳ).
  const dl = resolveDeadlineDate(month, year, cfg.sheetSubmitDeadline);
  let dayNum = dl.day;

  while (dayNum >= 1) {
    const mm = String(dl.month).padStart(2, '0');
    const dd = String(dayNum).padStart(2, '0');
    const dateStr = `${dl.year}-${mm}-${dd}`;
    const dow = new Date(dateStr + 'T00:00:00+07:00').getDay();
    const holiday = await isHoliday(dateStr);
    if (isWeekendDay(dow, cfg) || holiday) { dayNum--; continue; }
    return new Date(`${dateStr}T${hh}:${min}:00+07:00`);
  }
  // Fallback
  const fbDay = String(dl.day).padStart(2, '0');
  return new Date(`${dl.year}-${String(dl.month).padStart(2, '0')}-${fbDay}T${hh}:${min}:00+07:00`);
}

// ─── Attendance Adjustments ──────────────────────────────────────

export async function getUserAdjustments(
  userId: string,
  month?: number,
  year?: number
): Promise<AttendanceAdjustment[]> {
  const conditions: string[] = ['a.user_id = $1'];
  const params: unknown[] = [userId];
  let i = 2;
  if (month) { conditions.push(`EXTRACT(MONTH FROM a.work_date) = $${i++}`); params.push(month); }
  if (year)  { conditions.push(`EXTRACT(YEAR FROM a.work_date) = $${i++}`);  params.push(year); }

  return query<AttendanceAdjustment>(
    `SELECT a.*,
       u.name AS user_name, u.email AS user_email,
       r.name AS reviewer_name
     FROM attendance_adjustments a
     LEFT JOIN users u ON u.id::text = a.user_id
     LEFT JOIN users r ON r.id::text = a.reviewed_by
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.work_date DESC, a.created_at DESC`,
    params
  );
}

/** Lấy adjustment của user cho 1 ngày cụ thể */
export async function getDayAdjustment(
  userId: string,
  workDate: string,
  type: AdjustmentType
): Promise<AttendanceAdjustment | null> {
  return queryOne<AttendanceAdjustment>(
    `SELECT * FROM attendance_adjustments
     WHERE user_id = $1 AND work_date = $2::date AND adjustment_type = $3
     LIMIT 1`,
    [userId, workDate, type]
  );
}

/** Lấy tất cả adjustments cho manager duyệt */
export async function getAllAdjustments(filters?: {
  status?: AdjustmentStatus;
  month?: number;
  year?: number;
  companyId?: string | null;
}): Promise<AttendanceAdjustment[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  // Đa Công Ty: nếu có companyId → chỉ thành viên công ty đó.
  if (filters?.companyId) {
    const { getCompanyMemberUserIds } = await import('@/lib/services/userCompanyService');
    const memberIds = await getCompanyMemberUserIds(filters.companyId);
    if (memberIds.length === 0) return [];
    conditions.push(`a.user_id::text = ANY($${i++}::text[])`);
    params.push(memberIds);
  }
  if (filters?.status) { conditions.push(`a.status = $${i++}`); params.push(filters.status); }
  if (filters?.month)  { conditions.push(`EXTRACT(MONTH FROM a.work_date) = $${i++}`); params.push(filters.month); }
  if (filters?.year)   { conditions.push(`EXTRACT(YEAR FROM a.work_date) = $${i++}`);  params.push(filters.year); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return query<AttendanceAdjustment>(
    `SELECT a.*,
       u.name AS user_name, u.email AS user_email,
       u.avatar AS user_avatar,
       dpt.name AS dept_name, cmp.name AS company_name,
       r.name AS reviewer_name
     FROM attendance_adjustments a
     LEFT JOIN users u ON u.id::text = a.user_id
     LEFT JOIN departments dpt ON dpt.id::text = u.department_id::text
     LEFT JOIN companies cmp ON cmp.id::text = COALESCE(u.company_id::text, dpt.company_id::text)
     LEFT JOIN users r ON r.id::text = a.reviewed_by
     ${where}
     ORDER BY
       CASE a.status WHEN 'pending' THEN 0 ELSE 1 END,
       a.work_date DESC, a.created_at DESC`,
    params
  );
}

/** Lấy adjustments của toàn bộ nhân viên trực thuộc (cho Quản Lý Trực Tiếp) */
export async function getTeamAdjustments(
  managerId: string,
  filters?: { status?: AdjustmentStatus; month?: number; year?: number; companyId?: string | null }
): Promise<AttendanceAdjustment[]> {
  // Đa Công Ty: cấp dưới (đệ quy) trong công ty đang làm việc
  // ∪ nhân sự được ỦY QUYỀN duyệt cho người này (vượt cây sơ đồ).
  const { getOrgSubtreeUserIds } = await import('@/lib/services/attendanceService');
  const { getDelegatedTargetIds } = await import('@/lib/services/leaveDelegationService');
  const [subtree, delegated] = await Promise.all([
    getOrgSubtreeUserIds(managerId, filters?.companyId ?? null),
    getDelegatedTargetIds(managerId),
  ]);
  const scopeIds = [...new Set([...subtree, ...delegated])];
  if (scopeIds.length === 0) return [];

  const conditions: string[] = ['a.user_id::text = ANY($1::text[])'];
  const params: unknown[] = [scopeIds];
  let i = 2;

  if (filters?.status) { conditions.push(`a.status = $${i++}`); params.push(filters.status); }
  if (filters?.month)  { conditions.push(`EXTRACT(MONTH FROM a.work_date) = $${i++}`); params.push(filters.month); }
  if (filters?.year)   { conditions.push(`EXTRACT(YEAR FROM a.work_date) = $${i++}`);  params.push(filters.year); }

  return query<AttendanceAdjustment>(
    `SELECT a.*,
       u.name AS user_name, u.email AS user_email,
       dpt.name AS dept_name, cmp.name AS company_name,
       r.name AS reviewer_name
     FROM attendance_adjustments a
     JOIN users u ON u.id::text = a.user_id
     LEFT JOIN departments dpt ON dpt.id::text = u.department_id::text
     LEFT JOIN companies cmp ON cmp.id::text = COALESCE(u.company_id::text, dpt.company_id::text)
     LEFT JOIN users r ON r.id::text = a.reviewed_by
     WHERE ${conditions.join(' AND ')}
     ORDER BY
       CASE a.status WHEN 'pending' THEN 0 ELSE 1 END,
       a.work_date DESC, a.created_at DESC`,
    params
  );
}

/** Tạo đề xuất bù công */
export async function createAdjustment(data: {
  user_id: string;
  adjustment_type: AdjustmentType;
  work_date: string;
  requested_checkin?: string;
  requested_checkout?: string;
  reason: string;
  day_part?: 'morning' | 'afternoon' | null;
}): Promise<AttendanceAdjustment> {
  return queryOne<AttendanceAdjustment>(
    `INSERT INTO attendance_adjustments
       (user_id, adjustment_type, work_date, requested_checkin, requested_checkout, reason, day_part)
     VALUES ($1,$2,$3::date,$4,$5,$6,$7)
     ON CONFLICT (user_id, work_date, adjustment_type)
     DO UPDATE SET
       requested_checkin  = EXCLUDED.requested_checkin,
       requested_checkout = EXCLUDED.requested_checkout,
       reason             = EXCLUDED.reason,
       day_part           = EXCLUDED.day_part,
       status             = 'pending',
       reviewed_by        = NULL,
       reviewed_at        = NULL,
       review_note        = NULL,
       updated_at         = NOW()
     WHERE attendance_adjustments.status IN ('rejected', 'cancelled')
     RETURNING *`,
    [
      data.user_id,
      data.adjustment_type,
      data.work_date,
      data.requested_checkin ?? null,
      data.requested_checkout ?? null,
      data.reason,
      data.day_part ?? null,
    ]
  ) as Promise<AttendanceAdjustment>;
}

/**
 * Tạo đề xuất bù công NHIỀU NGÀY (chỉ cho 3 chế độ công đặc biệt:
 * cong_tac / wfh / lam_theo_ca — tính nguyên ngày, dùng chung 1 khoảng giờ).
 *
 * Mô hình lưu trữ KHÔNG đổi: vẫn N dòng per-day (mỗi ngày 1 dòng), nối với nhau
 * bằng cùng `batch_id`. Bỏ qua Chủ nhật/cuối tuần + ngày lễ + ngày đã có đề xuất
 * đang chờ/đã duyệt. Toàn bộ chạy trong 1 transaction.
 */
export interface CreateBatchResult {
  batch_id: string;
  created: AttendanceAdjustment[];
  /** Ngày bị bỏ qua + lý do (để UI báo lại cho user) */
  skipped: { date: string; reason: 'weekend' | 'holiday' | 'exists' }[];
}

/** Duyệt từng ngày trong khoảng [start, end] theo UTC để tránh lệch timezone. */
function eachDateInclusive(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = new Date(start + 'T00:00:00Z').getTime();
  const last = new Date(end + 'T00:00:00Z').getTime();
  // Giới hạn an toàn 92 ngày (~3 tháng) để tránh vòng lặp bất thường.
  let guard = 0;
  while (cur <= last && guard < 92) {
    out.push(new Date(cur).toISOString().slice(0, 10));
    cur += 86400000;
    guard++;
  }
  return out;
}

export async function createAdjustmentBatch(data: {
  user_id: string;
  adjustment_type: AdjustmentType; // work mode (cong_tac/wfh/lam_theo_ca) hoặc bu_cong
  start_date: string;              // YYYY-MM-DD
  end_date: string;                // YYYY-MM-DD
  checkin_time: string;            // 'HH:mm' — áp cho mọi ngày trong khoảng
  checkout_time: string;           // 'HH:mm'
  reason: string;
  cfg?: ResolvedAttendanceConfig;
}): Promise<CreateBatchResult> {
  const { withTransaction } = await import('@/lib/db');
  const crypto = await import('crypto');
  const cfg = data.cfg ?? DEFAULT_ATTENDANCE_CONFIG;

  const dates = eachDateInclusive(data.start_date, data.end_date);
  const batchId = crypto.randomUUID();

  // Tập ngày lễ trong khoảng — query 1 lần.
  const holidayRows = await query<{ date: string }>(
    `SELECT to_char(date, 'YYYY-MM-DD') AS date FROM public_holidays
     WHERE date >= $1::date AND date <= $2::date`,
    [data.start_date, data.end_date]
  );
  const holidaySet = new Set(holidayRows.map((h) => h.date));

  const result: CreateBatchResult = { batch_id: batchId, created: [], skipped: [] };

  // Cờ "tính Chủ nhật" đọc từ loại phép/công (leave_types.count_sunday) theo code.
  // true = ca làm việc gồm cả cuối tuần → CN vẫn là ngày công bình thường (không bỏ qua,
  // không tính tăng ca — tăng ca lấy từ bảng attendance_overtime riêng). Vd: Làm theo ca.
  const typeRow = await queryOne<{ count_sunday: boolean }>(
    `SELECT count_sunday FROM leave_types WHERE code = $1 LIMIT 1`,
    [data.adjustment_type]
  );
  const countSunday = !!typeRow?.count_sunday;

  await withTransaction(async (client) => {
    for (const dateStr of dates) {
      const dow = new Date(dateStr + 'T00:00:00+07:00').getDay();
      if (!countSunday && isWeekendDay(dow, cfg)) { result.skipped.push({ date: dateStr, reason: 'weekend' }); continue; }
      if (holidaySet.has(dateStr)) { result.skipped.push({ date: dateStr, reason: 'holiday' }); continue; }

      const checkinISO  = `${dateStr}T${data.checkin_time}:00+07:00`;
      const checkoutISO = `${dateStr}T${data.checkout_time}:00+07:00`;

      // Upsert: tạo mới, hoặc ghi đè nếu ngày đó từng bị từ chối/hủy.
      // Ngày đang pending/approved → WHERE chặn, RETURNING rỗng → tính là 'exists'.
      const row = await client.query<AttendanceAdjustment>(
        `INSERT INTO attendance_adjustments
           (user_id, adjustment_type, work_date, requested_checkin, requested_checkout, reason, batch_id)
         VALUES ($1,$2,$3::date,$4,$5,$6,$7)
         ON CONFLICT (user_id, work_date, adjustment_type)
         DO UPDATE SET
           requested_checkin  = EXCLUDED.requested_checkin,
           requested_checkout = EXCLUDED.requested_checkout,
           reason             = EXCLUDED.reason,
           batch_id           = EXCLUDED.batch_id,
           status             = 'pending',
           reviewed_by        = NULL,
           reviewed_at        = NULL,
           review_note        = NULL,
           updated_at         = NOW()
         WHERE attendance_adjustments.status IN ('rejected', 'cancelled')
         RETURNING *`,
        [data.user_id, data.adjustment_type, dateStr, checkinISO, checkoutISO, data.reason, batchId]
      );

      if (row.rows[0]) result.created.push(row.rows[0]);
      else result.skipped.push({ date: dateStr, reason: 'exists' });
    }
  });

  return result;
}

/** Duyệt hoặc từ chối đề xuất */
export async function reviewAdjustment(
  id: string,
  reviewerId: string,
  action: 'approved' | 'rejected',
  reviewNote?: string
): Promise<AttendanceAdjustment | null> {
  return queryOne<AttendanceAdjustment>(
    `UPDATE attendance_adjustments
     SET status=$2, reviewed_by=$3, reviewed_at=NOW(), review_note=$4, updated_at=NOW()
     WHERE id=$1 AND status='pending'
     RETURNING *`,
    [id, action, reviewerId, reviewNote ?? null]
  );
}

/**
 * Ghi attendance_records thực khi 1 đề xuất được duyệt.
 * type='app' để getMonthRecordsProjected (AND type='app') nhận ra.
 * bu_cong + 3 chế độ công đặc biệt → ghi cả check_in lẫn check_out (1 ngày công đầy đủ).
 */
export async function applyApprovedAdjustment(adj: AttendanceAdjustment): Promise<void> {
  const MODE_NOTE: Record<string, string> = {
    bu_cong:          'Bù công - được duyệt',
    bu_cong_dac_biet: 'Bù công đặc thù - được duyệt',
    cong_tac:    'Công tác - được duyệt',
    wfh:         'Làm việc tại nhà - được duyệt',
    lam_theo_ca: 'Làm theo ca - được duyệt',
  };
  // Mọi loại full-day (bù công + bù công đặc thù + MỌI work-mode kể cả loại tự tạo)
  // → ghi cả check-in lẫn check-out = 1 ngày công đầy đủ.
  if (isFullDayType(adj.adjustment_type)) {
    const note = MODE_NOTE[adj.adjustment_type] ?? 'Bù công (chế độ đặc biệt) - được duyệt';
    if (adj.requested_checkin) {
      await execute(
        `INSERT INTO attendance_records (user_id, event_type, type, recorded_at, notes)
         VALUES ($1,'check_in','app',$2,$3) ON CONFLICT DO NOTHING`,
        [adj.user_id, adj.requested_checkin, note]
      );
    }
    if (adj.requested_checkout) {
      await execute(
        `INSERT INTO attendance_records (user_id, event_type, type, recorded_at, notes)
         VALUES ($1,'check_out','app',$2,$3) ON CONFLICT DO NOTHING`,
        [adj.user_id, adj.requested_checkout, note]
      );
    }
  } else if (adj.adjustment_type === 'bu_checkin' && adj.requested_checkin) {
    await execute(
      `INSERT INTO attendance_records (user_id, event_type, type, recorded_at, notes)
       VALUES ($1,'check_in','app',$2,'Bù giờ vào - được duyệt') ON CONFLICT DO NOTHING`,
      [adj.user_id, adj.requested_checkin]
    );
  } else if (adj.adjustment_type === 'bu_checkout' && adj.requested_checkout) {
    await execute(
      `INSERT INTO attendance_records (user_id, event_type, type, recorded_at, notes)
       VALUES ($1,'check_out','app',$2,'Bù giờ ra - được duyệt') ON CONFLICT DO NOTHING`,
      [adj.user_id, adj.requested_checkout]
    );
  }
}

/**
 * Duyệt/từ chối CẢ ĐỢT bù công theo batch_id. Chỉ tác động các dòng đang pending.
 * Approved → ghi attendance_records cho từng dòng. Trả về các dòng đã xử lý.
 */
export async function reviewBatch(
  batchId: string,
  reviewerId: string,
  action: 'approved' | 'rejected',
  reviewNote?: string
): Promise<AttendanceAdjustment[]> {
  const updated = await query<AttendanceAdjustment>(
    `UPDATE attendance_adjustments
     SET status=$2, reviewed_by=$3, reviewed_at=NOW(), review_note=$4, updated_at=NOW()
     WHERE batch_id=$1 AND status='pending'
     RETURNING *`,
    [batchId, action, reviewerId, reviewNote ?? null]
  );
  if (action === 'approved') {
    for (const adj of updated) await applyApprovedAdjustment(adj);
  }
  return updated;
}

/** Lấy tất cả dòng trong 1 batch (kèm thông tin user) */
export async function getBatchAdjustments(batchId: string): Promise<AttendanceAdjustment[]> {
  return query<AttendanceAdjustment>(
    `SELECT a.*, u.name AS user_name, u.email AS user_email, r.name AS reviewer_name
     FROM attendance_adjustments a
     LEFT JOIN users u ON u.id::text = a.user_id
     LEFT JOIN users r ON r.id::text = a.reviewed_by
     WHERE a.batch_id = $1
     ORDER BY a.work_date ASC`,
    [batchId]
  );
}

// ─── Auto-resolve conflict when real attendance data arrives ─────────

export interface AutoResolveResult {
  /** Các Bù Công bị tự hủy vì đã có dữ liệu thật */
  cancelled: AttendanceAdjustment[];
  /** Các Bù Công được giữ nguyên (chưa đủ dữ liệu thật) */
  kept: AttendanceAdjustment[];
}

/**
 * Khi 1 record chấm công thật được lưu (từ máy ZKTeco hoặc app),
 * kiểm tra xem có Bù Công đang pending cho cùng user + ngày không.
 * Nếu có → tự hủy thông minh theo logic:
 *   - bu_checkin + check_in thật → TỰ HỦY
 *   - bu_checkout + check_out thật → TỰ HỦY
 *   - bu_cong + check_in thật + check_out thật đều có → TỰ HỦY
 *   - bu_cong + chỉ có 1 loại → GIỮ NGUYÊN (còn thiếu)
 *
 * @param userId     ID người dùng
 * @param workDate   Ngày làm việc dạng 'YYYY-MM-DD' (timezone VN)
 * @param newEvent   Loại record vừa được lưu ('check_in' | 'check_out')
 */
export async function autoResolveAdjustments(
  userId: string,
  workDate: string,
  newEvent: 'check_in' | 'check_out'
): Promise<AutoResolveResult> {
  const result: AutoResolveResult = { cancelled: [], kept: [] };

  // Lấy tất cả Bù Công đang pending cho user này vào ngày này
  const pending = await query<AttendanceAdjustment>(
    `SELECT a.*, u.name AS user_name, u.email AS user_email
     FROM attendance_adjustments a
     LEFT JOIN users u ON u.id::text = a.user_id
     WHERE a.user_id = $1
       AND a.work_date = $2::date
       AND a.status = 'pending'`,
    [userId, workDate]
  );

  if (!pending.length) return result;

  // Helper: kiểm tra có bản ghi THẬT cho user + ngày + event_type không.
  // Dùng projection (app + device_punches qua mapping) — không đọc thẳng attendance_records
  // vì dữ liệu máy giờ nằm ở device_punches (Projection Model).
  const labeledForDay = await attendanceService.getLabeledRecordsForDate(userId, workDate);
  const hasRealRecord = (evType: 'check_in' | 'check_out'): boolean =>
    labeledForDay.some((x) => x.label === evType);

  for (const adj of pending) {
    let shouldCancel = false;

    if (adj.adjustment_type === 'bu_checkin' && newEvent === 'check_in') {
      // Dữ liệu check_in thật vừa về → bu_checkin vô nghĩa
      shouldCancel = true;

    } else if (adj.adjustment_type === 'bu_checkout' && newEvent === 'check_out') {
      // Dữ liệu check_out thật vừa về → bu_checkout vô nghĩa
      shouldCancel = true;

    } else if (adj.adjustment_type === 'bu_cong') {
      // bu_cong cần cả 2: chỉ hủy khi CẢ check_in lẫn check_out đều có thật
      const hasIn  = await hasRealRecord('check_in');
      const hasOut = await hasRealRecord('check_out');
      shouldCancel = hasIn && hasOut;
    }

    if (shouldCancel) {
      await execute(
        `UPDATE attendance_adjustments
         SET status      = 'cancelled',
             review_note = $2,
             updated_at  = NOW()
         WHERE id = $1`,
        [
          adj.id,
          'Tự động hủy: dữ liệu chấm công thực đã được ghi nhận từ máy/hệ thống',
        ]
      );

      // Lấy bản ghi sau khi cập nhật để trả về
      const updated = await queryOne<AttendanceAdjustment>(
        `SELECT a.*, u.name AS user_name, u.email AS user_email
         FROM attendance_adjustments a
         LEFT JOIN users u ON u.id::text = a.user_id
         WHERE a.id = $1`,
        [adj.id]
      );
      if (updated) result.cancelled.push(updated);
    } else {
      result.kept.push(adj);
    }
  }

  return result;
}

/** Lấy 1 đề xuất theo ID (dùng để kiểm tra quyền duyệt) */
export async function getAdjustmentById(id: string): Promise<AttendanceAdjustment | null> {
  return queryOne<AttendanceAdjustment>(
    `SELECT a.*,
       u.name AS user_name, u.email AS user_email,
       r.name AS reviewer_name
     FROM attendance_adjustments a
     LEFT JOIN users u ON u.id::text = a.user_id
     LEFT JOIN users r ON r.id::text = a.reviewed_by
     WHERE a.id = $1`,
    [id]
  );
}

/** Hủy đề xuất (chính người nộp) */
export async function cancelAdjustment(id: string, userId: string): Promise<boolean> {
  const n = await execute(
    `UPDATE attendance_adjustments SET status='cancelled', updated_at=NOW()
     WHERE id=$1 AND user_id=$2 AND status='pending'`,
    [id, userId]
  );
  return n > 0;
}

/** Quản lý/Admin hủy bù công đã duyệt — xóa attendance_records đã tạo lúc approve. */
export async function revokeAdjustment(id: string, cancelledBy: string): Promise<boolean> {
  const { withTransaction } = await import('@/lib/db');
  const adj = await getAdjustmentById(id);
  if (!adj || adj.status !== 'approved') return false;

  return withTransaction(async (client) => {
    const r = await client.query(
      `UPDATE attendance_adjustments SET status='cancelled', reviewed_by=$2, updated_at=NOW()
       WHERE id=$1 AND status='approved' RETURNING id`,
      [id, cancelledBy]
    );
    if (!r.rows[0]) return false;

    // Xóa attendance_records đã được tạo khi duyệt
    if (adj.requested_checkin) {
      await client.query(
        `DELETE FROM attendance_records WHERE user_id=$1 AND recorded_at=$2 AND type='app' AND event_type='check_in'`,
        [adj.user_id, adj.requested_checkin]
      );
    }
    if (adj.requested_checkout) {
      await client.query(
        `DELETE FROM attendance_records WHERE user_id=$1 AND recorded_at=$2 AND type='app' AND event_type='check_out'`,
        [adj.user_id, adj.requested_checkout]
      );
    }
    return true;
  });
}
