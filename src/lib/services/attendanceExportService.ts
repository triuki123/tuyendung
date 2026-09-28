import { query } from '@/lib/db';
import type { SheetExportRow } from '@/lib/attendanceExportCatalog';

export type { SheetExportRow };

/**
 * Gom dữ liệu tổng hợp bảng công (1 dòng / nhân viên) theo form DETAIL_fill.
 * Nguồn: users (định danh + chế độ đãi ngộ), attendance_sheets (công),
 * leave_requests (phép), attendance_adjustments (bù công + công đặc biệt),
 * attendance_overtime (tăng ca, phân loại lễ/CN/thường),
 * public_holidays (công chuẩn + ngày lễ), evaluations (trạng thái ĐGTV).
 * Cấu trúc SheetExportRow nằm ở @/lib/attendanceExportCatalog.
 *
 * KỲ CÔNG FADO: 28 tháng trước → 27 tháng này (không theo tháng dương lịch).
 */

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Định dạng Date → 'YYYY-MM-DD' theo giờ địa phương (tránh lệch ngày do UTC). */
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Khoảng kỳ công của tháng/năm: 28 tháng trước → 27 tháng này. */
function payPeriod(month: number, year: number): { start: string; end: string } {
  const pm = month === 1 ? 12 : month - 1;
  const py = month === 1 ? year - 1 : year;
  return { start: `${py}-${pad2(pm)}-28`, end: `${year}-${pad2(month)}-27` };
}

/**
 * Tính công chuẩn & số ngày lễ trong kỳ.
 * - standard: số ngày T2–T7 KHÔNG phải ngày lễ (= công mặc định / công chuẩn)
 * - holidayDays: số ngày lễ rơi vào T2–T7 (ngày lễ Chủ Nhật không tính vì vốn đã nghỉ)
 */
