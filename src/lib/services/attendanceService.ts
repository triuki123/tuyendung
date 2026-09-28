import { query, queryOne, execute } from '@/lib/db';
import {
  ResolvedAttendanceConfig, DEFAULT_ATTENDANCE_CONFIG, getPayrollPeriodForDate, getPayrollPeriodDates,
} from '@/lib/config/attendanceConfig';
import { resolveAttendanceConfigForUser } from '@/lib/services/attendanceSettingsService';
import { uploadBufferAsMedia, getMediaBuffer } from '@/lib/services/mediaService';

// Re-export để các nơi đang import từ service không phải đổi đường dẫn.
export { getPayrollPeriodForDate };

export interface AttendanceRecord {
  id: string;
  user_id: string;
  type: string;
  event_type: string;
  recorded_at: string;
  lat: number | null;
  lng: number | null;
  photo_mime: string | null;
  notes: string | null;
  machine_id: string | null;
  created_at: string;
  user_name?: string;
}

export interface AttendanceSheet {
  id: string;
  user_id: string;
  month: number;
  year: number;
  status: string;
  total_days: number;       // số ngày có chấm công
  total_hours: number;      // tổng giờ làm thực tế
  comment: string | null;
  approved_by: string | null;
  approved_at: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  user_name?: string;
}

export interface DailyAttendance {
  date: string;
  check_in: string | null;
  check_out: string | null;
  total_minutes: number;     // giờ làm = checkout - checkin (phút)
  has_checkin: boolean;
  has_checkout: boolean;
  records: AttendanceRecord[];
  /** true = ngày được tính đủ công theo cờ "Mặc Định Đủ Công", không phải chấm thật. */
  default_full?: boolean;
}

/**
 * machine_id chuẩn (canonical) — MỌI đường ingest dữ liệu máy phải dùng giá trị này
 * để JOIN read-path và dedup device_punches hoạt động nhất quán.
 * Khớp với ZKTECO_MACHINE_ID trong server.ts.
 */
export const CANONICAL_MACHINE_ID = process.env.ZKTECO_MACHINE_ID || 'zkteco_ronald_jack_1';

/**
 * Ghi 1 punch thô từ máy vào device_punches (NGUỒN SỰ THẬT, độc lập mapping).
 * Dedup tự nhiên bằng UNIQUE(machine_id, employee_code, punch_time) → ON CONFLICT DO NOTHING.
 * Trả về true nếu là punch MỚI (vừa insert), false nếu đã tồn tại (bị bỏ qua).
 */
