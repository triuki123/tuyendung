import { query, queryOne, execute, withTransaction } from '@/lib/db';
import { getLeaveTypeById, type LeaveType } from './leaveTypeService';
import { getBalance, addTransaction } from './leaveBalanceService';
import { resolveAttendanceConfigForUser } from './attendanceSettingsService';

export type LeaveMode = 'day' | 'hour';
/** Buổi của đơn nghỉ nửa buổi (null = cả ngày hoặc theo giờ tuỳ ý). */
export type LeaveDayPart = 'morning' | 'afternoon';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/** Số giờ làm việc chuẩn của 1 ngày công (quy đổi nghỉ theo giờ). */
export const HOURS_PER_DAY = 8;

export interface LeaveRequest {
  id: string;
  user_id: string;
  leave_type_id: string;
  mode: LeaveMode;
  day_part: LeaveDayPart | null;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  total_days: number;
  total_hours: number | null;
  reason: string;
  status: LeaveStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  user_name?: string | null;
  user_email?: string | null;
  user_department?: string | null;
  reviewer_name?: string | null;
  type_name?: string | null;
  type_color?: string | null;
  type_paid_by?: string | null;
  type_deducts_balance?: boolean | null;
}

const SELECT_FULL = `
  SELECT r.*,
    u.name AS user_name, u.email AS user_email,
    COALESCE(d.name, dpt.name, u.department) AS user_department,
    cmp.name AS company_name,
    rv.name AS reviewer_name,
    t.name AS type_name, t.color AS type_color,
    t.paid_by AS type_paid_by, t.deducts_balance AS type_deducts_balance
  FROM leave_requests r
  LEFT JOIN users u  ON u.id::text  = r.user_id
  LEFT JOIN departments d ON d.id::text = u.department
  LEFT JOIN departments dpt ON dpt.id::text = u.department_id::text
  LEFT JOIN companies cmp ON cmp.id::text = COALESCE(u.company_id::text, dpt.company_id::text)
  LEFT JOIN users rv ON rv.id::text = r.reviewed_by
  JOIN leave_types t ON t.id = r.leave_type_id`;

/**
 * Tính số ngày công bị trừ cho khoảng nghỉ [startDate..endDate].
 * Tuần làm việc T2–T7: bỏ Chủ Nhật và ngày lễ trong bảng public_holidays.
 */
