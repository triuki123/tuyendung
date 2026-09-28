/**
 * attendanceDiligenceService.ts — Theo Dõi Chuyên Cần.
 *
 * Tổng hợp chỉ số chuyên cần của từng nhân sự trong một KHOẢNG NGÀY tuỳ ý
 * (kỳ công, tháng, quý, năm, hoặc từ ngày → đến ngày):
 *   - Ngày công chuẩn / ngày có chấm công / ngày đủ giờ công
 *   - Đúng giờ, đi trễ (số lần + tổng phút), về sớm, đi sớm, ở lại trễ
 *   - Quên chấm công (thiếu vào hoặc ra), vắng không phép
 *   - Nghỉ phép theo từng loại phép (approved)
 *   - Tăng ca, bù công đã duyệt
 *   - Điểm chuyên cần 0–100 + xếp loại A+/A/B/C/D
 *
 * Ngưỡng trễ/sớm đọc từ cấu hình ca chuẩn `cfg.workShift` (per-company,
 * resolve qua attendanceSettingsService — KHÔNG hardcode).
 */

import { query } from '../db';
import {
  ResolvedAttendanceConfig,
  DEFAULT_ATTENDANCE_CONFIG,
  getShiftForDow,
  lunchRangeMinutes,
} from '../config/attendanceConfig';
import {
  AttendanceRecord,
  classifyDayRecords,
  getVNMinutes,
} from './attendanceService';
import { resolveAttendanceConfig } from './attendanceSettingsService';

// ─── Kiểu dữ liệu ─────────────────────────────────────────────────────────────

export interface LeaveByType {
  code: string;
  name: string;
  days: number;
  hours: number;
  count: number;
}

export interface DiligenceMetrics {
  /** Ngày làm việc chuẩn trong khoảng (trừ ngày nghỉ tuần, chỉ tính tới hôm nay). */
  workDays: number;
  /** Ngày có ít nhất 1 lượt chấm công. */
  presentDays: number;
  /** Ngày đủ giờ công (>= fullWorkdayMinutes). */
  fullDays: number;
  /** Ngày vào đúng giờ (trong dung sai). */
  onTimeDays: number;
  lateDays: number;
  lateMinutesTotal: number;
  earlyLeaveDays: number;
  earlyLeaveMinutesTotal: number;
  /** Ngày đến SỚM hơn giờ vào chuẩn. */
  earlyArriveDays: number;
  /** Ngày ở lại muộn hơn giờ ra chuẩn. */
  stayLateDays: number;
  /** Ngày chỉ có 1 chiều chấm (quên vào hoặc quên ra). */
  missingPunchDays: number;
  /** Ngày công chuẩn không chấm công và không có phép được duyệt. */
  absentDays: number;
  /** Tổng ngày nghỉ phép được duyệt (mode day) rơi vào ngày công chuẩn. */
  leaveDays: number;
  leaveByType: LeaveByType[];
  overtimeCount: number;
  overtimeHours: number;
  adjustmentCount: number;
  /** Tổng phút làm việc thực tế trong khoảng. */
  totalMinutes: number;
  /** Giờ vào / ra trung bình HH:MM (null nếu không có dữ liệu). */
  avgCheckIn: string | null;
  avgCheckOut: string | null;
  /** % ngày đúng giờ trên ngày có chấm công (0–100). */
  onTimeRate: number;
  /** % ngày hiện diện (có chấm hoặc có phép) trên ngày công chuẩn (0–100). */
  attendanceRate: number;
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D';
}

export interface DiligenceUserRow {
  user_id: string;
  name: string;
  email: string;
  employee_code: string | null;
  role: string;
  company_id: string | null;
  company_name: string | null;
  department_id: string | null;
  department_name: string | null;
  sub_department_name: string | null;
  metrics: DiligenceMetrics;
}

interface UserInfoRow {
  id: string;
  name: string;
  email: string;
  employee_code: string | null;
  role: string;
  company_id: string | null;
  company_name: string | null;
  department_id: string | null;
  department_name: string | null;
  sub_department_name: string | null;
}

interface LeaveRow {
  user_id: string;
  mode: string;
  start_date: string;
  end_date: string;
  total_days: number | null;
  total_hours: number | null;
  type_code: string;
  type_name: string;
}

interface OvertimeRow { user_id: string; evening_hours: number | null; night_hours: number | null }
interface AdjustmentRow { user_id: string; cnt: number }

// ─── Helpers nội bộ ───────────────────────────────────────────────────────────

function fmtHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = Math.round(totalMinutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Danh sách ngày YYYY-MM-DD trong [from, to] (chuỗi, không lệch timezone). */
function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const d = new Date(fy, fm - 1, fd);
  const end = new Date(ty, tm - 1, td);
  while (d <= end) {
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    );
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Điểm chuyên cần 0–100 từ các chỉ số vi phạm. */
function calcScore(m: Pick<DiligenceMetrics, 'lateDays' | 'earlyLeaveDays' | 'missingPunchDays' | 'absentDays'>): number {
  let s = 100;
  s -= Math.min(30, m.lateDays * 2);
  s -= Math.min(20, m.earlyLeaveDays * 2);
  s -= Math.min(10, m.missingPunchDays * 1);
  s -= Math.min(40, m.absentDays * 5);
  return Math.max(0, Math.round(s));
}

function gradeOf(score: number): DiligenceMetrics['grade'] {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 65) return 'C';
  return 'D';
}

// ─── Truy vấn dữ liệu thô (bulk, theo danh sách user) ────────────────────────

async function fetchUsersInfo(ids: string[]): Promise<UserInfoRow[]> {
  return query<UserInfoRow>(
    `SELECT u.id, u.name, u.email, u.employee_code, u.role,
            u.company_id::text AS company_id,
            comp.name AS company_name,
            u.department_id::text AS department_id,
            d.name  AS department_name,
            sd.name AS sub_department_name
       FROM users u
       LEFT JOIN departments d      ON d.id::text  = u.department_id::text
       LEFT JOIN sub_departments sd ON sd.id::text = u.sub_department_id::text
       LEFT JOIN companies comp     ON comp.id::text = COALESCE(u.company_id::text, d.company_id::text)
      WHERE LOWER(u.id::text) = ANY($1::text[])
        AND u.diligence_enabled = true
        -- "Mặc Định Đủ Công" (mig 306): không điểm danh nên mọi chỉ số chuyên cần đều
        -- vô nghĩa (sẽ hiện vắng mặt 100%) → loại khỏi bảng chuyên cần.
        AND COALESCE(u.default_full_attendance, false) = false
      ORDER BY u.name ASC`,
    [ids]
  );
}

/** Records app + máy (chiếu qua mapping sống) của NHIỀU user trong khoảng ngày VN. */
async function fetchRecordsInRange(ids: string[], from: string, to: string): Promise<AttendanceRecord[]> {
  return query<AttendanceRecord>(
    `SELECT id, user_id::text AS user_id, type, event_type, recorded_at, lat, lng,
            photo_mime, notes, machine_id, created_at
       FROM attendance_records
      WHERE LOWER(user_id::text) = ANY($1::text[])
        AND type = 'app'
        AND DATE(recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh') BETWEEN $2::date AND $3::date
     UNION ALL
     SELECT dp.id, m.user_id::text AS user_id, 'machine' AS type, 'check_in' AS event_type,
            dp.punch_time AS recorded_at, NULL::numeric AS lat, NULL::numeric AS lng,
            NULL AS photo_mime, NULL AS notes, dp.machine_id, dp.created_at
       FROM device_punches dp
       JOIN attendance_machine_mappings m
         ON m.machine_id = dp.machine_id AND m.employee_code = dp.employee_code
        AND dp.punch_time >= m.effective_from
        AND (m.effective_to IS NULL OR dp.punch_time < m.effective_to)
      WHERE LOWER(m.user_id::text) = ANY($1::text[])
        AND DATE(dp.punch_time AT TIME ZONE 'Asia/Ho_Chi_Minh') BETWEEN $2::date AND $3::date
     ORDER BY recorded_at ASC`,
    [ids, from, to]
  );
}

async function fetchApprovedLeaves(ids: string[], from: string, to: string): Promise<LeaveRow[]> {
  return query<LeaveRow>(
    `SELECT lr.user_id::text AS user_id, lr.mode,
            lr.start_date::text AS start_date, lr.end_date::text AS end_date,
            lr.total_days, lr.total_hours,
            lt.code AS type_code, lt.name AS type_name
       FROM leave_requests lr
       JOIN leave_types lt ON lt.id = lr.leave_type_id
      WHERE LOWER(lr.user_id::text) = ANY($1::text[])
        AND lr.status = 'approved'
        AND lr.start_date <= $3::date
        AND lr.end_date   >= $2::date`,
    [ids, from, to]
  );
}