function calcStandardDays(
  startStr: string,
  endStr: string,
  holidaySet: Set<string>
): { standard: number; holidayDays: number } {
  let standard = 0;
  let holidayDays = 0;
  const cur = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  while (cur <= end) {
    const dow = cur.getDay(); // 0 = Chủ Nhật
    if (dow !== 0) {
      if (holidaySet.has(isoLocal(cur))) holidayDays++;
      else standard++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return { standard, holidayDays };
}

/** Nhãn trạng thái ĐGTV theo status của thẻ đánh giá mới nhất. */
const DGTV_LABEL: Record<string, string> = {
  passed: 'Đạt',
  failed: 'Không đạt',
  extended: 'Đã gia hạn',
  evaluated: 'Đã đánh giá',
  pending_signing: 'Chờ đánh giá',
  draft: '',
};

/** Lấy dữ liệu xuất bảng công cho các sheet đã chọn (cùng tháng/năm). */
export async function getSheetsExportData(sheetIds: string[]): Promise<{
  month: number;
  year: number;
  rows: SheetExportRow[];
}> {
  if (!sheetIds.length) return { month: 0, year: 0, rows: [] };

  // 1) Sheet + thông tin user
  const sheets = await query<any>(
    `SELECT s.id AS sheet_id, s.month, s.year, s.total_days, s.total_hours, s.hr_note,
            u.id::text AS user_id, u.name, u.employee_code, u.cost_center_code,
            to_char(u.hire_date, 'YYYY-MM-DD') AS hire_date,
            COALESCE(pos.name, u.position) AS position,
            COALESCE(d.name, u.department) AS department,
            u.employment_type, u.work_location,
            u.bank_account_name, u.bank_account_no, u.bank_name, u.email,
            u.meal_allowance_enabled, u.meal_allowance_rate,
            u.parking_allowance_enabled, u.parking_allowance_rate, u.travel_allowance_rate,
            u.social_insurance_unit, u.social_insurance_base, u.social_insurance_deduction,
            u.salary_entity,
            u.default_full_attendance,
            to_char(u.default_full_attendance_from, 'YYYY-MM-DD') AS default_full_attendance_from
       FROM attendance_sheets s
       JOIN users u ON u.id::text = s.user_id::text
       LEFT JOIN departments d ON d.id::text = u.department_id::text
       LEFT JOIN positions pos ON pos.id::text = u.position_id::text
      WHERE s.id = ANY($1::uuid[])
      ORDER BY u.name ASC`,
    [sheetIds]
  );
  if (!sheets.length) return { month: 0, year: 0, rows: [] };

  const month = Number(sheets[0].month);
  const year = Number(sheets[0].year);
  const { start: pStart, end: pEnd } = payPeriod(month, year);
  const userIds: string[] = sheets.map((s) => s.user_id);

  // 2) Ngày lễ trong kỳ → công chuẩn + ngày lễ (dùng chung toàn công ty)
  const holidays = await query<{ d: string }>(
    `SELECT to_char(date, 'YYYY-MM-DD') AS d FROM public_holidays
      WHERE date BETWEEN $1::date AND $2::date`,
    [pStart, pEnd]
  );
  const holidaySet = new Set(holidays.map((h) => h.d));
  // Công chuẩn prorate theo người: cắt từ max(đầu kỳ, hire_date) → min(cuối kỳ, ngày nghỉ việc).
  // Cache theo cặp mốc (đầu|cuối) để không tính lại cho người cùng khoảng.
  const stdCache = new Map<string, { standard: number; holidayDays: number }>();
  const stdFrom = (effStart: string, effEnd: string) => {
    const key = effStart + '|' + effEnd;
    let v = stdCache.get(key);
    if (!v) {
      v = calcStandardDays(effStart, effEnd, holidaySet);
      stdCache.set(key, v);
    }
    return v;
  };

  // 3) Phép theo loại (gom annual / unpaid / còn lại = chế độ) — theo kỳ công.
  //    applies_to_adjustment = loại "ngày làm việc" (WFH/Công tác) tạo qua luồng nghỉ:
  //    KHÔNG gom vào nghỉ mà route về cột work-mode giống bù công (hợp nhất, theo code).
  const leaves = await query<{ user_id: string; code: string; days: string; applies_to_adjustment: boolean }>(
    `SELECT lr.user_id, lt.code, SUM(lr.total_days) AS days, lt.applies_to_adjustment
       FROM leave_requests lr
       JOIN leave_types lt ON lt.id = lr.leave_type_id
      WHERE lr.user_id = ANY($1::text[]) AND lr.status = 'approved'
        AND lr.start_date BETWEEN $2::date AND $3::date
      GROUP BY lr.user_id, lt.code, lt.applies_to_adjustment`,
    [userIds, pStart, pEnd]
  );

  // 4) Bù công + công đặc biệt (đã duyệt) — nửa buổi (day_part) tính 0.5, cả ngày tính 1.
  const adjustments = await query<{ user_id: string; adjustment_type: string; cnt: string }>(
    `SELECT user_id, adjustment_type,
            SUM(CASE WHEN day_part IS NOT NULL THEN 0.5 ELSE 1 END) AS cnt
       FROM attendance_adjustments
      WHERE user_id = ANY($1::text[]) AND status = 'approved'
        AND work_date BETWEEN $2::date AND $3::date
      GROUP BY user_id, adjustment_type`,
    [userIds, pStart, pEnd]
  );

  // 4b) Ngày công chấm bằng APP ĐIỆN THOẠI — tách ra cột riêng, vẫn tính là ngày công.
  //
  // Hai cái bẫy phải né:
  //  - Duyệt bù công CŨNG chèn attendance_records với type='app' (chỉ có notes, không
  //    ảnh/GPS). Chấm công app thật thì BẮT BUỘC ảnh + GPS → lọc theo photo_mime/lat
  //    để không đếm nhầm ngày bù công thành công điện thoại.
  //  - Ngày dùng CẢ app lẫn vân tay: giữ ở cột vân tay, không tính sang điện thoại,
  //    nếu không tổng ngày công sẽ bị cộng đôi.
  const phoneDays = await query<{ user_id: string; cnt: string }>(
    `SELECT ar.user_id::text AS user_id,
            COUNT(DISTINCT DATE(ar.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')) AS cnt
       FROM attendance_records ar
      WHERE ar.user_id::text = ANY($1::text[])
        AND ar.type = 'app'
        AND (ar.photo_mime IS NOT NULL OR ar.lat IS NOT NULL)
        AND DATE(ar.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh') BETWEEN $2::date AND $3::date
        AND NOT EXISTS (
          SELECT 1
            FROM device_punches dp
            JOIN attendance_machine_mappings m
              ON m.machine_id = dp.machine_id AND m.employee_code = dp.employee_code
             AND dp.punch_time >= m.effective_from
             AND (m.effective_to IS NULL OR dp.punch_time < m.effective_to)
           WHERE m.user_id::text = ar.user_id::text
             AND DATE(dp.punch_time AT TIME ZONE 'Asia/Ho_Chi_Minh')
                 = DATE(ar.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
        )
      GROUP BY ar.user_id::text`,
    [userIds, pStart, pEnd]
  );
  const phoneDayMap = new Map<string, number>(
    phoneDays.map((r) => [r.user_id, Number(r.cnt) || 0])
  );

  // 5) Tăng ca theo từng ngày (để phân loại lễ/CN/thường) — theo kỳ công
  const overtimes = await query<{ user_id: string; work_date: string; evening: string; night: string }>(
    `SELECT user_id, to_char(work_date, 'YYYY-MM-DD') AS work_date,
            COALESCE(evening_hours, 0) AS evening, COALESCE(night_hours, 0) AS night
       FROM attendance_overtime
      WHERE user_id = ANY($1::text[]) AND status = 'approved'
        AND work_date BETWEEN $2::date AND $3::date`,
    [userIds, pStart, pEnd]
  );

  // 6) Trạng thái đánh giá thử việc — thẻ đánh giá mới nhất mỗi người
  const evals = await query<{ employee_id: string; status: string }>(
    `SELECT DISTINCT ON (employee_id) employee_id, status
       FROM evaluations
      WHERE employee_id = ANY($1::text[])
      ORDER BY employee_id, COALESCE(concluded_at, updated_at, created_at) DESC`,
    [userIds]
  );

  // 7) Ngày làm việc cuối (nghỉ việc) — cắt cuối kỳ cho người nghỉ giữa kỳ
  const offboardings = await query<{ user_id: string; lwd: string }>(
    `SELECT DISTINCT ON (user_id) user_id, to_char(last_working_date, 'YYYY-MM-DD') AS lwd
       FROM offboarding_processes
      WHERE user_id = ANY($1::text[]) AND status IN ('in_progress', 'completed')
        AND last_working_date IS NOT NULL
      ORDER BY user_id, last_working_date DESC`,
    [userIds]
  );

  // ── Index để tra cứu nhanh ──
  const leaveMap = new Map<string, { annual: number; unpaid: number; regime: number }>();
  // Ngày "work-mode" tạo qua luồng nghỉ (applies_to_adjustment) — gộp theo code với bù công.
  const wmLeaveMap = new Map<string, Record<string, number>>();
  for (const l of leaves) {
    const days = Number(l.days) || 0;
    if (l.applies_to_adjustment) {
      const cur = wmLeaveMap.get(l.user_id) ?? {};
      cur[l.code] = (cur[l.code] || 0) + days;
      wmLeaveMap.set(l.user_id, cur);
      continue; // KHÔNG tính là nghỉ
    }
    const cur = leaveMap.get(l.user_id) ?? { annual: 0, unpaid: 0, regime: 0 };
    if (l.code === 'annual') cur.annual += days;
    else if (l.code === 'unpaid') cur.unpaid += days;
    else cur.regime += days;
    leaveMap.set(l.user_id, cur);
  }

  const adjMap = new Map<string, Record<string, number>>();
  for (const a of adjustments) {
    const cur = adjMap.get(a.user_id) ?? {};
    cur[a.adjustment_type] = Number(a.cnt) || 0;
    adjMap.set(a.user_id, cur);
  }

  // Phân loại tăng ca theo work_date: lễ → AC, CN (không lễ) → AD, còn lại → AA/AB
  const otMap = new Map<
    string,
    { weekdayEvening: number; weekdayNight: number; holiday: number; sunday: number }
  >();
  for (const o of overtimes) {
    const cur =
      otMap.get(o.user_id) ?? { weekdayEvening: 0, weekdayNight: 0, holiday: 0, sunday: 0 };
    const ev = Number(o.evening) || 0;
    const ni = Number(o.night) || 0;
    const isHoliday = holidaySet.has(o.work_date);
    const isSunday = new Date(o.work_date + 'T00:00:00').getDay() === 0;
    if (isHoliday) {
      cur.holiday += ev + ni;
    } else if (isSunday) {
      cur.sunday += ev + ni;
    } else {
      cur.weekdayEvening += ev;
      cur.weekdayNight += ni;
    }
    otMap.set(o.user_id, cur);
  }

  const evalMap = new Map<string, string>();
  for (const e of evals) evalMap.set(e.employee_id, e.status);

  const offMap = new Map<string, string>();
  for (const o of offboardings) offMap.set(o.user_id, o.lwd);

  const rows: SheetExportRow[] = sheets.map((s) => {
    const lv = leaveMap.get(s.user_id) ?? { annual: 0, unpaid: 0, regime: 0 };
    const aj = adjMap.get(s.user_id) ?? {};
    const ot = otMap.get(s.user_id) ?? { weekdayEvening: 0, weekdayNight: 0, holiday: 0, sunday: 0 };

    // bu_checkin/bu_checkout chỉ bổ sung 1 chiều vân tay còn thiếu → ngày đó vẫn là ngày vân tay thật
    // bu_cong / cong_tac / wfh / lam_theo_ca: hệ thống tạo cả 2 chiều → đã nằm trong total_days
    // → phải trừ ra khỏi cong_van_tay để tránh cộng đôi
    // Công chuẩn theo người: cắt đầu theo hire_date, cắt cuối theo ngày nghỉ việc.
    const hireStr = s.hire_date ? String(s.hire_date).slice(0, 10) : null;
    const lwd = offMap.get(s.user_id);
    const effStart = hireStr && hireStr > pStart ? hireStr : pStart;
    const effEnd = lwd && lwd < pEnd ? lwd : pEnd;
    const std = stdFrom(effStart, effEnd);

    // "Mặc Định Đủ Công" (mig 306): vị trí không phải điểm danh → ngày công = CÔNG CHUẨN,
    // không phụ thuộc sheet.total_days (người này có thể không bao giờ chấm/mở app nên
    // sheet không được refresh). Chỉ áp khi kỳ nằm TỪ mốc hiệu lực trở đi.
    const dfaFrom = s.default_full_attendance_from ? String(s.default_full_attendance_from).slice(0, 10) : null;
    const defaultFull = !!s.default_full_attendance && (!dfaFrom || dfaFrom <= pEnd);
    const totalDays = defaultFull ? std.standard : (Number(s.total_days) || 0);
    const wm = wmLeaveMap.get(s.user_id) ?? {};
    // Bù công + Bù công đặc thù: đều tạo cả 2 chiều, gộp chung vào cột Bù Công
    const buCong    = (aj['bu_cong'] || 0) + (aj['bu_cong_dac_biet'] || 0);
    // Phần bù công (adjustment) — CÓ tạo bản ghi chấm công nên đã nằm trong total_days.
    const adjCongTac = aj['cong_tac'] || 0;
    const adjWfh     = aj['wfh'] || 0;
    const adjLam     = aj['lam_theo_ca'] || 0;
    // Cột hiển thị = bù công + phần tạo qua luồng NGHỈ (leave work-mode) cùng code (hợp nhất).
    const congTac   = adjCongTac + (wm['cong_tac'] || 0);
    const wfh       = adjWfh + (wm['wfh'] || 0);
    const lamTheoCa = adjLam + (wm['lam_theo_ca'] || 0);
    // Work-mode LẠ (code ngoài 3 cột) tạo qua luồng nghỉ → tính công chung (không mất công).
    const wmOther = Object.entries(wm).reduce(
      (acc, [code, d]) => (['cong_tac', 'wfh', 'lam_theo_ca'].includes(code) ? acc : acc + d), 0
    );
    // Vân tay thuần = total_days trừ phần bù công (đã nằm trong total_days) + work-mode lạ từ nghỉ.
    const congThucChamRaw = Math.max(0, totalDays - buCong - adjCongTac - adjWfh - adjLam) + wmOther;
    // Tách ngày chấm bằng APP ra cột riêng. Kẹp trần để không đẩy cột vân tay xuống âm
    // khi dữ liệu lệch (vd ngày app nằm ngoài phạm vi tính total_days).
    const congDienThoai = Math.min(phoneDayMap.get(s.user_id) ?? 0, congThucChamRaw);
    const congVanTay = congThucChamRaw - congDienThoai;

    const mealEnabled = !!s.meal_allowance_enabled;
    const parkEnabled = !!s.parking_allowance_enabled;
    const mealRate = Number(s.meal_allowance_rate) || 0;
    const parkRate = Number(s.parking_allowance_rate) || 0;
    const travelRate = Number(s.travel_allowance_rate) || 0;

    const evalStatus = evalMap.get(s.user_id);
    const dgtv = evalStatus != null ? DGTV_LABEL[evalStatus] ?? '' : null;

    // AG = Vân tay thuần + Công điện thoại + Phép năm + Nghỉ chế độ + Ngày lễ + Công tác
    //      + WFH + Làm theo ca + Bù công
    // (Nghỉ không lương KHÔNG cộng; bu_checkin/bu_checkout đã nằm trong congVanTay)
    // Cộng lại congDienThoai để TỔNG KHÔNG ĐỔI — tách cột chỉ để nhìn, không trừ công.
    const congTinhLuong =
      congVanTay + congDienThoai + lv.annual + lv.regime + std.holidayDays +
      congTac + wfh + lamTheoCa + buCong;

    // Công tính phụ cấp = vân tay + điện thoại + bù công + công tác + làm theo ca
    // WFH không được phụ cấp cơm/xe vì làm ở nhà
    const congTinhPhuCap = congVanTay + congDienThoai + buCong + congTac + lamTheoCa;

    return {
      employee_code: s.employee_code,
      cost_center_code: s.cost_center_code,
      name: s.name,
      hire_date: hireStr,
      position: s.position,
      department: s.department,
      employment_type: s.employment_type,
      work_location: s.work_location,
      bank_account_name: s.bank_account_name,
      bank_account_no: s.bank_account_no,
      bank_name: s.bank_name,
      email: s.email,
      cong_mac_dinh: std.standard,
      cong_van_tay: congVanTay,
      cong_dien_thoai: congDienThoai,
      phep_nam: lv.annual,
      nghi_khong_luong: lv.unpaid,
      nghi_che_do: lv.regime,
      cong_tac: congTac,
      wfh,
      lam_theo_ca: lamTheoCa,
      bu_cong: buCong,
      ngay_le_tet: std.holidayDays,
      tang_ca_thuong: ot.weekdayEvening,
      tang_ca_dem: ot.weekdayNight,
      lam_ngay_le: ot.holiday,
      tang_ca_cn: ot.sunday,
      cong_chuan: std.standard,
      cong_tinh_luong: congTinhLuong,
      thieu_du: congTinhLuong - std.standard,
      cong_tinh_phu_cap: congTinhPhuCap,
      phu_cap_com: mealEnabled ? congTinhPhuCap * mealRate : 0,
      phu_cap_xe: parkEnabled ? congTinhPhuCap * parkRate : 0,
      cong_tac_phi: travelRate * congTac,
      meal_enabled: mealEnabled,
      parking_enabled: parkEnabled,
      social_insurance_unit: s.social_insurance_unit,
      social_insurance_base: s.social_insurance_base != null ? Number(s.social_insurance_base) : null,
      social_insurance_deduction:
        s.social_insurance_deduction != null ? Number(s.social_insurance_deduction) : null,
      salary_entity: s.salary_entity,
      trang_thai_dgtv: dgtv,
      ghi_chu: s.hr_note,
    };
  });

  return { month, year, rows };
}