export async function computeWorkingDays(startDate: string, endDate: string, countSunday = false): Promise<number> {
  const holidays = await query<{ date: string }>(
    `SELECT to_char(date, 'YYYY-MM-DD') AS date FROM public_holidays
     WHERE date BETWEEN $1::date AND $2::date`,
    [startDate, endDate]
  );
  const holidaySet = new Set(holidays.map((h) => h.date));

  let count = 0;
  const cur = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  while (cur <= end) {
    const iso = cur.toISOString().slice(0, 10);
    // countSunday=true (vd Làm theo ca): CN vẫn tính 1 ca làm việc bình thường.
    const skipSunday = !countSunday && cur.getDay() === 0;
    if (!skipSunday && !holidaySet.has(iso)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** Quy đổi nghỉ theo giờ → số ngày công (làm tròn 2 chữ số). */
export function hoursToDays(hours: number): number {
  return Math.round((hours / HOURS_PER_DAY) * 100) / 100;
}

/** Tính số giờ giữa 2 mốc HH:MM trong cùng 1 ngày. */
export function diffHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return Math.round(((eh * 60 + em - sh * 60 - sm) / 60) * 100) / 100;
}

/** Khoảng phút [từ, đến) trong ngày mà 1 đơn CHIẾM CHỖ. Cả ngày = [0, 1440). */
function occupiedMinutes(leave: {
  mode: string; day_part: string | null; start_time: string | null; end_time: string | null;
}): [number, number] {
  const toMin = (t: string | null): number | null => {
    if (!t) return null;
    const [h, m] = t.slice(0, 5).split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };
  if (leave.mode === 'hour') {
    const s = toMin(leave.start_time);
    const e = toMin(leave.end_time);
    if (s != null && e != null && e > s) return [s, e];
    // Nghỉ theo BUỔI không có giờ cụ thể → chia đôi ngày ở 12:00
    if (leave.day_part === 'morning') return [0, 720];
    if (leave.day_part === 'afternoon') return [720, 1440];
  }
  return [0, 1440]; // nghỉ theo ngày (hoặc thiếu dữ liệu) = cả ngày
}

/**
 * Đơn mới có ĐÈ THỜI GIAN lên đơn pending/approved nào khác không.
 * Không chỉ so ngày — CÙNG NGÀY nhưng buổi sáng vs 13:00–17:30 thì KHÔNG trùng.
 * Chỉ khi hai đơn đều gói trong 1 ngày mới so khung giờ; có đơn kéo nhiều ngày → cả ngày.
 */
export async function hasOverlap(
  userId: string,
  req: { startDate: string; endDate: string; mode: string; dayPart?: string | null; startTime?: string | null; endTime?: string | null },
  excludeId?: string
): Promise<boolean> {
  // Ứng viên: các đơn giao NGÀY với đơn mới (lọc thô ở DB, tinh lọc theo giờ ở dưới).
  const candidates = await query<{
    start_date: string; end_date: string; mode: string; day_part: string | null;
    start_time: string | null; end_time: string | null;
  }>(
    `SELECT start_date, end_date, mode, day_part, start_time, end_time
       FROM leave_requests
      WHERE user_id = $1
        AND status IN ('pending','approved')
        AND start_date <= $3::date AND end_date >= $2::date
        AND ($4::text IS NULL OR id <> $4)`,
    [userId, req.startDate, req.endDate, excludeId ?? null]
  );
  if (candidates.length === 0) return false;

  const newSingleDay = req.startDate === req.endDate;
  const newInterval = occupiedMinutes({ mode: req.mode, day_part: req.dayPart ?? null, start_time: req.startTime ?? null, end_time: req.endTime ?? null });

  for (const c of candidates) {
    const cStart = String(c.start_date).slice(0, 10);
    const cEnd = String(c.end_date).slice(0, 10);
    const cSingleDay = cStart === cEnd;

    // Một trong hai kéo NHIỀU NGÀY → mọi ngày chung đều bị chiếm cả ngày ⇒ trùng.
    if (!newSingleDay || !cSingleDay) return true;
    // Hai đơn 1-ngày nhưng khác ngày → không trùng (SQL đã lọc nên hiếm khi xảy ra).
    if (cStart !== req.startDate) continue;

    // Cùng 1 ngày: so KHUNG GIỜ thực tế.
    const cInterval = occupiedMinutes(c);
    if (newInterval[0] < cInterval[1] && cInterval[0] < newInterval[1]) return true;
  }
  return false;
}

/** Đơn nghỉ của 1 user (lọc theo năm). */
export async function getUserLeaves(userId: string, year?: number): Promise<LeaveRequest[]> {
  const conditions = ['r.user_id = $1'];
  const params: unknown[] = [userId];
  if (year) {
    conditions.push(`EXTRACT(YEAR FROM r.start_date) = $2`);
    params.push(year);
  }
  return query<LeaveRequest>(
    `${SELECT_FULL} WHERE ${conditions.join(' AND ')}
     ORDER BY r.start_date DESC, r.created_at DESC`,
    params
  );
}

/** Đơn nghỉ của nhân viên trực thuộc (cho Quản Lý Trực Tiếp duyệt). */
/**
 * Đơn nghỉ của ĐỘI quản lý: toàn bộ cấp dưới (đệ quy) của manager.
 * Đa Công Ty: nếu truyền companyId → chỉ trong công ty đang làm việc.
 */
export async function getTeamLeaves(
  managerId: string,
  filters?: { status?: LeaveStatus; year?: number; companyId?: string | null }
): Promise<LeaveRequest[]> {
  // Cấp dưới (đệ quy) ∪ nhân sự được ỦY QUYỀN duyệt cho người này (vượt cây sơ đồ).
  const { getOrgSubtreeUserIds } = await import('@/lib/services/attendanceService');
  const { getDelegatedTargetIds } = await import('@/lib/services/leaveDelegationService');
  const [subtree, delegated] = await Promise.all([
    getOrgSubtreeUserIds(managerId, filters?.companyId ?? null),
    getDelegatedTargetIds(managerId),
  ]);
  const scopeIds = [...new Set([...subtree, ...delegated])];
  if (scopeIds.length === 0) return [];

  const conditions = ['r.user_id::text = ANY($1::text[])'];
  const params: unknown[] = [scopeIds];
  let i = 2;
  if (filters?.status) { conditions.push(`r.status = $${i++}`); params.push(filters.status); }
  if (filters?.year)   { conditions.push(`EXTRACT(YEAR FROM r.start_date) = $${i++}`); params.push(filters.year); }

  return query<LeaveRequest>(
    `${SELECT_FULL} WHERE ${conditions.join(' AND ')}
     ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,
       r.start_date DESC, r.created_at DESC`,
    params
  );
}

/**
 * Đơn nghỉ của CẤP DƯỚI TRỰC TIẾP — đích danh người này là quản lý trực tiếp phải duyệt.
 * Dùng cho thẻ "Cần Tôi Xử Lý" (chống nhũng nhiễu): chỉ depth-1 qua org_assignments.manager_id.
 * Khác getTeamLeaves (toàn cây con — dùng cho lăng kính "Đội Ngũ Của Tôi").
 * Trả thêm company_id để tô màu/nhóm theo công ty (leave_requests không có cột này).
 */
export async function getDirectReportLeaves(
  managerId: string,
  filters?: { status?: LeaveStatus }
): Promise<Array<LeaveRequest & { company_id: string | null; company_name: string | null; user_name: string | null; type_name: string | null }>> {
  // Cấp dưới trực tiếp theo cây (org_assignments.manager_id) HOẶC nhân sự được ỦY QUYỀN
  // duyệt phép cho người này (leave_approver_delegations) — vượt cây sơ đồ.
  const conditions = [
    `(r.user_id::text IN (
        SELECT oa.user_id::text FROM org_assignments oa
         WHERE oa.manager_id::text = $1 AND oa.is_active)
      OR r.user_id::text IN (
        SELECT d.target_user_id::text FROM leave_approver_delegations d
         WHERE d.approver_user_id::text = $1 AND d.is_active))`,
  ];
  const params: unknown[] = [managerId.toLowerCase()];
  let i = 2;
  if (filters?.status) { conditions.push(`r.status = $${i++}`); params.push(filters.status); }

  return query<LeaveRequest & { company_id: string | null; company_name: string | null; user_name: string | null; type_name: string | null }>(
    `SELECT r.*,
            u.name AS user_name,
            COALESCE(u.company_id::text, dpt.company_id::text) AS company_id,
            cmp.name AS company_name,
            t.name AS type_name, t.color AS type_color
       FROM leave_requests r
       LEFT JOIN users u ON u.id::text = r.user_id
       LEFT JOIN departments dpt ON dpt.id::text = u.department_id::text
       LEFT JOIN companies cmp ON cmp.id::text = COALESCE(u.company_id::text, dpt.company_id::text)
       JOIN leave_types t ON t.id = r.leave_type_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.start_date DESC, r.created_at DESC`,
    params
  );
}

/**
 * Tất cả đơn nghỉ (cho Admin/Super Admin).
 * Đa Công Ty: nếu truyền companyId → chỉ đơn của thành viên công ty đó
 * (primary company_id = X HOẶC có membership active ở X). companyId rỗng = toàn hệ thống.
 */
export async function getAllLeaves(filters?: {
  status?: LeaveStatus;
  year?: number;
  companyId?: string | null;
}): Promise<LeaveRequest[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (filters?.companyId) {
    const { getCompanyMemberUserIds } = await import('@/lib/services/userCompanyService');
    const memberIds = await getCompanyMemberUserIds(filters.companyId);
    if (memberIds.length === 0) return [];
    conditions.push(`r.user_id::text = ANY($${i++}::text[])`);
    params.push(memberIds);
  }
  if (filters?.status) { conditions.push(`r.status = $${i++}`); params.push(filters.status); }
  if (filters?.year)   { conditions.push(`EXTRACT(YEAR FROM r.start_date) = $${i++}`); params.push(filters.year); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return query<LeaveRequest>(
    `${SELECT_FULL} ${where}
     ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,
       r.start_date DESC, r.created_at DESC`,
    params
  );
}

/** Lấy 1 đơn theo ID (kèm thông tin join, dùng để check quyền duyệt). */
export async function getLeaveById(id: string): Promise<LeaveRequest | null> {
  return queryOne<LeaveRequest>(`${SELECT_FULL} WHERE r.id = $1`, [id]);
}

export interface CreateLeaveResult {
  ok: boolean;
  error?: string;
  data?: LeaveRequest;
}

/**
 * Tạo đơn nghỉ phép. Tự tính total_days theo mode:
 * - day: số ngày làm việc trong khoảng (bỏ CN + lễ)
 * - hour: số giờ / 8, trong đúng 1 ngày
 * Kiểm tra: loại phép hợp lệ, không đè đơn khác, đủ số dư nếu loại trừ quỹ,
 * không vượt giới hạn luật (max_days).
 */
export async function createLeave(data: {
  user_id: string;
  leave_type_id: string;
  mode: LeaveMode;
  day_part?: LeaveDayPart | null;
  start_date: string;
  end_date: string;
  start_time?: string;
  end_time?: string;
  reason: string;
}): Promise<CreateLeaveResult> {
  let ltype = await getLeaveTypeById(data.leave_type_id);
  if (!ltype || !ltype.active) return { ok: false, error: 'Loại phép không hợp lệ' };

  // Phép năm dùng chung chính sách được phiên bản hóa trong Quy tắc chấm công.
  // Ghi đè các cờ trên loại phép hệ thống để cả form và API cùng tuân theo cấu hình đang hiệu lực.
  if (ltype.code === 'annual') {
    const attendance = await resolveAttendanceConfigForUser(data.user_id, data.start_date);
    const annual = attendance.annualLeavePolicy;
    if (!annual.enabled) return { ok: false, error: 'Chính sách phép năm hiện chưa được áp dụng' };
    ltype = {
      ...ltype,
      allow_hourly: annual.allowHourly,
      allow_half_day: annual.allowHalfDay,
      count_sunday: annual.countSunday,
    };
  }

  const dayPart = data.mode === 'hour' ? (data.day_part ?? null) : null;
  let totalDays = 0;
  let totalHours: number | null = null;

  if (data.mode === 'hour') {
    // Nghỉ theo BUỔI (có day_part) gate bằng allow_half_day; nghỉ theo GIỜ tự do gate bằng allow_hourly.
    if (dayPart) {
      if (!ltype.allow_half_day) return { ok: false, error: `Loại phép "${ltype.name}" không cho nghỉ theo buổi` };
    } else if (!ltype.allow_hourly) {
      return { ok: false, error: `Loại phép "${ltype.name}" không cho nghỉ theo giờ` };
    }
    if (!data.start_time || !data.end_time) return { ok: false, error: 'Thiếu giờ bắt đầu / kết thúc' };
    if (data.start_date !== data.end_date) return { ok: false, error: 'Nghỉ theo giờ chỉ trong 1 ngày' };
    totalHours = diffHours(data.start_time, data.end_time);
    if (totalHours <= 0) return { ok: false, error: 'Giờ kết thúc phải sau giờ bắt đầu' };
    if (totalHours >= HOURS_PER_DAY) return { ok: false, error: 'Nghỉ từ 8 giờ trở lên — hãy chọn nghỉ theo ngày' };
    // Nghỉ NỬA BUỔI (chọn sáng/chiều): nếu công ty cấu hình giá trị cố định → trừ quỹ = giá trị đó,
    // bất kể giờ thực (vd 2 buổi lệch 3.5h/4.5h vẫn tính 0.5). Ngược lại theo giờ (giờ ÷ 8).
    if (dayPart) {
      const cfg = await resolveAttendanceConfigForUser(data.user_id, data.start_date);
      totalDays = cfg.halfDayLeaveValue != null ? Number(cfg.halfDayLeaveValue) : hoursToDays(totalHours);
    } else {
      totalDays = hoursToDays(totalHours);
    }
  } else {
    if (data.end_date < data.start_date) return { ok: false, error: 'Ngày kết thúc phải sau ngày bắt đầu' };
    totalDays = await computeWorkingDays(data.start_date, data.end_date, !!(ltype as any).count_sunday);
    if (totalDays <= 0) return { ok: false, error: 'Khoảng nghỉ không có ngày làm việc nào (rơi vào CN/lễ)' };
  }

  // Đè lên đơn khác? (so cả ngày LẪN khung giờ — sáng vs chiều không tính trùng)
  if (await hasOverlap(data.user_id, {
    startDate: data.start_date, endDate: data.end_date,
    mode: data.mode, dayPart, startTime: data.start_time ?? null, endTime: data.end_time ?? null,
  })) {
    return { ok: false, error: 'Bạn đã có đơn nghỉ khác trùng khoảng thời gian này' };
  }

  // Giới hạn theo luật (per_year tính cả đơn pending để tránh lách)
  if (ltype.max_days != null) {
    if (ltype.max_days_scope === 'per_occurrence') {
      if (totalDays > Number(ltype.max_days)) {
        return { ok: false, error: `Loại phép "${ltype.name}" tối đa ${ltype.max_days} ngày/lần` };
      }
    } else {
      const year = Number(data.start_date.slice(0, 4));
      const usedRow = await queryOne<{ total: string }>(
        `SELECT COALESCE(SUM(total_days), 0) AS total FROM leave_requests
         WHERE user_id = $1 AND leave_type_id = $2
           AND status IN ('pending','approved')
           AND EXTRACT(YEAR FROM start_date) = $3`,
        [data.user_id, data.leave_type_id, year]
      );
      if (Number(usedRow?.total ?? 0) + totalDays > Number(ltype.max_days)) {
        return { ok: false, error: `Loại phép "${ltype.name}" tối đa ${ltype.max_days} ngày/năm — bạn đã dùng/đang chờ ${usedRow?.total ?? 0} ngày` };
      }
    }
  }

  // Đủ số dư phép năm? (tính cả phần đang chờ duyệt)
  if (ltype.deducts_balance) {
    const year = Number(data.start_date.slice(0, 4));
    const balance = await getBalance(data.user_id, year);
    const pendingRow = await queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(r.total_days), 0) AS total
       FROM leave_requests r
       JOIN leave_types t ON t.id = r.leave_type_id
       WHERE r.user_id = $1 AND r.status = 'pending' AND t.deducts_balance = true
         AND EXTRACT(YEAR FROM r.start_date) = $2`,
      [data.user_id, year]
    );
    const available = balance - Number(pendingRow?.total ?? 0);
    if (totalDays > available) {
      return {
        ok: false,
        error: `Không đủ phép năm: còn ${available.toFixed(1)} ngày khả dụng (số dư ${balance.toFixed(1)} trừ phần đang chờ duyệt), đơn cần ${totalDays}`,
      };
    }
  }

  const created = await queryOne<LeaveRequest>(
    `INSERT INTO leave_requests
       (user_id, leave_type_id, mode, day_part, start_date, end_date, start_time, end_time, total_days, total_hours, reason)
     VALUES ($1,$2,$3,$4,$5::date,$6::date,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      data.user_id,
      data.leave_type_id,
      data.mode,
      dayPart,
      data.start_date,
      data.end_date,
      data.start_time ?? null,
      data.end_time ?? null,
      totalDays,
      totalHours,
      data.reason,
    ]
  );
  const full = created ? await getLeaveById(created.id) : null;
  return { ok: true, data: full ?? (created as LeaveRequest) };
}

/**
 * Duyệt / từ chối đơn. Khi approve đơn loại trừ quỹ → ghi giao dịch 'usage' (âm)
 * vào sổ quỹ trong cùng transaction.
 */
export async function reviewLeave(
  id: string,
  reviewerId: string,
  action: 'approved' | 'rejected',
  reviewNote?: string
): Promise<LeaveRequest | null> {
  return withTransaction(async (client) => {
    const r = await client.query(
      `UPDATE leave_requests
       SET status=$2, reviewed_by=$3, reviewed_at=NOW(), review_note=$4, updated_at=NOW()
       WHERE id=$1 AND status='pending'
       RETURNING *`,
      [id, action, reviewerId, reviewNote ?? null]
    );
    const updated = r.rows[0] as LeaveRequest | undefined;
    if (!updated) return null;

    if (action === 'approved') {
      const t = await client.query(`SELECT deducts_balance, name FROM leave_types WHERE id = $1`, [
        updated.leave_type_id,
      ]);
      const ltype = t.rows[0] as Pick<LeaveType, 'deducts_balance' | 'name'> | undefined;
      if (ltype?.deducts_balance) {
        const year = Number(
          new Date(updated.start_date).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 4)
        );
        await addTransaction(
          {
            user_id: updated.user_id,
            year,
            amount: -Number(updated.total_days),
            source: 'usage',
            request_id: updated.id,
            note: `Nghỉ ${ltype.name} ${String(updated.start_date).slice(0, 10)} → ${String(updated.end_date).slice(0, 10)}`,
            created_by: reviewerId,
          },
          client
        );
      }
    }
    return updated;
  }).then((u) => (u ? getLeaveById(u.id) : null));
}

/**
 * Hủy đơn. Người nộp hủy được đơn pending; đơn approved chưa tới ngày nghỉ
 * cũng hủy được → tự hoàn quỹ bằng giao dịch 'usage_revert'.
 */
export async function cancelLeave(
  id: string,
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  const leave = await getLeaveById(id);
  if (!leave || leave.user_id !== userId) return { ok: false, error: 'Không tìm thấy đơn' };

  if (leave.status === 'pending') {
    await execute(
      `UPDATE leave_requests SET status='cancelled', updated_at=NOW() WHERE id=$1 AND status='pending'`,
      [id]
    );
    return { ok: true };
  }

  if (leave.status === 'approved') {
    const todayVN = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    if (String(leave.start_date).slice(0, 10) <= todayVN) {
      return { ok: false, error: 'Đơn đã tới ngày nghỉ — liên hệ HCNS để điều chỉnh' };
    }
    return withTransaction(async (client) => {
      const r = await client.query(
        `UPDATE leave_requests SET status='cancelled', updated_at=NOW()
         WHERE id=$1 AND status='approved' RETURNING *`,
        [id]
      );
      if (!r.rows[0]) return { ok: false, error: 'Đơn đã thay đổi trạng thái' };
      if (leave.type_deducts_balance) {
        const year = Number(String(leave.start_date).slice(0, 4));
        await addTransaction(
          {
            user_id: leave.user_id,
            year,
            amount: Number(leave.total_days),
            source: 'usage_revert',
            request_id: leave.id,
            note: 'Hoàn quỹ do hủy đơn đã duyệt (trước ngày nghỉ)',
            created_by: userId,
          },
          client
        );
      }
      return { ok: true };
    });
  }

  return { ok: false, error: 'Đơn không ở trạng thái hủy được' };
}

/** Quản lý/Admin hủy đơn đã duyệt — hoàn quỹ nếu cần. */
export async function revokeLeave(
  id: string,
  cancelledBy: string
): Promise<{ ok: boolean; error?: string }> {
  const leave = await getLeaveById(id);
  if (!leave) return { ok: false, error: 'Không tìm thấy đơn' };
  if (leave.status !== 'approved') return { ok: false, error: 'Chỉ hủy được đơn đã duyệt' };

  return withTransaction(async (client) => {
    const r = await client.query(
      `UPDATE leave_requests SET status='cancelled', updated_at=NOW()
       WHERE id=$1 AND status='approved' RETURNING *`,
      [id]
    );
    if (!r.rows[0]) return { ok: false, error: 'Đơn đã thay đổi trạng thái' };
    if (leave.type_deducts_balance) {
      const year = Number(
        new Date(leave.start_date).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 4)
      );
      await addTransaction(
        {
          user_id: leave.user_id,
          year,
          amount: Number(leave.total_days),
          source: 'usage_revert',
          request_id: leave.id,
          note: 'Hoàn quỹ do quản lý hủy đơn đã duyệt',
          created_by: cancelledBy,
        },
        client
      );
    }
    return { ok: true };
  });
}
