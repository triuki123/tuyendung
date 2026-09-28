/**
 * attendanceConflictService.ts — "Soi mâu thuẫn" chấm công (đọc thuần).
 *
 * Với mỗi (nhân viên, ngày), đối chiếu chéo: đề xuất bù công / chế độ công đặc biệt,
 * khai báo tăng ca, đơn nghỉ phép phủ ngày đó, và dữ liệu vân tay thực tế — rồi gắn
 * cảnh báo để người duyệt / nhân viên không lỡ tạo phần dư / trùng / mâu thuẫn.
 *
 * Mức: 'red' (gần như chắc sai → UI bắt xác nhận) và 'amber' (nghi ngờ → chỉ hiện).
 * KHÔNG bao giờ chặn cứng.
 *
 * Dùng 2 cửa:
 *   - detectConflictsForItems(items)        → cho người duyệt soi danh sách hiện có.
 *   - detectConflictsForCandidate(input)     → cho nhân viên soi TRƯỚC khi gửi (kèm món sắp tạo).
 */
import { query } from '@/lib/db';
import { getMonthlyDays } from './attendanceService';
import { resolveAttendanceConfigForUser } from './attendanceSettingsService';
import { getPayrollPeriodForDate, isWeekendDay } from '@/lib/config/attendanceConfig';
import type { ResolvedAttendanceConfig } from '@/lib/config/attendanceConfig';

export type ConflictSeverity = 'red' | 'amber';
export interface Conflict {
  severity: ConflictSeverity;
  code: string;
  message: string;
}

/** Loại "đủ 1 công" = mọi loại TRỪ bù giờ vào/ra (gồm cả work-mode tự tạo). */
const isFullDayAdj = (t: string): boolean => t !== 'bu_checkin' && t !== 'bu_checkout';
/** Ngưỡng tổng giờ/ngày coi là bất thường. */
const ABNORMAL_DAY_MINUTES = 16 * 60;

const ADJ_LABEL: Record<string, string> = {
  bu_cong: 'Bù Công', bu_cong_dac_biet: 'Bù Công Đặc Thù', bu_checkin: 'Bù Giờ Vào', bu_checkout: 'Bù Giờ Ra',
  cong_tac: 'Công Tác', wfh: 'Làm Việc Tại Nhà', lam_theo_ca: 'Làm Theo Ca',
};

const toMin = (hhmm: string): number => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const fmtMin = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
/** Số phút tăng ca (qua nửa đêm nếu end <= start). */
const otMinutes = (start: string, end: string): number => {
  const s = toMin(start), e = toMin(end);
  return e <= s ? e + 1440 - s : e - s;
};

export const conflictKey = (userId: string, date: string): string => `${userId}|${String(date).slice(0, 10)}`;

interface AdjRow { adjustment_type: string; status: string }
interface OtRow  { start_time: string; end_time: string; status: string }
interface LvRow  { mode: string; start_time: string | null; end_time: string | null; status: string; type_name: string | null }

/**
 * Rule engine THUẦN — không I/O. Dùng chung cho cả soi danh sách lẫn pre-check.
 */