async function fetchApprovedOvertime(ids: string[], from: string, to: string): Promise<OvertimeRow[]> {
  return query<OvertimeRow>(
    `SELECT user_id::text AS user_id, evening_hours, night_hours
       FROM attendance_overtime
      WHERE LOWER(user_id::text) = ANY($1::text[])
        AND status = 'approved'
        AND work_date BETWEEN $2::date AND $3::date`,
    [ids, from, to]
  );
}

async function fetchApprovedAdjustments(ids: string[], from: string, to: string): Promise<AdjustmentRow[]> {
  return query<AdjustmentRow>(
    `SELECT user_id::text AS user_id, COUNT(*)::int AS cnt
       FROM attendance_adjustments
      WHERE LOWER(user_id::text) = ANY($1::text[])
        AND status = 'approved'
        AND work_date BETWEEN $2::date AND $3::date
      GROUP BY user_id`,
    [ids, from, to]
  );
}

// ─── Nhật ký theo ngày (tab Chi tiết ngày) ────────────────────────────────────

export interface DiligenceDayEvent {
  date: string; // YYYY-MM-DD
  kind: 'late' | 'early_leave' | 'missing_punch' | 'absent' | 'leave';
  /** Số phút trễ / về sớm (kind late/early_leave). */
  minutes?: number;
  /** Giờ vào/ra thực tế HH:MM của ngày đó (nếu có). */
  checkIn?: string | null;
  checkOut?: string | null;
  /** kind='leave': tên loại phép + chế độ. */
  leaveTypeName?: string;
  leaveMode?: 'day' | 'hour';
  /** kind='missing_punch': thiếu chiều nào. */
  missingSide?: 'in' | 'out';
}

/**
 * Nhật ký sự kiện chuyên cần THEO TỪNG NGÀY của 1 user trong [from, to]
 * (đi trễ ngày nào — trễ bao nhiêu phút, về sớm, vắng, quên chấm, nghỉ phép loại gì).
 * Cùng quy tắc phân loại với getDiligenceReport. Sắp xếp ngày mới nhất trước.
 */
export async function getDiligenceDayEvents(
  userId: string,
  from: string,
  to: string
): Promise<DiligenceDayEvent[]> {
  const id = userId.toLowerCase();
  const [userRows, records, leaves] = await Promise.all([
    query<{ company_id: string | null }>(
      // Chỉ trả nhật ký cho người ĐƯỢC BẬT Theo Dõi Chuyên Cần (đồng bộ với báo cáo tổng).
      `SELECT company_id::text AS company_id FROM users
        WHERE LOWER(id::text) = $1 AND diligence_enabled = true`,
      [id]
    ),
    fetchRecordsInRange([id], from, to),
    fetchApprovedLeaves([id], from, to),
  ]);
  if (userRows.length === 0) return [];

  let cfg: ResolvedAttendanceConfig;
  try {
    cfg = await resolveAttendanceConfig(userRows[0].company_id, from);
  } catch {
    cfg = DEFAULT_ATTENDANCE_CONFIG;
  }
  const ws = cfg.workShift; // dung sai đi trễ / về sớm (chung cho mọi ngày)

  // Ngày → đơn phép phủ ngày đó
  const leaveOnDate = new Map<string, { name: string; mode: 'day' | 'hour' }[]>();
  for (const l of leaves) {
    for (const ds of eachDate(l.start_date, l.end_date)) {
      if (!leaveOnDate.has(ds)) leaveOnDate.set(ds, []);
      leaveOnDate.get(ds)!.push({ name: l.type_name, mode: l.mode === 'hour' ? 'hour' : 'day' });
    }
  }

  const todayVN = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const events: DiligenceDayEvent[] = [];

  // Duyệt TOÀN kỳ (kể cả ngày tương lai) để hiện nghỉ phép đã duyệt trong tương lai
  // — khớp với tổng "Nghỉ phép theo loại". Chỉ phân tích vắng/trễ/quên chấm cho
  // ngày đã qua (< hôm nay); ngày tương lai chỉ hiện nghỉ phép, không tính vắng.
  for (const dateStr of to >= from ? eachDate(from, to) : []) {
    const [y, mo, dd] = dateStr.split('-').map(Number);
    const dow = new Date(y, mo - 1, dd).getDay();
    const shift = getShiftForDow(dow, cfg);          // giờ ca của CHÍNH ngày đó (null = nghỉ)
    const isWorkday = shift !== null;

    const dayRecs = records.filter(
      (r) => new Date(r.recorded_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) === dateStr
    );
    const labeled = classifyDayRecords(dayRecs, cfg);
    const ins = labeled.filter((x) => x.label === 'check_in');
    const outs = labeled.filter((x) => x.label === 'check_out');
    const checkIn = ins[0]?.record ?? null;
    const checkOut = outs.length ? outs[outs.length - 1].record : null;

    const inMin = checkIn ? getVNMinutes(checkIn.recorded_at) : null;
    let outMin = checkOut ? getVNMinutes(checkOut.recorded_at) : null;
    if (outMin != null && outMin < 4 * 60) outMin += 24 * 60; // checkout sau nửa đêm
    const inHHMM = inMin != null ? fmtHHMM(inMin) : null;
    const outHHMM = outMin != null ? fmtHHMM(outMin) : null;

    // Nghỉ phép (kể cả ngày cuối tuần có đơn — hiển thị để đối chiếu)
    for (const lv of leaveOnDate.get(dateStr) ?? []) {
      events.push({ date: dateStr, kind: 'leave', leaveTypeName: lv.name, leaveMode: lv.mode, checkIn: inHHMM, checkOut: outHHMM });
    }

    if (!checkIn && !checkOut) {
      const hasLeave = (leaveOnDate.get(dateStr) ?? []).length > 0;
      // Chỉ tính VẮNG cho ngày đã QUA (hôm nay chưa hết, tương lai chưa tới).
      if (isWorkday && !hasLeave && dateStr < todayVN) {
        events.push({ date: dateStr, kind: 'absent' });
      }
      continue;
    }

    if (checkIn && !checkOut && dateStr !== todayVN) {
      events.push({ date: dateStr, kind: 'missing_punch', missingSide: 'out', checkIn: inHHMM, checkOut: null });
    } else if (!checkIn && checkOut) {
      events.push({ date: dateStr, kind: 'missing_punch', missingSide: 'in', checkIn: null, checkOut: outHHMM });
    }

    if (shift && inMin != null && inMin > shift.startMin + ws.lateGraceMinutes) {
      events.push({ date: dateStr, kind: 'late', minutes: inMin - shift.startMin, checkIn: inHHMM, checkOut: outHHMM });
    }
    if (shift && outMin != null && dateStr !== todayVN && outMin < shift.endMin - ws.earlyLeaveGraceMinutes) {
      events.push({ date: dateStr, kind: 'early_leave', minutes: shift.endMin - outMin, checkIn: inHHMM, checkOut: outHHMM });
    }
  }

  events.sort((a, b) => b.date.localeCompare(a.date));
  return events;
}