export async function recordDevicePunch(data: {
  machine_id?: string;
  employee_code: string;
  punch_time: string;        // ISO string, lấy đúng từ máy
  raw_status?: number;
}): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO device_punches (machine_id, employee_code, punch_time, raw_status)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (machine_id, employee_code, punch_time) DO NOTHING
     RETURNING id`,
    [
      data.machine_id ?? CANONICAL_MACHINE_ID,
      data.employee_code,
      data.punch_time,
      data.raw_status ?? null,
    ]
  );
  return !!row;
}

/**
 * Bulk insert nhiều punches cùng lúc — nhanh hơn N lần so với insert từng cái.
 * Trả về danh sách { employee_code, punch_time } của những punch THỰC SỰ MỚI.
 * Dùng cho poller khi fetch hàng chục nghìn records từ máy.
 */
export async function bulkRecordDevicePunches(
  machineId: string,
  punches: { employee_code: string; punch_time: string; raw_status?: number | null }[]
): Promise<{ employee_code: string; punch_time: string }[]> {
  if (!punches.length) return [];

  // Chunk mỗi 500 để tránh quá nhiều params trong 1 query
  const CHUNK = 500;
  const newPunches: { employee_code: string; punch_time: string }[] = [];

  for (let i = 0; i < punches.length; i += CHUNK) {
    const batch = punches.slice(i, i + CHUNK);
    const values: any[] = [];
    const rows: string[] = [];
    let p = 1;
    for (const punch of batch) {
      rows.push(`($${p++}, $${p++}, $${p++}, $${p++})`);
      values.push(machineId, punch.employee_code, punch.punch_time, punch.raw_status ?? null);
    }
    const result = await query<{ employee_code: string; punch_time: string }>(
      `INSERT INTO device_punches (machine_id, employee_code, punch_time, raw_status)
       VALUES ${rows.join(', ')}
       ON CONFLICT (machine_id, employee_code, punch_time) DO NOTHING
       RETURNING employee_code, punch_time`,
      values
    );
    newPunches.push(...result);
  }
  return newPunches;
}

/** Chấm công qua APP (vào/ra) — chỉ dùng cho type='app' (có GPS/ảnh, khóa theo user). */
export async function recordAttendance(data: {
  user_id: string;
  event_type: 'check_in' | 'check_out';
  type?: 'app' | 'machine';
  lat?: number;
  lng?: number;
  photo?: Buffer;
  photo_mime?: string;
  notes?: string;
  machine_id?: string;
  recorded_at?: string;
}): Promise<AttendanceRecord> {
  // Dual-write: có S3 → ảnh lên MinIO (media_id), BYTEA NULL; chưa cấu hình → BYTEA như cũ.
  let mediaId: string | null = null;
  if (data.photo) {
    const media = await uploadBufferAsMedia({
      buffer: data.photo,
      mimeType: data.photo_mime ?? 'image/jpeg',
      scope: 'attendance_records',
      originalName: `${data.event_type}.jpg`,
      uploaderId: data.user_id,
    });
    if (media) mediaId = media.id;
  }
  return queryOne<AttendanceRecord>(
    `INSERT INTO attendance_records
       (user_id, event_type, type, lat, lng, photo, photo_mime, media_id, notes, machine_id, recorded_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, user_id, type, event_type, recorded_at, lat, lng, photo_mime, notes, machine_id, created_at`,
    [
      data.user_id, data.event_type, data.type ?? 'app',
      data.lat ?? null, data.lng ?? null,
      mediaId ? null : (data.photo ?? null), data.photo_mime ?? null, mediaId, data.notes ?? null,
      data.machine_id ?? null,
      data.recorded_at ?? new Date().toISOString(),
    ]
  ) as Promise<AttendanceRecord>;
}

/** Lấy trạng thái đầy đủ hôm nay + cảnh báo hôm qua quên ra */
export async function getTodayStatus(userId: string): Promise<{
  checked_in: boolean;
  checked_out: boolean;
  check_in_time: string | null;
  check_out_time: string | null;
  last_event_type: 'check_in' | 'check_out' | null;
  last_event_lat: number | null;
  last_event_lng: number | null;
  records: AttendanceRecord[];
  yesterday_missing_checkout: boolean;
}> {
  // Records hôm nay = app (attendance_records) UNION machine (device_punches qua mapping).
  // dayOffset = 0 hôm nay, -1 hôm qua. Phân loại bằng classifyDayRecords (day-aware).
  const records = await getDayRecordsProjected(userId, 0);
  const labeled = classifyDayRecords(records);
  const checkIn  = labeled.find((x) => x.label === 'check_in')?.record;
  const checkOut = labeled.filter((x) => x.label === 'check_out').pop()?.record;
  const lastLabeled = labeled[labeled.length - 1] ?? null;

  // Hôm qua có quên chấm ra không
  const yRecords = await getDayRecordsProjected(userId, -1);
  const yLabeled = classifyDayRecords(yRecords);
  const yHasIn  = yLabeled.some((x) => x.label === 'check_in');
  const yHasOut = yLabeled.some((x) => x.label === 'check_out');
  const yesterday_missing_checkout = yHasIn && !yHasOut;

  return {
    checked_in:  !!checkIn,
    checked_out: !!checkOut,
    check_in_time:  checkIn?.recorded_at  ?? null,
    check_out_time: checkOut?.recorded_at ?? null,
    last_event_type: lastLabeled?.label ?? null,
    last_event_lat:  lastLabeled?.record.lat  ?? null,
    last_event_lng:  lastLabeled?.record.lng  ?? null,
    records: labeled.map((x) => ({ ...x.record, event_type: x.label })),
    yesterday_missing_checkout,
  };
}

/**
 * Lấy + phân loại records của user trong 1 ngày cụ thể (YYYY-MM-DD, giờ VN).
 * Dùng cho auto-resolve Bù Công: biết ngày đó có check_in / check_out THẬT hay chưa.
 * App (type='app') UNION machine (device_punches qua mapping sống).
 */
export async function getLabeledRecordsForDate(
  userId: string,
  workDate: string
): Promise<{ record: AttendanceRecord; label: 'check_in' | 'check_out' }[]> {
  const records = await query<AttendanceRecord>(
    `SELECT id, user_id, type, event_type, recorded_at, lat, lng, photo_mime, notes, machine_id, created_at
       FROM attendance_records
      WHERE user_id = $1
        AND type = 'app'
        AND DATE(recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = $2::date
     UNION ALL
     SELECT dp.id, $1 AS user_id, 'machine' AS type, 'check_in' AS event_type,
            dp.punch_time AS recorded_at, NULL::numeric AS lat, NULL::numeric AS lng,
            NULL AS photo_mime, NULL AS notes, dp.machine_id, dp.created_at
       FROM device_punches dp
       JOIN attendance_machine_mappings m
         ON m.machine_id = dp.machine_id AND m.employee_code = dp.employee_code
         AND dp.punch_time >= m.effective_from
         AND (m.effective_to IS NULL OR dp.punch_time < m.effective_to)
      WHERE m.user_id = $1
        AND DATE(dp.punch_time AT TIME ZONE 'Asia/Ho_Chi_Minh') = $2::date
     ORDER BY recorded_at ASC`,
    [userId, workDate]
  );
  return classifyDayRecords(records);
}

/**
 * Xác định nhãn VÀO/RA cho MỘT punch cụ thể — dùng CHUNG bộ não với bảng công
 * (classifyDayRecords day-aware), thay cho việc đoán thô theo mốc 12h trưa.
 *
 * Yêu cầu: punch đã được ghi vào DB (device_punches/attendance_records) TRƯỚC khi gọi,
 * để nó có mặt trong tập records của ngày → nhãn khớp với những gì bảng công sẽ hiển thị.
 *
 * Dùng cho thông báo realtime (Telegram/SSE) ở cả Pull (poller) và Push (ADMS).
 */
export async function classifyPunchForUser(
  userId: string,
  punchTime: string
): Promise<'check_in' | 'check_out'> {
  const workDate = new Date(punchTime).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
  });
  const labeled = await getLabeledRecordsForDate(userId, workDate);

  // Tìm record trùng đúng punch vừa tới (so theo epoch ms, dung sai 1s)
  const target = new Date(punchTime).getTime();
  let best: { label: 'check_in' | 'check_out'; diff: number } | null = null;
  for (const x of labeled) {
    const diff = Math.abs(new Date(x.record.recorded_at).getTime() - target);
    if (best === null || diff < best.diff) best = { label: x.label, diff };
  }
  if (best && best.diff < 1000) return best.label;

  // Không khớp (punch ngoài khung giờ làm, vd 03:00–03:59) → fallback theo giờ
  return getVNHour(punchTime) < 12 ? 'check_in' : 'check_out';
}

/**
 * Lấy records của user trong 1 ngày (theo offset ngày so với hôm nay, giờ VN).
 * App từ attendance_records (type='app') UNION machine từ device_punches qua mapping sống.
 */
async function getDayRecordsProjected(userId: string, dayOffset: number): Promise<AttendanceRecord[]> {
  return query<AttendanceRecord>(
    `SELECT id, user_id, type, event_type, recorded_at, lat, lng, photo_mime, notes, machine_id, created_at
       FROM attendance_records
      WHERE user_id = $1
        AND type = 'app'
        AND DATE(recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = DATE(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') + $2::int
     UNION ALL
     SELECT dp.id, $1 AS user_id, 'machine' AS type, 'check_in' AS event_type,
            dp.punch_time AS recorded_at, NULL::numeric AS lat, NULL::numeric AS lng,
            NULL AS photo_mime, NULL AS notes, dp.machine_id, dp.created_at
       FROM device_punches dp
       JOIN attendance_machine_mappings m
         ON m.machine_id = dp.machine_id AND m.employee_code = dp.employee_code
         AND dp.punch_time >= m.effective_from
         AND (m.effective_to IS NULL OR dp.punch_time < m.effective_to)
      WHERE m.user_id = $1
        AND DATE(dp.punch_time AT TIME ZONE 'Asia/Ho_Chi_Minh') = DATE(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') + $2::int
     ORDER BY recorded_at ASC`,
    [userId, dayOffset]
  );
}

/** Tính kỳ công: startDay/tháng N-1 → endDay/tháng N (mặc định 28 → 27). */
/** Lấy records của user theo kỳ công (định nghĩa bởi cfg — xem getPayrollPeriodDates). */
export async function getUserRecordsByMonth(
  userId: string,
  payrollMonth: number,
  payrollYear: number,
  cfg: ResolvedAttendanceConfig = DEFAULT_ATTENDANCE_CONFIG
): Promise<AttendanceRecord[]> {
  const { startDate, endDate } = getPayrollPeriodDates(payrollMonth, payrollYear, cfg);

  // Projection Model:
  //  - App records: lấy trực tiếp từ attendance_records (type='app', khóa theo user).
  //  - Machine punches: chiếu device_punches qua mapping SỐNG (machine_id, employee_code) → user.
  // Bỏ qua machine rows cũ trong attendance_records (đã backfill sang device_punches).
  return query<AttendanceRecord>(
    `SELECT id, user_id, type, event_type, recorded_at, lat, lng, photo_mime, notes, machine_id, created_at
       FROM attendance_records
      WHERE user_id = $1
        AND type = 'app'
        AND recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh' >= $2
        AND recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh' <= $3
     UNION ALL
     SELECT dp.id, $1 AS user_id, 'machine' AS type, 'check_in' AS event_type,
            dp.punch_time AS recorded_at, NULL::numeric AS lat, NULL::numeric AS lng,
            NULL AS photo_mime, NULL AS notes, dp.machine_id, dp.created_at
       FROM device_punches dp
       JOIN attendance_machine_mappings m
         ON m.machine_id = dp.machine_id AND m.employee_code = dp.employee_code
         AND dp.punch_time >= m.effective_from
         AND (m.effective_to IS NULL OR dp.punch_time < m.effective_to)
      WHERE m.user_id = $1
        AND dp.punch_time AT TIME ZONE 'Asia/Ho_Chi_Minh' >= $2
        AND dp.punch_time AT TIME ZONE 'Asia/Ho_Chi_Minh' <= $3
     ORDER BY recorded_at ASC`,
    [userId, startDate, endDate]
  );
}

/** Lấy giờ VN (0-23) từ ISO string — dùng timezone VN, không dùng getHours() */
function getVNHour(isoStr: string): number {
  const h = parseInt(
    new Date(isoStr).toLocaleString('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: 'numeric',
      hour12: false,
    })
  );
  return isNaN(h) ? 0 : h % 24;
}

/** Lấy tổng phút trong ngày (giờ*60 + phút) theo timezone VN */
export function getVNMinutes(isoStr: string): number {
  const d = new Date(isoStr);
  const vnStr = d.toLocaleString('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  // vnStr format: "08:30" or "17:45"
  const [hh, mm] = vnStr.split(':').map(Number);
  return (isNaN(hh) ? 0 : hh % 24) * 60 + (isNaN(mm) ? 0 : mm);
}

/**
 * Phân loại các record trong MỘT ngày thành vào/ra dựa trên giờ VN + THỨ TỰ THỜI GIAN.
 * KHÔNG tin event_type lưu DB (machine punches không có event_type đáng tin trong model mới).
 *
 * Quy tắc (records phải đã sort tăng dần theo thời gian):
 *   04:00–10:59 → VÀO
 *   14:00–02:59 (+1 ngày) → RA
 *   11:00–13:59 (overlap trưa) → đã thấy "vào" trong ngày → RA; chưa → VÀO
 *   03:00–03:59 → bỏ qua (ngoài khung)
 *
 * @param dayRecords records của 1 ngày, ĐÃ sort tăng dần theo recorded_at
 */
export function classifyDayRecords(
  dayRecords: AttendanceRecord[],
  cfg: ResolvedAttendanceConfig = DEFAULT_ATTENDANCE_CONFIG
): { record: AttendanceRecord; label: 'check_in' | 'check_out' }[] {
  const w = cfg.punchWindows;
  const out: { record: AttendanceRecord; label: 'check_in' | 'check_out' }[] = [];
  let seenIn = false;
  for (const r of dayRecords) {
    const h = getVNHour(r.recorded_at);
    if (h >= w.skipStart && h < w.skipEnd) continue; // ngoài khung → bỏ qua
    let label: 'check_in' | 'check_out';
    if (h >= w.checkInStart && h < w.checkInEnd) { label = 'check_in'; seenIn = true; }
    else if (h >= w.checkOutStart || h < w.skipStart) { label = 'check_out'; }
    else { // overlap khung trưa → theo thứ tự
      if (seenIn) { label = 'check_out'; }
      else { label = 'check_in'; seenIn = true; }
    }
    out.push({ record: r, label });
  }
  return out;
}

/** Nhóm records theo ngày — chỉ ghi nhận giờ vào/ra, không phán xét muộn/sớm */
export function groupRecordsByDay(
  records: AttendanceRecord[],
  payrollMonth: number,
  payrollYear: number,
  cfg: ResolvedAttendanceConfig = DEFAULT_ATTENDANCE_CONFIG
): DailyAttendance[] {
  const result: DailyAttendance[] = [];

  // Khoảng ngày của kỳ công theo cfg (cross-month 28→27, hoặc theo tháng dương lịch 1→cuối tháng).
  const { startDate, endDate } = getPayrollPeriodDates(payrollMonth, payrollYear, cfg);

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayRecords = records.filter((r) => {
      const recDate = new Date(r.recorded_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
      return recDate === dateStr;
    });

    // Phân loại theo giờ VN + thứ tự thời gian (day-aware) — không tin event_type
    const labeled = classifyDayRecords(dayRecords, cfg);
    const checkInRecords  = labeled.filter(x => x.label === 'check_in').map(x => x.record);
    const checkOutRecords = labeled.filter(x => x.label === 'check_out').map(x => x.record);
    const checkIn  = checkInRecords[0] ?? null;          // sớm nhất trong ngày
    const checkOut = checkOutRecords[checkOutRecords.length - 1] ?? null; // muộn nhất trong ngày

    // Tổng giờ làm = checkout - checkin (phút). Nếu chưa checkout = 0
    let total_minutes = 0;
    if (checkIn && checkOut) {
      total_minutes = Math.round(
        (new Date(checkOut.recorded_at).getTime() - new Date(checkIn.recorded_at).getTime()) / 60000
      );
      if (total_minutes < 0) total_minutes = 0;

      // Trừ phần chồng lấp thực tế giữa ca làm và khung nghỉ trưa (giờ VN)
      const ciMins = getVNMinutes(checkIn.recorded_at);
      const coMins = getVNMinutes(checkOut.recorded_at);
      const lunchStart = cfg.lunchStartHour * 60;
      const lunchEnd = cfg.lunchEndHour * 60;
      const lunchOverlap = Math.max(0, Math.min(coMins, lunchEnd) - Math.max(ciMins, lunchStart));
      total_minutes = Math.max(0, total_minutes - lunchOverlap);

      // Bù giờ nghỉ trưa cho ca SÁNG kết thúc trong khung trưa (quy định công ty):
      // vào TRƯỚC giờ bắt đầu nghỉ trưa VÀ ra TRƯỚC giờ kết thúc nghỉ trưa → cộng lại
      // trọn khung nghỉ trưa (mặc định 1 giờ) vào tổng.
      // Lấy độ dài khung trưa từ cấu hình, không viết cứng 60 phút, để công ty đổi
      // giờ nghỉ trưa thì phần bù cũng đổi theo.
      if (ciMins < lunchStart && coMins < lunchEnd) {
        total_minutes += Math.max(0, lunchEnd - lunchStart);
      }
    }

    // event_type hiển thị cho UI = nhãn day-aware (nhất quán với check_in/check_out ở trên)
    const normalizedRecords = labeled.map(x => ({ ...x.record, event_type: x.label }));

    result.push({
      date: dateStr,
      check_in:      checkIn?.recorded_at  ?? null,
      check_out:     checkOut?.recorded_at ?? null,
      total_minutes,
      has_checkin:   !!checkIn,
      has_checkout:  !!checkOut,
      records:       normalizedRecords,
    });
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// "Mặc Định Đủ Công" (migration 306) — vị trí không phải điểm danh
// ─────────────────────────────────────────────────────────────────────────────

export interface DefaultFullAttendanceInfo {
  enabled: boolean;
  /** Mốc hiệu lực (YYYY-MM-DD). Ngày TRƯỚC mốc giữ nguyên số liệu thật (không hồi tố). */
  from: string | null;
}

/** Cờ đủ công của 1 user. Cột chưa migrate → coi như tắt (không làm gãy luồng cũ). */
export async function getDefaultFullAttendance(userId: string): Promise<DefaultFullAttendanceInfo> {
  try {
    const row = await queryOne<{ enabled: boolean | null; from: string | null }>(
      `SELECT default_full_attendance AS enabled,
              to_char(default_full_attendance_from, 'YYYY-MM-DD') AS from
         FROM users WHERE id = $1`,
      [userId]
    );
    return { enabled: !!row?.enabled, from: row?.from ?? null };
  } catch {
    return { enabled: false, from: null };
  }
}

/** Ngày lễ (YYYY-MM-DD) trong khoảng — ngày lễ KHÔNG tính là ngày công đủ. */
async function getHolidaySet(startStr: string, endStr: string): Promise<Set<string>> {
  try {
    const rows = await query<{ d: string }>(
      `SELECT to_char(date, 'YYYY-MM-DD') AS d FROM public_holidays
        WHERE date BETWEEN $1::date AND $2::date`,
      [startStr, endStr]
    );
    return new Set(rows.map(r => r.d));
  } catch {
    return new Set();
  }
}

/**
 * Áp "đủ công" lên các ngày LÀM VIỆC của kỳ cho người được tick.
 *
 * Quy tắc (đã chốt với nghiệp vụ):
 *  - Ngày làm việc = ngày MỞ theo weeklySchedule (CN nghỉ) và KHÔNG phải ngày lễ
 *    → đúng bằng định nghĩa "công chuẩn" trong file xuất công.
 *  - Cờ ĐÈ lên tất cả: có đơn nghỉ phép đã duyệt vẫn tính đủ công (phép chỉ ghi nhận
 *    để theo dõi, không trừ ngày công).
 *  - Chỉ áp cho ngày >= mốc hiệu lực → kỳ đã chốt/đã gửi HR không đổi hồi tố.
 *  - KHÔNG đụng ngày đã có chấm công thật: giữ nguyên giờ vào/ra để vẫn tra cứu được.
 *    Chỉ nâng total_minutes lên đủ 1 ngày công nếu ngày đó thiếu giờ.
 *  - KHÔNG áp cho ngày TƯƠNG LAI (calcSheetStats cũng đã cắt, giữ nhất quán khi
 *    hiển thị lịch tháng).
 */
export function applyDefaultFullAttendance(
  days: DailyAttendance[],
  opts: {
    from: string | null;
    holidays: Set<string>;
    cfg?: ResolvedAttendanceConfig;
    /** Ngày hôm nay theo giờ VN (YYYY-MM-DD) — tiêm vào để test được. */
    today?: string;
  }
): DailyAttendance[] {
  const cfg = opts.cfg ?? DEFAULT_ATTENDANCE_CONFIG;
  const today = opts.today ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const fullMinutes = cfg.fullWorkdayMinutes;

  return days.map((d) => {
    if (opts.from && d.date < opts.from) return d;   // trước mốc hiệu lực → giữ nguyên
    if (d.date > today) return d;                     // ngày tương lai → chưa tính
    if (opts.holidays.has(d.date)) return d;          // ngày lễ → cột riêng, không phải ngày công
    const dow = new Date(d.date + 'T00:00:00').getDay();
    const sch = cfg.weeklySchedule?.[dow];
    const isWorkingDay = sch ? sch.open : !cfg.weekendDays.includes(dow);
    if (!isWorkingDay) return d;                      // CN / ngày nghỉ theo lịch tuần

    return {
      ...d,
      has_checkin: true,
      has_checkout: true,
      total_minutes: Math.max(d.total_minutes, fullMinutes),
      default_full: true,
    };
  });
}

/**
 * Ngày công của 1 người trong kỳ — ĐIỂM VÀO CHUẨN cho mọi bề mặt bảng công.
 * Gộp: lấy records (app + máy) → nhóm theo ngày → áp cờ "Mặc Định Đủ Công".
 * Dùng hàm này thay cho cặp getUserRecordsByMonth + groupRecordsByDay để cờ có
 * hiệu lực đồng bộ ở Tra Cứu, Bảng Công, sheet stats và cảnh báo lệch công.
 */
export async function getMonthlyDays(
  userId: string,
  payrollMonth: number,
  payrollYear: number,
  cfg: ResolvedAttendanceConfig = DEFAULT_ATTENDANCE_CONFIG
): Promise<DailyAttendance[]> {
  const records = await getUserRecordsByMonth(userId, payrollMonth, payrollYear, cfg);
  const days = groupRecordsByDay(records, payrollMonth, payrollYear, cfg);

  const flag = await getDefaultFullAttendance(userId);
  if (!flag.enabled) return days;

  const { startDate, endDate } = getPayrollPeriodDates(payrollMonth, payrollYear, cfg);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const holidays = await getHolidaySet(iso(startDate), iso(endDate));

  return applyDefaultFullAttendance(days, { from: flag.from, holidays, cfg });
}

/** Định dạng giờ VN 'HH:MM:SS' từ ISO; rỗng nếu null (để ô export trống). */
function fmtVNClock(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

const VN_WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

export interface DailyClockRow {
  date: string;        // YYYY-MM-DD
  weekday: string;     // Thứ Hai...
  check_in: string;    // 'HH:MM' hoặc '' (trống nếu không chấm)
  check_out: string;   // 'HH:MM' hoặc ''
  total_hours: number; // giờ làm thực tế (đã trừ nghỉ trưa)
}

/**
 * Giờ VÀO / RA theo TỪNG NGÀY trong khoảng [fromDate, toDate] (YYYY-MM-DD, giờ VN).
 * Dùng cho tính năng "Xuất Dữ Liệu Công" theo khoảng ngày bất kỳ.
 * Ngày không có chấm công → check_in/check_out rỗng (để trống trong file xuất).
 */
export async function getDailyClockRange(
  userId: string,
  fromDate: string,
  toDate: string,
  cfg: ResolvedAttendanceConfig = DEFAULT_ATTENDANCE_CONFIG
): Promise<DailyClockRow[]> {
  // Toàn bộ record trong khoảng: app (khóa theo user) + máy (chiếu qua mapping sống).
  // '< (toDate + 1 ngày)' để bao trọn cả ngày kết thúc.
  const records = await query<AttendanceRecord>(
    `SELECT id, user_id, type, event_type, recorded_at, lat, lng, photo_mime, notes, machine_id, created_at
       FROM attendance_records
      WHERE user_id = $1 AND type = 'app'
        AND recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh' >= $2::date
        AND recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh' < ($3::date + 1)
     UNION ALL
     SELECT dp.id, $1 AS user_id, 'machine' AS type, 'check_in' AS event_type,
            dp.punch_time AS recorded_at, NULL::numeric AS lat, NULL::numeric AS lng,
            NULL AS photo_mime, NULL AS notes, dp.machine_id, dp.created_at
       FROM device_punches dp
       JOIN attendance_machine_mappings m
         ON m.machine_id = dp.machine_id AND m.employee_code = dp.employee_code
         AND dp.punch_time >= m.effective_from
         AND (m.effective_to IS NULL OR dp.punch_time < m.effective_to)
      WHERE m.user_id = $1
        AND dp.punch_time AT TIME ZONE 'Asia/Ho_Chi_Minh' >= $2::date
        AND dp.punch_time AT TIME ZONE 'Asia/Ho_Chi_Minh' < ($3::date + 1)
     ORDER BY recorded_at ASC`,
    [userId, fromDate, toDate]
  );

  const rows: DailyClockRow[] = [];
  const start = new Date(fromDate + 'T00:00:00');
  const end = new Date(toDate + 'T00:00:00');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayRecords = records.filter(
      (r) => new Date(r.recorded_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) === dateStr
    );
    const labeled = classifyDayRecords(dayRecords, cfg);
    const ci = labeled.filter((x) => x.label === 'check_in').map((x) => x.record)[0] ?? null;
    const cos = labeled.filter((x) => x.label === 'check_out').map((x) => x.record);
    const co = cos[cos.length - 1] ?? null;

    let mins = 0;
    if (ci && co) {
      mins = Math.round((new Date(co.recorded_at).getTime() - new Date(ci.recorded_at).getTime()) / 60000);
      if (mins < 0) mins = 0;
      const ciM = getVNMinutes(ci.recorded_at);
      const coM = getVNMinutes(co.recorded_at);
      const lunchOverlap = Math.max(0, Math.min(coM, cfg.lunchEndHour * 60) - Math.max(ciM, cfg.lunchStartHour * 60));
      mins = Math.max(0, mins - lunchOverlap);
    }

    rows.push({
      date: dateStr,
      weekday: VN_WEEKDAYS[new Date(dateStr + 'T00:00:00').getDay()],
      check_in: fmtVNClock(ci?.recorded_at ?? null),
      check_out: fmtVNClock(co?.recorded_at ?? null),
      total_hours: Math.round((mins / 60) * 100) / 100,
    });
  }
  return rows;
}

/** Tính tổng thống kê tháng — tổng ngày có chấm + tổng giờ làm */
export function calcSheetStats(days: DailyAttendance[]) {
  const today = new Date();
  const pastDays = days.filter((d) => new Date(d.date) <= today);

  const total_days  = pastDays.filter((d) => d.has_checkin).length;
  const total_mins  = pastDays.reduce((sum, d) => sum + d.total_minutes, 0);
  const total_hours = Math.round((total_mins / 60) * 10) / 10; // 1 chữ số thập phân

  return { total_days, total_hours };
}

/** Lấy hoặc tạo bảng công tháng */
export async function getOrCreateSheet(
  userId: string,
  month: number,
  year: number
): Promise<AttendanceSheet> {
  const existing = await queryOne<AttendanceSheet>(
    `SELECT * FROM attendance_sheets WHERE user_id = $1 AND month = $2 AND year = $3`,
    [userId, month, year]
  );
  if (existing) return existing;

  return queryOne<AttendanceSheet>(
    `INSERT INTO attendance_sheets (user_id, month, year, status) VALUES ($1,$2,$3,'draft') RETURNING *`,
    [userId, month, year]
  ) as Promise<AttendanceSheet>;
}

/** Cập nhật thống kê bảng công */
export async function updateSheetStats(
  sheetId: string,
  stats: { total_days: number; total_hours: number }
): Promise<void> {
  await execute(
    `UPDATE attendance_sheets
     SET total_days=$2, total_hours=$3, updated_at=NOW()
     WHERE id=$1`,
    [sheetId, stats.total_days, stats.total_hours]
  );
}

/** Submit bảng công (draft → submitted, hoặc rejected → submitted khi manager từ chối) */
export async function submitSheet(sheetId: string): Promise<AttendanceSheet | null> {
  return queryOne<AttendanceSheet>(
    `UPDATE attendance_sheets
     SET status='submitted', submitted_at=NOW(), comment=NULL, updated_at=NOW()
     WHERE id=$1::uuid AND status IN ('draft', 'rejected')
     RETURNING *`,
    [sheetId]
  );
}

/**
 * Nhân viên huỷ nộp bảng công (submitted → draft), chỉ được trước deadline.
 * Kiểm tra deadline phải thực hiện ở tầng route (cần biết month/year).
 */
export async function cancelSheet(sheetId: string, userId: string): Promise<AttendanceSheet | null> {
  // user_id::text luôn lowercase (UUID→text) — so sánh với LOWER($2) là đủ.
  return queryOne<AttendanceSheet>(
    `UPDATE attendance_sheets
     SET status='draft', submitted_at=NULL, updated_at=NOW()
     WHERE id=$1::uuid AND user_id::text = LOWER($2) AND status='submitted'
     RETURNING *`,
    [sheetId, userId]
  );
}

/** Manager duyệt / yêu cầu chỉnh sửa */
export async function reviewSheet(
  sheetId: string,
  action: 'approved' | 'rejected',
  approvedBy: string,
  comment?: string
): Promise<AttendanceSheet | null> {
  return queryOne<AttendanceSheet>(
    `UPDATE attendance_sheets
     SET status=$2, comment=$3, approved_by=$4::uuid, approved_at=NOW(), updated_at=NOW()
     WHERE id=$1::uuid AND status='submitted'
     RETURNING *`,
    [sheetId, action, comment ?? null, approvedBy]
  );
}

/**
 * Refresh sheet stats ngay sau khi có record mới — gọi fire-and-forget,
 * không block response API.
 *
 * Logic: lấy tháng/năm VN từ `recordedAt`, tính lại stats, cập nhật sheet.
 * Tự động xác định kỳ công đúng dù record thuộc ngày 28-31 tháng trước.
 */
export async function refreshSheetStatsAsync(
  userId: string,
  recordedAt: string
): Promise<void> {
  try {
    // Xác định tháng kỳ công theo timezone VN
    const vnDate = new Date(recordedAt).toLocaleDateString('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    // Cấu hình theo công ty của user, hiệu lực tại ngày chấm
    const cfg = await resolveAttendanceConfigForUser(userId, vnDate);
    // Ngày >= startDay thuộc kỳ công của tháng sau (vd 28: 28/5 → kỳ tháng 6)
    const { month: payrollMonth, year: payrollYear } = getPayrollPeriodForDate(vnDate, cfg);

    const days    = await getMonthlyDays(userId, payrollMonth, payrollYear, cfg);
    const stats   = calcSheetStats(days);
    const sheet   = await getOrCreateSheet(userId, payrollMonth, payrollYear);
    await updateSheetStats(sheet.id, stats);
  } catch (err) {
    // Không throw — đây là fire-and-forget, lỗi chỉ log
    console.error('[refreshSheetStatsAsync] error:', err);
  }
}

/**
 * Lấy tất cả user ID trong cây tổ chức dưới một manager (đệ quy theo manager_id).
 *
 * @param managerId  user gốc (manager)
 * @param companyId  (tùy chọn) nếu truyền → CHỈ giữ những user thuộc công ty này
 *                   (company_id chính = công ty đó HOẶC có membership active ở đó).
 *                   Vá lỗ rò rỉ chéo công ty khi 1 cây tổ chức trải nhiều công ty.
 *
 * Lưu ý: vẫn duyệt theo users.manager_id (toàn cục) để bám đúng chuỗi báo cáo,
 * chỉ LỌC tập kết quả theo công ty ở cuối — vì nhân viên công ty phụ vẫn là
 * primary-user của công ty đó và manager_id của họ trỏ lên đúng quản lý.
 */
export async function getOrgSubtreeUserIds(
  managerId: string,
  companyId?: string | null
): Promise<string[]> {
  // Phase 4 cải tổ cơ cấu: duyệt cây theo org_assignments.manager_id (nguồn sự thật mới,
  // hỗ trợ kiêm nhiệm — quyền hợp nhất từ mọi phân công active). Dual-write đảm bảo
  // org_assignments luôn phản chiếu users.manager_id + memberships nên kết quả tương
  // đương dữ liệu cũ, và tự mở rộng khi có phân công kiêm nhiệm.
  const normalizedMgrId = managerId.toLowerCase();
  const rows = await query<{ user_id: string }>(
    `WITH RECURSIVE org_tree AS (
       SELECT oa.user_id, 1 AS depth
         FROM org_assignments oa
         JOIN users u ON u.id = oa.user_id AND u.status = 'active'
        WHERE oa.manager_id::text = $1 AND oa.is_active
       UNION
       SELECT oa.user_id, ot.depth + 1
         FROM org_assignments oa
         JOIN org_tree ot ON oa.manager_id = ot.user_id
         JOIN users u ON u.id = oa.user_id AND u.status = 'active'
        WHERE oa.is_active AND ot.depth < 20
     )
     SELECT DISTINCT ot.user_id FROM org_tree ot
     ${companyId ? `
      WHERE EXISTS (
        SELECT 1 FROM org_assignments oa2
         WHERE oa2.user_id = ot.user_id AND oa2.company_id = $2 AND oa2.is_active
      )` : ''}`,
    companyId ? [normalizedMgrId, companyId] : [normalizedMgrId]
  );
  return rows.map(r => r.user_id).filter(id => id !== managerId);
}

/** Lấy tất cả user ID active TOÀN HỆ THỐNG (mọi công ty) — dùng cho super_admin */
export async function getAllActiveUserIds(): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM users WHERE status = 'active'`
  );
  return rows.map(r => r.id);
}

/** Lấy tất cả user ID trong cùng công ty với một admin */
export async function getCompanyUserIds(adminId: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `SELECT u.id FROM users u
     WHERE u.company = (SELECT company FROM users WHERE id = $1)
       AND u.id != $1
       AND u.status = 'active'`,
    [adminId]
  );
  return rows.map(r => r.id);
}

/** Auto-submit các bảng công draft đã quá deadline (lazy trigger) */
export async function autoSubmitDraftSheets(
  userIds: string[],
  month: number,
  year: number
): Promise<number> {
  if (userIds.length === 0) return 0;
  // Normalize về lowercase: user_id::text luôn lowercase (UUID type → text),
  // nhưng userIds từ getOrgSubtreeUserIds có thể là TEXT gốc (có thể uppercase từ Zimbra)
  const normalizedIds = userIds.map(id => id.toLowerCase());
  const placeholders = normalizedIds.map((_, i) => `$${i + 3}`).join(',');
  const result = await execute(
    `UPDATE attendance_sheets
     SET status = 'submitted', submitted_at = NOW(), updated_at = NOW()
     WHERE month = $1 AND year = $2
       AND status = 'draft'
       AND user_id::text = ANY(ARRAY[${placeholders}]::text[])`,
    [month, year, ...normalizedIds]
  );
  return result;
}

/** Lấy danh sách bảng công của team theo danh sách user ID */
export async function getTeamSheetsByUserIds(
  userIds: string[],
  month: number,
  year: number
): Promise<AttendanceSheet[]> {
  if (userIds.length === 0) return [];
  // Normalize về lowercase vì user_id::text (UUID → text) luôn trả lowercase.
  const normalizedIds = [...new Set(userIds.map(id => id.toLowerCase()))];
  const placeholders = normalizedIds.map((_, i) => `$${i + 3}`).join(',');

  // user_id là UUID — cast sang text trước khi so sánh.
  // UUID::text luôn lowercase; placeholders đã normalize lowercase → khớp chính xác.
  // LOWER() chỉ áp dụng lên cột TEXT (users.id), KHÔNG bao giờ gọi LOWER trực tiếp
  // trên UUID column hoặc expression chứa UUID.
  // Dùng ::text cast cho cả hai vế — UUID::text luôn trả lowercase, không cần LOWER().
  // TUYỆT ĐỐI không dùng LOWER(col) vì users.id có thể là UUID type → lower(uuid) lỗi.
  return query<AttendanceSheet>(
    `SELECT s.id,
            s.user_id,
            s.month,
            s.year,
            s.status,
            s.total_days,
            s.total_hours,
            s.comment,
            s.approved_by,
            s.approved_at,
            s.submitted_at,
            s.created_at,
            s.updated_at,
            COALESCE(u.name, s.user_id::text) AS user_name
     FROM attendance_sheets s
     LEFT JOIN users u ON u.id::text = s.user_id::text
     WHERE s.month = $1 AND s.year = $2
       AND s.user_id::text = ANY(ARRAY[${placeholders}]::text[])
     ORDER BY user_name ASC`,
    [month, year, ...normalizedIds]
  );
}

export interface TeamSheetRow extends AttendanceSheet {
  user_name:        string;
  company:          string | null;
  department_id:    string | null;
  dept_name:        string | null;
  manager_id:       string | null;
  manager_name:     string | null;
  is_manager:       boolean;       // = user là trưởng (head) của đơn vị hiệu lực (giữ shape cũ)
  is_company_level: boolean;       // phân công CHÍNH ở cấp công ty (department NULL tường minh)
  dept_head_id:     string | null; // user_id trưởng đơn vị (org_role='head', fallback head_id cũ)
  total_ot_hours:   number;        // tổng giờ tăng ca đã duyệt trong kỳ
  sent_to_hr_at:    string | null;
  /** Cấp bậc chức vụ: 1=Ban lãnh đạo … 4=Nhân viên, 5=Thực tập. null = chưa gán chức vụ. */
  position_rank:    number | null;
  /** Tên chức danh (vd "Thực Tập Sinh") — nguồn chính để tách NV / TTS. */
  position_name:    string | null;
}

/** Tên nhóm hiển thị cho phân công cấp công ty (department_id NULL trong org_assignments) */
export const COMPANY_LEVEL_DEPT_NAME = 'Ban Lãnh Đạo & Văn Phòng Công Ty';

/**
 * Lấy bảng công theo danh sách user ID, kèm thông tin Công Ty / Phòng Ban /
 * Quản lý + tổng giờ tăng ca — để nhóm hiển thị (giống Tổng Hợp) trên trang Bảng Công.
 *
 * Đơn vị lấy từ PHÂN CÔNG CHÍNH trong `org_assignments` (is_primary + is_active);
 * user chưa có assignment → fallback `users.department_id` như cũ (không rơi người).
 * Assignment có department NULL = cấp công ty tường minh → `is_company_level = true`,
 * dept_name = COMPANY_LEVEL_DEPT_NAME.
 * `dept_head_id` = trưởng đơn vị (org_role='head' trong org_assignments; fallback
 * departments.head_id / companies.head_id) — client dùng để hiển thị "QL: ...".
 */
export async function getTeamSheetsEnriched(
  userIds: string[],
  month: number,
  year: number,
  /**
   * Công ty ĐANG ĐỨNG (switcher). Người kiêm nhiệm có phân công ở nhiều công ty —
   * phải hiển thị công ty/phòng ban/quản lý của ĐÚNG công ty này, nếu không bảng công
   * xem ở công ty con vẫn gắn nhãn công ty mẹ (phân công chính).
   * null = không ưu tiên công ty nào (giữ hành vi cũ: phân công chính).
   */
  activeCompanyId?: string | null
): Promise<TeamSheetRow[]> {
  if (userIds.length === 0) return [];
  const normalizedIds = [...new Set(userIds.map(id => id.toLowerCase()))];
  const placeholders = normalizedIds.map((_, i) => `$${i + 7}`).join(',');

  // Kỳ công cho tổng tăng ca: 28/(month-1) → 27/month
  let otStartMonth = month - 1; let otStartYear = year;
  if (otStartMonth < 1) { otStartMonth = 12; otStartYear -= 1; }
  const otStart = `${otStartYear}-${String(otStartMonth).padStart(2, '0')}-28`;
  const otEnd   = `${year}-${String(month).padStart(2, '0')}-27`;

  return query<TeamSheetRow>(
    `WITH base AS (
       SELECT s.id, s.user_id, s.month, s.year, s.status,
              s.total_days, s.total_hours, s.comment,
              s.approved_by, s.approved_at, s.submitted_at, s.sent_to_hr_at,
              s.created_at, s.updated_at,
              COALESCE(u.name, s.user_id::text)      AS user_name,
              NULLIF(u.company, '')                  AS user_company_label,
              COALESCE(oa.manager_id::text, u.manager_id::text) AS manager_id,
              COALESCE(mgr.name, oa.manager_id::text, u.manager_id::text) AS manager_name,
              (oa.user_id IS NOT NULL)               AS has_assignment,
              -- Đơn vị hiệu lực: assignment CHÍNH thắng; chưa có assignment → users.department_id
              CASE WHEN oa.user_id IS NOT NULL THEN oa.department_id::text
                   ELSE u.department_id::text END    AS department_id,
              (oa.user_id IS NOT NULL AND oa.department_id IS NULL) AS is_company_level,
              COALESCE(oa.company_id::text, u.company_id::text)     AS pref_company_id
       FROM attendance_sheets s
       JOIN  users u   ON u.id::text = s.user_id::text
       LEFT JOIN LATERAL (
         -- Phân công hiệu lực: ƯU TIÊN phân công tại CÔNG TY ĐANG ĐỨNG ($6). Không có thì
         -- mới rơi về phân công chính (công ty chính). Bỏ điều kiện is_primary khi đã khớp
         -- công ty đang đứng, vì ở công ty phụ phân công có thể không phải "chính".
         SELECT p.user_id, p.company_id, p.department_id, p.manager_id
         FROM org_assignments p
         WHERE p.user_id::text = u.id::text AND p.is_active
           AND (p.is_primary OR ($6::text IS NOT NULL AND p.company_id::text = $6::text))
         ORDER BY ($6::text IS NOT NULL AND p.company_id::text = $6::text) DESC,
                  p.is_primary DESC,
                  (p.company_id::text = u.company_id::text) DESC NULLS LAST,
                  p.created_at DESC
         LIMIT 1
       ) oa ON true
       LEFT JOIN users mgr ON mgr.id::text = COALESCE(oa.manager_id::text, u.manager_id::text)
       WHERE s.month = $1 AND s.year = $2
         AND s.user_id::text = ANY(ARRAY[${placeholders}]::text[])
     ),
     scope AS (
       SELECT b.id, b.user_id, b.month, b.year, b.status,
              b.total_days, b.total_hours, b.comment,
              b.approved_by, b.approved_at, b.submitted_at, b.sent_to_hr_at,
              b.created_at, b.updated_at,
              b.user_name, b.manager_id, b.manager_name,
              b.department_id, b.is_company_level,
              COALESCE(comp.name, b.user_company_label) AS company,
              CASE WHEN b.is_company_level THEN $5::text
                   ELSE d.name END                      AS dept_name,
              COALESCE(
                h.user_id::text,
                CASE WHEN b.is_company_level THEN comp.head_id::text ELSE d.head_id::text END
              ) AS dept_head_id
       FROM base b
       LEFT JOIN departments d    ON d.id::text = b.department_id
       LEFT JOIN companies   comp ON comp.id::text = COALESCE(b.pref_company_id, d.company_id::text)
       LEFT JOIN LATERAL (
         SELECT ha.user_id
         FROM org_assignments ha
         WHERE ha.org_role = 'head' AND ha.is_active
           AND ha.company_id::text = COALESCE(b.pref_company_id, d.company_id::text)
           AND ha.department_id::text IS NOT DISTINCT FROM b.department_id
           AND ha.sub_department_id IS NULL  -- trưởng PHÒNG, không nhận nhầm trưởng bộ phận con
         ORDER BY ha.is_primary DESC, ha.created_at ASC
         LIMIT 1
       ) h ON true
     ),
     ot_totals AS (
       SELECT user_id::text AS uid,
              COALESCE(SUM(evening_hours + night_hours), 0) AS total_ot_hours
       FROM attendance_overtime
       WHERE status = 'approved'
         AND DATE(work_date) >= $3::date
         AND DATE(work_date) <= $4::date
       GROUP BY user_id::text
     )
     SELECT sc.*,
            (sc.dept_head_id IS NOT NULL AND sc.dept_head_id = sc.user_id::text) AS is_manager,
            COALESCE(ot.total_ot_hours, 0) AS total_ot_hours,
            -- Chức vụ + cấp bậc (1=Ban lãnh đạo … 4=Nhân viên, 5=Thực tập) — dùng cho
            -- bộ lọc Nhân viên / Thực tập sinh ở Bảng Công. Trả cả TÊN vì "thực tập sinh"
            -- là khái niệm theo CHỨC DANH; rank chỉ là tín hiệu dự phòng khi tên khác chuẩn.
            pos."rank" AS position_rank,
            pos.name    AS position_name
     FROM scope sc
     LEFT JOIN ot_totals ot ON ot.uid = sc.user_id::text
     LEFT JOIN users ur     ON ur.id::text = sc.user_id::text
     LEFT JOIN positions pos ON pos.id::text = ur.position_id::text
     ORDER BY company NULLS LAST, dept_name NULLS LAST, is_manager DESC, user_name ASC`,
    [month, year, otStart, otEnd, COMPANY_LEVEL_DEPT_NAME, activeCompanyId ?? null, ...normalizedIds]
  );
}

/** Lấy danh sách bảng công của team (manager) — LEGACY, giữ để không break code cũ */
export async function getTeamSheets(
  managerId: string,
  month: number,
  year: number
): Promise<AttendanceSheet[]> {
  return query<AttendanceSheet>(
    `SELECT s.*, u.name AS user_name
     FROM attendance_sheets s
     JOIN users u ON u.id::text = s.user_id::text
     WHERE u."manager_id"::text = $1
       AND s.month = $2
       AND s.year  = $3
     ORDER BY u.name ASC`,
    [managerId, month, year]
  );
}

/** Manager gửi toàn bộ bảng công đã duyệt của tháng về Bộ Phận Chấm Công (HCNS) */
export async function sendSheetsToHR(
  managerSubtreeUserIds: string[],
  managerId: string,
  month: number,
  year: number
): Promise<number> {
  if (managerSubtreeUserIds.length === 0) return 0;
  const normalizedIds = managerSubtreeUserIds.map(id => id.toLowerCase());
  const placeholders = normalizedIds.map((_, i) => `$${i + 4}`).join(',');
  return execute(
    `UPDATE attendance_sheets
     SET sent_to_hr_at = NOW(), sent_by_manager_id = $3
     WHERE month = $1 AND year = $2
       AND status = 'approved'
       AND sent_to_hr_at IS NULL
       AND user_id::text = ANY(ARRAY[${placeholders}]::text[])`,
    [month, year, managerId, ...normalizedIds]
  );
}

/**
 * Hệ thống TỰ ĐỘNG chốt & gửi bảng công về Bộ Phận Chấm Công khi tới hạn nộp.
 *
 * Thay cho luồng cũ (quản lý duyệt từng sheet rồi bấm "Gửi"): quản lý giờ CHỈ XEM.
 * Một lượt quét chốt tất cả sheet chưa gửi của kỳ (draft/submitted/approved/rejected):
 *   - submitted_at: giữ nếu đã có, ngược lại đặt NOW() (nộp hộ khi NV chưa nộp)
 *   - status='approved', approved_at=NOW() (hệ thống chốt — approved_by để trống)
 *   - sent_to_hr_at=NOW() (đánh dấu đã gửi HCNS)
 * Idempotent nhờ điều kiện `sent_to_hr_at IS NULL` → chạy lại không gửi trùng.
 * `sent_by_manager_id` để NULL (do hệ thống gửi, không phải quản lý).
 *
 * @returns số sheet vừa được gửi.
 */
export async function autoSendSheets(
  userIds: string[],
  month: number,
  year: number
): Promise<number> {
  if (userIds.length === 0) return 0;
  const normalizedIds = [...new Set(userIds.map(id => id.toLowerCase()))];
  const placeholders = normalizedIds.map((_, i) => `$${i + 3}`).join(',');
  return execute(
    `UPDATE attendance_sheets
     SET status = 'approved',
         submitted_at = COALESCE(submitted_at, NOW()),
         approved_at  = NOW(),
         sent_to_hr_at = NOW(),
         sent_by_manager_id = NULL,
         updated_at = NOW()
     WHERE month = $1 AND year = $2
       AND sent_to_hr_at IS NULL
       AND user_id::text = ANY(ARRAY[${placeholders}]::text[])`,
    [month, year, ...normalizedIds]
  );
}

export interface HRSheetRow extends AttendanceSheet {
  user_name:        string;
  company:          string | null;
  department_id:    string | null;
  dept_name:        string | null;
  manager_id:       string | null;
  manager_name:     string | null;
  is_manager:       boolean;       // = user là trưởng (head) của đơn vị hiệu lực
  is_company_level: boolean;       // phân công CHÍNH ở cấp công ty (department NULL tường minh)
  dept_head_id:     string | null; // user_id trưởng đơn vị (org_role='head', fallback head_id cũ)
  total_ot_hours:   number;   // tổng giờ tăng ca đã duyệt
  hr_note:          string | null;
  locked_at:        string | null;
  locked_by:        string | null;
}

/**
 * HCNS: lấy tất cả bảng công đã được manager gửi về, kèm thông tin
 * công ty / phòng ban. Bao gồm luôn sheet của chính manager (nếu có)
 * để hiển thị ở đầu mỗi nhóm.
 *
 * Đơn vị lấy từ PHÂN CÔNG CHÍNH trong `org_assignments` (fallback users.department_id
 * khi user chưa có assignment — không rơi người). Assignment cấp công ty
 * (department NULL) → dept_name = COMPANY_LEVEL_DEPT_NAME + is_company_level = true.
 * `is_manager` = user là head của đơn vị hiệu lực (từ org_assignments, fallback head_id cũ).
 */
export async function getHRSheets(month: number, year: number): Promise<HRSheetRow[]> {
  // Kỳ công: 28/(month-1) → 27/month
  let otStartMonth = month - 1; let otStartYear = year;
  if (otStartMonth < 1) { otStartMonth = 12; otStartYear -= 1; }
  const otStart = `${otStartYear}-${String(otStartMonth).padStart(2,'0')}-28`;
  const otEnd   = `${year}-${String(month).padStart(2,'0')}-27`;

  return query<HRSheetRow>(
    `WITH sent_sheets AS (
       SELECT s.*
       FROM attendance_sheets s
       WHERE s.month = $1 AND s.year = $2
         AND s.sent_to_hr_at IS NOT NULL
     ),
     mgr_ids AS (
       SELECT DISTINCT sent_by_manager_id AS mid
       FROM attendance_sheets
       WHERE month = $1 AND year = $2
         AND sent_to_hr_at IS NOT NULL
         AND sent_by_manager_id IS NOT NULL
     ),
     mgr_sheets AS (
       SELECT s.*
       FROM attendance_sheets s
       JOIN  mgr_ids ON mgr_ids.mid::text = s.user_id::text
       WHERE s.month = $1 AND s.year = $2
         AND s.user_id::text NOT IN (SELECT user_id::text FROM sent_sheets)
     ),
     combined AS (
       SELECT * FROM sent_sheets
       UNION ALL
       SELECT * FROM mgr_sheets
     ),
     enriched AS (
       SELECT
         s.*,
         COALESCE(u.name, s.user_id::text)          AS user_name,
         COALESCE(comp.name, NULLIF(u.company, '')) AS company,
         -- Đơn vị hiệu lực: phân công CHÍNH org_assignments thắng; fallback users.department_id
         CASE WHEN oa.user_id IS NOT NULL THEN oa.department_id::text
              ELSE u.department_id::text END        AS department_id,
         CASE WHEN oa.user_id IS NOT NULL AND oa.department_id IS NULL THEN $5::text
              ELSE d.name END                       AS dept_name,
         (oa.user_id IS NOT NULL AND oa.department_id IS NULL) AS is_company_level,
         COALESCE(oa.manager_id::text, u.manager_id::text)     AS manager_id,
         COALESCE(mgr.name, oa.manager_id::text, u.manager_id::text) AS manager_name,
         COALESCE(
           h.user_id::text,
           CASE WHEN oa.user_id IS NOT NULL AND oa.department_id IS NULL
                THEN comp.head_id::text ELSE d.head_id::text END
         ) AS dept_head_id
       FROM combined s
       JOIN users u ON u.id::text = s.user_id::text
       LEFT JOIN LATERAL (
         SELECT p.user_id, p.company_id, p.department_id, p.manager_id
         FROM org_assignments p
         WHERE p.user_id::text = u.id::text AND p.is_primary AND p.is_active
         ORDER BY (p.company_id::text = u.company_id::text) DESC NULLS LAST, p.created_at DESC
         LIMIT 1
       ) oa ON true
       LEFT JOIN departments d ON d.id::text =
         CASE WHEN oa.user_id IS NOT NULL THEN oa.department_id::text ELSE u.department_id::text END
       LEFT JOIN companies comp ON comp.id::text =
         COALESCE(oa.company_id::text, u.company_id::text, d.company_id::text)
       LEFT JOIN users mgr ON mgr.id::text = COALESCE(oa.manager_id::text, u.manager_id::text)
       LEFT JOIN LATERAL (
         SELECT ha.user_id
         FROM org_assignments ha
         WHERE ha.org_role = 'head' AND ha.is_active
           AND ha.company_id::text = COALESCE(oa.company_id::text, u.company_id::text, d.company_id::text)
           AND ha.department_id::text IS NOT DISTINCT FROM
               CASE WHEN oa.user_id IS NOT NULL THEN oa.department_id::text ELSE u.department_id::text END
           AND ha.sub_department_id IS NULL  -- trưởng PHÒNG, không nhận nhầm trưởng bộ phận con
         ORDER BY ha.is_primary DESC, ha.created_at ASC
         LIMIT 1
       ) h ON true
     ),
     ot_totals AS (
       SELECT
         user_id::text AS uid,
         COALESCE(SUM(evening_hours + night_hours), 0) AS total_ot_hours
       FROM attendance_overtime
       WHERE status = 'approved'
         AND DATE(work_date) >= $3::date
         AND DATE(work_date) <= $4::date
       GROUP BY user_id::text
     )
     SELECT
       c.*,
       (c.dept_head_id IS NOT NULL AND c.dept_head_id = c.user_id::text) AS is_manager,
       COALESCE(ot.total_ot_hours, 0) AS total_ot_hours
     FROM enriched c
     LEFT JOIN ot_totals ot ON ot.uid = c.user_id::text
     ORDER BY company NULLS LAST, dept_name NULLS LAST, is_manager DESC, user_name ASC`,
    [month, year, otStart, otEnd, COMPANY_LEVEL_DEPT_NAME]
  );
}

/** HCNS cập nhật ghi chú cho 1 bảng công */
export async function updateHRNote(sheetId: string, note: string): Promise<void> {
  await execute(
    `UPDATE attendance_sheets SET hr_note = $2, updated_at = NOW() WHERE id = $1::uuid`,
    [sheetId, note || null]
  );
}

/** HCNS chốt bảng công — lock danh sách sheet IDs */
export async function lockSheets(sheetIds: string[], lockedBy: string): Promise<number> {
  if (sheetIds.length === 0) return 0;
  const placeholders = sheetIds.map((_, i) => `$${i + 2}`).join(',');
  return execute(
    `UPDATE attendance_sheets
     SET locked_at = NOW(), locked_by = $1::uuid
     WHERE locked_at IS NULL
       AND id = ANY(ARRAY[${placeholders}]::uuid[])`,
    [lockedBy, ...sheetIds]
  );
}

/** HCNS mở khoá bảng công */
export async function unlockSheets(sheetIds: string[]): Promise<number> {
  if (sheetIds.length === 0) return 0;
  const placeholders = sheetIds.map((_, i) => `$${i + 1}`).join(',');
  return execute(
    `UPDATE attendance_sheets
     SET locked_at = NULL, locked_by = NULL
     WHERE id = ANY(ARRAY[${placeholders}]::uuid[])`,
    sheetIds
  );
}

/** Lấy ảnh chấm công để hiển thị */
export async function getRecordPhoto(
  recordId: string
): Promise<{ photo: Buffer; mime: string } | null> {
  const row = await queryOne<{ photo: Buffer | null; photo_mime: string | null; media_id: string | null }>(
    `SELECT photo, photo_mime, media_id FROM attendance_records WHERE id = $1`,
    [recordId]
  );
  if (!row) return null;
  // Dual-read: có media_id → lấy từ MinIO; không → BYTEA cũ.
  if (row.media_id) {
    const m = await getMediaBuffer(row.media_id);
    if (m) return { photo: m.buffer, mime: m.mimeType || row.photo_mime || 'image/jpeg' };
  }
  if (!row.photo) return null;
  return { photo: row.photo, mime: row.photo_mime ?? 'image/jpeg' };
}