export function evaluateConflicts(
  adjs: AdjRow[],
  ots: OtRow[],
  leaves: LvRow[],
  workedMin: number,
  cfg: ResolvedAttendanceConfig,
  workDate?: string,
): Conflict[] {
  const out: Conflict[] = [];
  const fullDayAdjs = adjs.filter((a) => isFullDayAdj(a.adjustment_type));
  const labelOf = (a: AdjRow) => ADJ_LABEL[a.adjustment_type] ?? a.adjustment_type;
  const dow = workDate ? new Date(`${String(workDate).slice(0, 10)}T00:00:00+07:00`).getDay() : null;
  const isWeekend = dow !== null ? isWeekendDay(dow, cfg) : false;

  // 🔴 R1 — Trùng công: ≥2 đề xuất loại "đủ 1 công" cùng ngày.
  if (fullDayAdjs.length >= 2) {
    out.push({
      severity: 'red', code: 'dup_fullday',
      message: `Trùng công: cùng ngày có ${fullDayAdjs.map(labelOf).join(' + ')} — mỗi loại đều tính đủ 1 công.`,
    });
  }

  // 🔴 R2 — Mâu thuẫn nghỉ phép: đã nghỉ phép cả ngày nhưng vẫn chấm công/tăng ca.
  const dayLeave = leaves.find((l) => l.mode === 'day');
  if (dayLeave && (adjs.length > 0 || ots.length > 0)) {
    out.push({
      severity: 'red', code: 'leave_overlap',
      message: `Đã có đơn nghỉ phép cả ngày (${dayLeave.type_name ?? 'nghỉ phép'}, ${dayLeave.status === 'pending' ? 'chờ duyệt' : 'đã duyệt'}) nhưng vẫn có đề xuất chấm công/tăng ca cùng ngày.`,
    });
  }

  // 🟠 R3 — Dư công: bảng chấm đã đủ công nhưng vẫn xin thêm công.
  if (workedMin >= cfg.fullWorkdayMinutes && fullDayAdjs.length > 0) {
    out.push({
      severity: 'amber', code: 'over_fullday',
      message: `Ngày này đã ghi nhận đủ công (${(workedMin / 60).toFixed(1)}h trên bảng chấm) nhưng vẫn xin ${fullDayAdjs.map(labelOf).join(', ')} — có thể dư công.`,
    });
  }

  // 🟠 R4 — Tăng ca đè giờ hành chính: OT bắt đầu trước giờ tan ca.
  const eveStart = cfg.overtimeBrackets.eveningStartMin;
  for (const ot of ots) {
    if (!isWeekend && toMin(ot.start_time) < eveStart) {
      out.push({
        severity: 'amber', code: 'ot_admin_overlap',
        message: `Tăng ca bắt đầu ${ot.start_time}, trước giờ tan ca (${fmtMin(eveStart)}) — có thể đè giờ hành chính.`,
      });
    }
  }

  // 🟠 R5a — Nghỉ phép theo giờ trùng khung tăng ca.
  for (const lv of leaves.filter((l) => l.mode === 'hour' && l.start_time && l.end_time)) {
    const ls = toMin(lv.start_time!), le = toMin(lv.end_time!);
    for (const ot of ots) {
      const os = toMin(ot.start_time), oe = os + otMinutes(ot.start_time, ot.end_time);
      if (Math.max(ls, os) < Math.min(le, oe)) {
        out.push({
          severity: 'amber', code: 'hourleave_ot_overlap',
          message: `Nghỉ phép theo giờ (${lv.start_time}–${lv.end_time}) trùng khung tăng ca (${ot.start_time}–${ot.end_time}).`,
        });
        break;
      }
    }
  }

  // 🟠 R5b — Tổng giờ trong ngày bất thường (vân tay + tăng ca).
  const otTotal = ots.reduce((s, o) => s + otMinutes(o.start_time, o.end_time), 0);
  const dayTotal = Math.max(workedMin, fullDayAdjs.length > 0 ? cfg.fullWorkdayMinutes : 0) + otTotal;
  if (dayTotal > ABNORMAL_DAY_MINUTES) {
    out.push({
      severity: 'amber', code: 'abnormal_total',
      message: `Tổng giờ trong ngày khoảng ${(dayTotal / 60).toFixed(1)}h — bất thường, nên kiểm tra lại.`,
    });
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Truy vấn dữ liệu (I/O) — gom theo lô để tránh N+1
// ─────────────────────────────────────────────────────────────────────────────

interface DbCtx {
  adjRows: (AdjRow & { user_id: string; work_date: string })[];
  otRows: (OtRow & { user_id: string; work_date: string })[];
  lvRows: (LvRow & { user_id: string; start_date: string; end_date: string })[];
}

async function loadDb(userIds: string[], dates: string[]): Promise<DbCtx> {
  const minDate = dates[0], maxDate = dates[dates.length - 1];
  const [adjRows, otRows, lvRows] = await Promise.all([
    query<AdjRow & { user_id: string; work_date: string }>(
      `SELECT user_id::text AS user_id, to_char(work_date,'YYYY-MM-DD') AS work_date, adjustment_type, status
         FROM attendance_adjustments
        WHERE user_id::text = ANY($1) AND to_char(work_date,'YYYY-MM-DD') = ANY($2)
          AND status IN ('pending','approved')`,
      [userIds, dates],
    ),
    query<OtRow & { user_id: string; work_date: string }>(
      `SELECT user_id::text AS user_id, to_char(work_date,'YYYY-MM-DD') AS work_date, start_time, end_time, status
         FROM attendance_overtime
        WHERE user_id::text = ANY($1) AND to_char(work_date,'YYYY-MM-DD') = ANY($2)
          AND status IN ('pending','approved')`,
      [userIds, dates],
    ),
    query<LvRow & { user_id: string; start_date: string; end_date: string }>(
      `SELECT lr.user_id::text AS user_id, lr.mode,
              to_char(lr.start_date,'YYYY-MM-DD') AS start_date,
              to_char(lr.end_date,'YYYY-MM-DD') AS end_date,
              lr.start_time, lr.end_time, lr.status, lt.name AS type_name
         FROM leave_requests lr
         LEFT JOIN leave_types lt ON lt.id = lr.leave_type_id
        WHERE lr.user_id::text = ANY($1) AND lr.status IN ('pending','approved')
          AND lr.end_date >= $2::date AND lr.start_date <= $3::date`,
      [userIds, minDate, maxDate],
    ),
  ]);
  return { adjRows, otRows, lvRows };
}

/** Phút làm thực tế theo (user, ngày), cache theo kỳ công. */
function makeWorkedMinutesFn() {
  const cache = new Map<string, Map<string, number>>();
  return async (uid: string, date: string, cfg: ResolvedAttendanceConfig): Promise<number> => {
    const period = getPayrollPeriodForDate(date, cfg);
    const ck = `${uid}|${period.month}|${period.year}`;
    if (!cache.has(ck)) {
      // getMonthlyDays để người "Mặc Định Đủ Công" không bị báo lệch/thiếu giờ oan.
      const days = await getMonthlyDays(uid, period.month, period.year, cfg);
      cache.set(ck, new Map(days.map((d) => [d.date, d.total_minutes])));
    }
    return cache.get(ck)!.get(date) ?? 0;
  };
}

/**
 * Soi mâu thuẫn cho danh sách (nhân viên, ngày).
 * Trả map `${userId}|${YYYY-MM-DD}` → Conflict[] (chỉ key có ≥1 cảnh báo).
 */
export async function detectConflictsForItems(
  items: { userId: string; date: string }[],
): Promise<Record<string, Conflict[]>> {
  const out: Record<string, Conflict[]> = {};

  const distinct = new Map<string, { userId: string; date: string }>();
  for (const it of items) {
    if (!it.userId || !it.date) continue;
    const date = String(it.date).slice(0, 10);
    distinct.set(conflictKey(it.userId, date), { userId: it.userId, date });
  }
  if (distinct.size === 0) return out;

  const pairs = [...distinct.values()];
  const userIds = [...new Set(pairs.map((p) => p.userId))];
  const dates = [...new Set(pairs.map((p) => p.date))].sort();
  const { adjRows, otRows, lvRows } = await loadDb(userIds, dates);

  const cfgCache = new Map<string, ResolvedAttendanceConfig>();
  const firstDateOf = (uid: string) => pairs.filter((p) => p.userId === uid).map((p) => p.date).sort()[0];
  async function cfgOf(uid: string) {
    if (!cfgCache.has(uid)) cfgCache.set(uid, await resolveAttendanceConfigForUser(uid, firstDateOf(uid)));
    return cfgCache.get(uid)!;
  }
  const workedMinutes = makeWorkedMinutesFn();

  for (const { userId, date } of pairs) {
    const cfg = await cfgOf(userId);
    const adjs = adjRows.filter((a) => a.user_id === userId && a.work_date === date);
    const ots = otRows.filter((o) => o.user_id === userId && o.work_date === date);
    const leaves = lvRows.filter((l) => l.user_id === userId && l.start_date <= date && l.end_date >= date);
    const worked = await workedMinutes(userId, date, cfg);
    const conflicts = evaluateConflicts(adjs, ots, leaves, worked, cfg, date);
    if (conflicts.length > 0) out[conflictKey(userId, date)] = conflicts;
  }

  return out;
}

/**
 * Pre-check: soi mâu thuẫn cho 1 (nhân viên, ngày) KỂ CẢ món sắp tạo (chưa lưu DB).
 * Dùng trong modal tạo bù công / tăng ca để cảnh báo nhân viên trước khi gửi.
 */
export async function detectConflictsForCandidate(input: {
  userId: string;
  date: string;
  candidate: { source: 'adjustment' | 'overtime'; adjustmentType?: string; startTime?: string; endTime?: string };
}): Promise<Conflict[]> {
  const { userId } = input;
  const date = String(input.date).slice(0, 10);
  if (!userId || !date) return [];

  const { adjRows, otRows, lvRows } = await loadDb([userId], [date]);
  const cfg = await resolveAttendanceConfigForUser(userId, date);
  const worked = await makeWorkedMinutesFn()(userId, date, cfg);

  const adjs: AdjRow[] = adjRows.filter((a) => a.work_date === date);
  const ots: OtRow[] = otRows.filter((o) => o.work_date === date);
  const leaves: LvRow[] = lvRows.filter((l) => l.start_date <= date && l.end_date >= date);

  // Thêm món sắp tạo vào để rule engine "nhìn thấy".
  const c = input.candidate;
  if (c.source === 'adjustment' && c.adjustmentType) {
    adjs.push({ adjustment_type: c.adjustmentType, status: 'pending' });
  } else if (c.source === 'overtime' && c.startTime && c.endTime) {
    ots.push({ start_time: c.startTime, end_time: c.endTime, status: 'pending' });
  }

  return evaluateConflicts(adjs, ots, leaves, worked, cfg, date);
}