/** Toàn bộ user active trong hệ thống (dành cho super_admin). */
export async function getAllActiveUserIds(): Promise<string[]> {
  const rows = await query<{ id: string }>(`SELECT id FROM users WHERE status = 'active'`);
  return rows.map((r) => r.id);
}

// ─── Tính toán chính ──────────────────────────────────────────────────────────

/**
 * Báo cáo chuyên cần cho danh sách user trong khoảng [from, to] (YYYY-MM-DD, giờ VN).
 * Cấu hình ca/ngày nghỉ resolve THEO CÔNG TY của từng user (neo giữa khoảng).
 */
export async function getDiligenceReport(
  userIds: string[],
  from: string,
  to: string
): Promise<DiligenceUserRow[]> {
  if (userIds.length === 0) return [];
  const ids = [...new Set(userIds.map((x) => x.toLowerCase()))];

  const [users, records, leaves, overtimes, adjustments] = await Promise.all([
    fetchUsersInfo(ids),
    fetchRecordsInRange(ids, from, to),
    fetchApprovedLeaves(ids, from, to),
    fetchApprovedOvertime(ids, from, to),
    fetchApprovedAdjustments(ids, from, to),
  ]);

  // Config per-company (cache theo companyId), neo giữa khoảng để lấy bản hiệu lực.
  const anchor = from; // đầu khoảng — đủ ổn định cho báo cáo
  const cfgCache = new Map<string, ResolvedAttendanceConfig>();
  async function cfgFor(companyId: string | null): Promise<ResolvedAttendanceConfig> {
    const key = companyId ?? '__default__';
    if (!cfgCache.has(key)) {
      try {
        cfgCache.set(key, await resolveAttendanceConfig(companyId, anchor));
      } catch {
        cfgCache.set(key, DEFAULT_ATTENDANCE_CONFIG);
      }
    }
    return cfgCache.get(key)!;
  }

  // Gom dữ liệu thô theo user
  const recsByUser = new Map<string, AttendanceRecord[]>();
  for (const r of records) {
    const k = r.user_id.toLowerCase();
    if (!recsByUser.has(k)) recsByUser.set(k, []);
    recsByUser.get(k)!.push(r);
  }
  const leavesByUser = new Map<string, LeaveRow[]>();
  for (const l of leaves) {
    const k = l.user_id.toLowerCase();
    if (!leavesByUser.has(k)) leavesByUser.set(k, []);
    leavesByUser.get(k)!.push(l);
  }
  const otByUser = new Map<string, OvertimeRow[]>();
  for (const o of overtimes) {
    const k = o.user_id.toLowerCase();
    if (!otByUser.has(k)) otByUser.set(k, []);
    otByUser.get(k)!.push(o);
  }
  const adjByUser = new Map<string, number>();
  for (const a of adjustments) adjByUser.set(a.user_id.toLowerCase(), a.cnt);

  // Chỉ tính tới HÔM NAY (giờ VN) — ngày tương lai không phải "vắng".
  const todayVN = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const effectiveTo = to <= todayVN ? to : todayVN;
  const allDates = effectiveTo >= from ? eachDate(from, effectiveTo) : [];

  const result: DiligenceUserRow[] = [];

  for (const u of users) {
    const k = u.id.toLowerCase();
    const cfg = await cfgFor(u.company_id);
    const ws = cfg.workShift; // dung sai đi trễ / về sớm (chung cho mọi ngày)
    const lunch = lunchRangeMinutes(cfg);

    // Map ngày → tập ngày nghỉ phép (mode day) + tổng hợp theo loại
    const leaveDates = new Set<string>();
    const hourLeaveDates = new Set<string>(); // nghỉ theo giờ — có "lý do" nhưng vẫn đi làm
    const byType = new Map<string, LeaveByType>();
    for (const l of leavesByUser.get(k) ?? []) {
      const entry = byType.get(l.type_code) ?? { code: l.type_code, name: l.type_name, days: 0, hours: 0, count: 0 };
      entry.count += 1;
      entry.days += Number(l.total_days ?? 0);
      entry.hours += Number(l.total_hours ?? 0);
      byType.set(l.type_code, entry);
      for (const ds of eachDate(l.start_date, l.end_date)) {
        if (l.mode === 'hour') hourLeaveDates.add(ds);
        else leaveDates.add(ds);
      }
    }

    const userRecs = recsByUser.get(k) ?? [];
    const m: DiligenceMetrics = {
      workDays: 0, presentDays: 0, fullDays: 0,
      onTimeDays: 0, lateDays: 0, lateMinutesTotal: 0,
      earlyLeaveDays: 0, earlyLeaveMinutesTotal: 0,
      earlyArriveDays: 0, stayLateDays: 0,
      missingPunchDays: 0, absentDays: 0,
      leaveDays: 0, leaveByType: [],
      overtimeCount: 0, overtimeHours: 0, adjustmentCount: adjByUser.get(k) ?? 0,
      totalMinutes: 0, avgCheckIn: null, avgCheckOut: null,
      onTimeRate: 0, attendanceRate: 0, score: 0, grade: 'D',
    };

    let sumInMin = 0, sumOutMin = 0, cntIn = 0, cntOut = 0;
    // Nghỉ phép ĐÃ QUA (tới hôm nay) — dùng cho tỷ lệ chuyên cần (mẫu số là ngày đã tính).
    let leaveDaysElapsed = 0;

    for (const dateStr of allDates) {
      const [y, mo, dd] = dateStr.split('-').map(Number);
      const dow = new Date(y, mo - 1, dd).getDay();
      const shift = getShiftForDow(dow, cfg);  // giờ ca của CHÍNH ngày đó (null = nghỉ)
      const isWorkday = shift !== null;

      const dayRecs = userRecs.filter(
        (r) => new Date(r.recorded_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) === dateStr
      );
      const labeled = classifyDayRecords(dayRecs, cfg);
      const ins = labeled.filter((x) => x.label === 'check_in');
      const outs = labeled.filter((x) => x.label === 'check_out');
      const checkIn = ins[0]?.record ?? null;
      const checkOut = outs.length ? outs[outs.length - 1].record : null;
      const hasAny = Boolean(checkIn || checkOut);

      if (isWorkday) m.workDays += 1;

      if (!hasAny) {
        if (isWorkday) {
          if (leaveDates.has(dateStr)) leaveDaysElapsed += 1;
          else if (!hourLeaveDates.has(dateStr) && dateStr !== todayVN) m.absentDays += 1;
        }
        continue;
      }

      m.presentDays += 1;
      if (checkIn && !checkOut) {
        // Hôm nay chưa checkout thì chưa tính là quên chấm
        if (dateStr !== todayVN) m.missingPunchDays += 1;
      } else if (!checkIn && checkOut) {
        m.missingPunchDays += 1;
      }

      let inMin: number | null = null;
      let outMin: number | null = null;
      if (checkIn) {
        inMin = getVNMinutes(checkIn.recorded_at);
        sumInMin += inMin; cntIn += 1;
        // Chỉ xét đi trễ / đúng giờ khi ngày đó có ca làm (bỏ qua nếu chấm vào ngày nghỉ).
        if (shift) {
          if (inMin > shift.startMin + ws.lateGraceMinutes) {
            m.lateDays += 1;
            m.lateMinutesTotal += inMin - shift.startMin;
          } else {
            m.onTimeDays += 1;
            if (inMin < shift.startMin) m.earlyArriveDays += 1;
          }
        }
      }
      if (checkOut && dateStr !== todayVN) {
        outMin = getVNMinutes(checkOut.recorded_at);
        if (outMin < 4 * 60) outMin += 24 * 60; // checkout sau nửa đêm
        sumOutMin += outMin; cntOut += 1;
        if (shift) {
          if (outMin < shift.endMin - ws.earlyLeaveGraceMinutes) {
            m.earlyLeaveDays += 1;
            m.earlyLeaveMinutesTotal += shift.endMin - outMin;
          } else if (outMin > shift.endMin) {
            m.stayLateDays += 1;
          }
        }
      }

      // Giờ làm trong ngày (trừ nghỉ trưa nếu ca phủ qua)
      if (inMin != null && outMin != null && outMin > inMin) {
        let worked = outMin - inMin;
        const overlap = Math.min(outMin, lunch.end) - Math.max(inMin, lunch.start);
        if (overlap > 0) worked -= overlap;
        m.totalMinutes += worked;
        if (worked >= cfg.fullWorkdayMinutes) m.fullDays += 1;
      }
    }

    for (const o of otByUser.get(k) ?? []) {
      m.overtimeCount += 1;
      m.overtimeHours += Number(o.evening_hours ?? 0) + Number(o.night_hours ?? 0);
    }
    m.overtimeHours = Math.round(m.overtimeHours * 10) / 10;
    m.leaveByType = [...byType.values()].sort((a, b) => b.days - a.days || b.hours - a.hours);

    // Cột "Nghỉ phép" hiển thị TỔNG ngày nghỉ (mode day) ĐÃ DUYỆT là ngày công trong
    // kỳ [from,to] — KHÔNG cap tới hôm nay (khớp Tổng quan & Chi tiết ngày).
    m.leaveDays = 0;
    for (const ds of leaveDates) {
      if (ds < from || ds > to) continue;
      const [ly, lm, ld] = ds.split('-').map(Number);
      if (getShiftForDow(new Date(ly, lm - 1, ld).getDay(), cfg) !== null) m.leaveDays += 1;
    }

    m.avgCheckIn = cntIn ? fmtHHMM(sumInMin / cntIn) : null;
    m.avgCheckOut = cntOut ? fmtHHMM(sumOutMin / cntOut) : null;
    const daysWithIn = m.lateDays + m.onTimeDays;
    m.onTimeRate = daysWithIn ? Math.round((m.onTimeDays / daysWithIn) * 100) : 0;
    // Tỷ lệ chuyên cần dùng nghỉ ĐÃ QUA (leaveDaysElapsed) để khớp mẫu số workDays (cũng
    // tính tới hôm nay) — tránh (present+leave) > workDays khi có nghỉ tương lai.
    m.attendanceRate = m.workDays
      ? Math.min(100, Math.round(((m.presentDays + leaveDaysElapsed) / m.workDays) * 100))
      : 0;
    m.score = calcScore(m);
    m.grade = gradeOf(m.score);

    result.push({
      user_id: u.id,
      name: u.name,
      email: u.email,
      employee_code: u.employee_code,
      role: u.role,
      company_id: u.company_id,
      company_name: u.company_name,
      department_id: u.department_id,
      department_name: u.department_name,
      sub_department_name: u.sub_department_name,
      metrics: m,
    });
  }

  // Mặc định xếp theo điểm giảm dần rồi theo tên
  result.sort((a, b) => b.metrics.score - a.metrics.score || a.name.localeCompare(b.name, 'vi'));
  return result;
}
