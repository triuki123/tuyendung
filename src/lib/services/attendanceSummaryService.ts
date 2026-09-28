import { query, execute } from '@/lib/db';
import { notify } from '@/lib/notifications/engine';
import { resolveAttendanceConfig } from '@/lib/services/attendanceSettingsService';
import { getPayrollPeriodDates, type ResolvedAttendanceConfig } from '@/lib/config/attendanceConfig';

function vnNow(): { year: number; month: number; day: number } {
  const s = new Date().toLocaleString('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  // en-GB format: DD/MM/YYYY
  const [d, m, y] = s.split('/').map(Number);
  return { year: y, month: m, day: d };
}

/** YYYY-MM-DD theo giờ địa phương (server chạy TZ Asia/Ho_Chi_Minh). */
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Số ngày công chuẩn trong kỳ: ngày MỞ theo lịch tuần cấu hình, trừ ngày lễ.
 * Cùng định nghĩa với cột "công chuẩn" của file xuất công.
 */
async function countStandardDays(
  startDate: Date,
  endDate: Date,
  cfg: ResolvedAttendanceConfig
): Promise<number> {
  let holidays = new Set<string>();
  try {
    const rows = await query<{ d: string }>(
      `SELECT to_char(date, 'YYYY-MM-DD') AS d FROM public_holidays
        WHERE date BETWEEN $1::date AND $2::date`,
      [isoLocal(startDate), isoLocal(endDate)]
    );
    holidays = new Set(rows.map(r => r.d));
  } catch { /* chưa có bảng ngày lễ → coi như không có */ }

  let n = 0;
  for (const d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const sch = cfg.weeklySchedule?.[d.getDay()];
    const open = sch ? sch.open : !cfg.weekendDays.includes(d.getDay());
    if (open && !holidays.has(isoLocal(d))) n++;
  }
  return n;
}

/** pg trả NUMERIC/BIGINT dạng chuỗi. Làm tròn 1 số lẻ để hiện "1.5 ngày" gọn. */
function num(v: string | number | null): number {
  const n = Number(v) || 0;
  return Math.round(n * 10) / 10;
}

export async function runAttendanceSummary(): Promise<{ sent: number; skipped: number }> {
  const { year, month, day } = vnNow();
  // Chỉ chạy ngày 1 của tháng
  if (day !== 1) return { sent: 0, skipped: 0 };

  // Tháng báo cáo = tháng trước
  const reportYear = month === 1 ? year - 1 : year;
  const reportMonth = month === 1 ? 12 : month - 1;
  const periodKey = `summary:${reportYear}-${String(reportMonth).padStart(2, '0')}`;
  const monthLabel = `tháng ${reportMonth}/${reportYear}`;

  type UserStat = {
    user_id: string;
    default_full_attendance: boolean | null;
    dfa_from: string | null;
    fingerprint_days: string;
    phone_days: string;
    adjustment_days: string;
    leave_days: string;
    /** Công chuẩn của kỳ — chỉ dùng cho người "Mặc Định Đủ Công". */
    standard_days?: number;
    /** Ngày cuối kỳ công (YYYY-MM-DD) — so với mốc hiệu lực của cờ đủ công. */
    period_end?: string;
  };

  // Mỗi công ty có thể cấu hình kỳ công riêng (mặc định 28 → 27), nên tính theo từng công ty
  // thay vì tháng dương lịch — để con số khớp đúng với Bảng Công mà nhân viên nhìn thấy.
  const companies = await query<{ company_id: string | null }>(
    `SELECT DISTINCT company_id FROM users WHERE status = 'active' AND role != 'super_admin'`
  );

  const stats: UserStat[] = [];
  for (const { company_id } of companies) {
    const cfg = await resolveAttendanceConfig(company_id);
    // Truyền thẳng Date như getUserRecordsByMonth để ranh giới kỳ khớp tuyệt đối với Bảng Công.
    const { startDate, endDate } = getPayrollPeriodDates(reportMonth, reportYear, cfg);

    // Tách 4 nhóm đúng như cách Bảng Công / file xuất công phân loại
    // (xem attendanceExportService: cong_van_tay, cong_dien_thoai, bù công, nghỉ phép).
    //
    //  - VÂN TAY: device_punches chiếu qua mapping SỐNG — KHÔNG nằm trong attendance_records.
    //    Bản cũ chỉ đếm attendance_records nên ai chấm bằng máy vân tay đều ra 0 ngày.
    //  - APP: attendance_records type='app' BẮT BUỘC có ảnh/GPS (bù công cũng chèn type='app'
    //    nhưng không ảnh/GPS → lọc ra để không đếm nhầm), và loại ngày đã có vân tay
    //    để không cộng đôi.
    //  - BÙ CÔNG: attendance_adjustments đã duyệt + loại nghỉ "làm việc" (applies_to_adjustment)
    //    như WFH/Công tác; nửa buổi = 0.5. KHÔNG gồm bu_checkin/bu_checkout vì chúng chỉ bù
    //    một chiều của ngày vân tay có thật (đã đếm ở nhóm vân tay).
    //  - NGHỈ PHÉP: leave_requests đã duyệt, loại nghỉ thật (applies_to_adjustment = false).
    const rows = await query<UserStat>(
      `SELECT u.id AS user_id,
              u.default_full_attendance,
              to_char(u.default_full_attendance_from, 'YYYY-MM-DD') AS dfa_from,
              COALESCE(fp.cnt, 0)          AS fingerprint_days,
              COALESCE(ph.cnt, 0)          AS phone_days,
              COALESCE(aj.cnt, 0) + COALESCE(wm.cnt, 0) AS adjustment_days,
              COALESCE(lv.cnt, 0)          AS leave_days
         FROM users u
         LEFT JOIN LATERAL (
           SELECT COUNT(DISTINCT DATE(dp.punch_time AT TIME ZONE 'Asia/Ho_Chi_Minh')) AS cnt
             FROM device_punches dp
             JOIN attendance_machine_mappings m
               ON m.machine_id = dp.machine_id AND m.employee_code = dp.employee_code
              AND dp.punch_time >= m.effective_from
              AND (m.effective_to IS NULL OR dp.punch_time < m.effective_to)
            WHERE m.user_id = u.id
              AND dp.punch_time AT TIME ZONE 'Asia/Ho_Chi_Minh' BETWEEN $2 AND $3
         ) fp ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(DISTINCT DATE(ar.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')) AS cnt
             FROM attendance_records ar
            WHERE ar.user_id::text = u.id::text
              AND ar.type = 'app'
              AND (ar.photo_mime IS NOT NULL OR ar.lat IS NOT NULL)
              AND ar.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh' BETWEEN $2 AND $3
              AND NOT EXISTS (
                SELECT 1 FROM device_punches dp2
                  JOIN attendance_machine_mappings m2
                    ON m2.machine_id = dp2.machine_id AND m2.employee_code = dp2.employee_code
                   AND dp2.punch_time >= m2.effective_from
                   AND (m2.effective_to IS NULL OR dp2.punch_time < m2.effective_to)
                 WHERE m2.user_id = u.id
                   AND DATE(dp2.punch_time AT TIME ZONE 'Asia/Ho_Chi_Minh')
                       = DATE(ar.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
              )
         ) ph ON TRUE
         LEFT JOIN LATERAL (
           SELECT SUM(CASE WHEN a.day_part IS NOT NULL THEN 0.5 ELSE 1 END) AS cnt
             FROM attendance_adjustments a
            WHERE a.user_id::text = u.id::text AND a.status = 'approved'
              AND a.adjustment_type IN ('bu_cong', 'bu_cong_dac_biet', 'cong_tac', 'wfh', 'lam_theo_ca')
              AND a.work_date BETWEEN $2::date AND $3::date
         ) aj ON TRUE
         LEFT JOIN LATERAL (
           SELECT SUM(lr.total_days) AS cnt
             FROM leave_requests lr
             JOIN leave_types lt ON lt.id = lr.leave_type_id
            WHERE lr.user_id::text = u.id::text AND lr.status = 'approved'
              AND lt.applies_to_adjustment = true
              AND lr.start_date BETWEEN $2::date AND $3::date
         ) wm ON TRUE
         LEFT JOIN LATERAL (
           SELECT SUM(lr.total_days) AS cnt
             FROM leave_requests lr
             JOIN leave_types lt ON lt.id = lr.leave_type_id
            WHERE lr.user_id::text = u.id::text AND lr.status = 'approved'
              AND lt.applies_to_adjustment = false
              AND lr.start_date BETWEEN $2::date AND $3::date
         ) lv ON TRUE
        WHERE u.status = 'active' AND u.role != 'super_admin'
          AND u.company_id IS NOT DISTINCT FROM $1`,
      [company_id, startDate, endDate]
    );

    // Công chuẩn của kỳ (ngày làm việc theo lịch tuần, trừ ngày lễ) — dùng cho người
    // "Mặc Định Đủ Công": họ không chấm công nên 3 nhóm trên đều 0.
    const standard = await countStandardDays(startDate, endDate, cfg);
    const periodEnd = isoLocal(endDate);
    for (const r of rows) { r.standard_days = standard; r.period_end = periodEnd; }
    stats.push(...rows);
  }

  let sent = 0;
  let skipped = 0;

  for (const s of stats) {
    const ins = await execute(
      `INSERT INTO attendance_summary_log (user_id, period_key)
       VALUES ($1, $2)
       ON CONFLICT (user_id, period_key) DO NOTHING`,
      [s.user_id, periodKey]
    );
    // execute() trả về SỐ dòng (không phải object) — bản cũ đọc `.rowCount` nên luôn undefined,
    // chống trùng vô hiệu: scheduler chạy lại trong ngày 1 là gửi lặp cho cùng một người.
    if (ins === 0) { skipped++; continue; }

    const fingerprintDays = num(s.fingerprint_days);
    const phoneDays       = num(s.phone_days);
    const adjustmentDays  = num(s.adjustment_days);
    const leaveDays       = num(s.leave_days);
    // Người "Mặc Định Đủ Công" (mig 306) không điểm danh → ngày công = công chuẩn của kỳ,
    // và dùng mẫu riêng (mode='full') để không liệt kê vân tay/app toàn số 0.
    const dfaFrom = s.dfa_from ? s.dfa_from.slice(0, 10) : null;
    const isFullMode = !!s.default_full_attendance && (!dfaFrom || !s.period_end || dfaFrom <= s.period_end);

    // "Có mặt" = 3 nhóm sinh ra ngày công thật; NGHỈ PHÉP tách riêng, không cộng vào
    // (đúng định nghĩa total_days của Bảng Công — phép là cột riêng).
    const daysPresent = isFullMode
      ? (s.standard_days ?? 0)
      : fingerprintDays + phoneDays + adjustmentDays;

    await notify(
      'attendance.summary',
      {
        mode: isFullMode ? 'full' : 'punch',
        monthLabel, daysPresent, fingerprintDays, phoneDays, adjustmentDays, leaveDays,
      },
      { recipients: [s.user_id] }
    );
    sent++;
  }

  console.log(`[AttendanceSummary] ${periodKey}: ${sent} gửi, ${skipped} bỏ qua`);
  return { sent, skipped };
}
